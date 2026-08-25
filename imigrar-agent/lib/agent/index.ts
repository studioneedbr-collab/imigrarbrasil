import { getRepository } from "@/lib/data";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { runAgent, type AgentTurn, type ToolCallTrace } from "@/lib/agent/runner";
import { computeLeadScore } from "@/lib/agent/lead-score";
import { executeTool } from "@/lib/agent/tools";
import { classifyRouting } from "@/lib/agent/routing-net";
import { avaliarImpasse } from "@/lib/agent/anti-loop";
import { avaliarTransferencia } from "@/lib/agent/transfer-gate";
import { proximoAtendimento } from "@/lib/agent/expediente";
import { capturarDadosDoLead, qualificacaoFaltando } from "@/lib/agent/lead-capture";
import { blocoMaterialPara, consultaDoTurno } from "@/lib/agent/rag";
import { buildIdiomaBlock, detectarIdioma, registrarIdioma } from "@/lib/agent/idioma";
import { detectarCobertura, dimensionar, descreverPosto } from "@/lib/agent/dimensionamento";
import type { ConversationStatus, Lead, LeadSetor } from "@/lib/domain/types";

export interface ProcessResult {
  reply: string;
  toolCalls: ToolCallTrace[];
  status: string;
  buttons?: { id: string; label: string }[];
}

// Junta turnos consecutivos do mesmo autor num só — quando o cliente manda várias
// mensagens seguidas (WhatsApp), o histórico tem vários "user" em sequência, e tanto
// o DeepSeek quanto o engine determinístico preferem os papéis alternando.
function mergeConsecutive(turns: AgentTurn[]): AgentTurn[] {
  const out: AgentTurn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content = `${last.content}\n${t.content}`;
    else out.push({ role: t.role, content: t.content });
  }
  return out;
}

const PRAZO_LABEL: Record<string, string> = {
  immediate: "imediato",
  short: "curto prazo",
  medium: "médio prazo",
  long: "longo prazo",
};

/**
 * Tudo que já se sabe do contato, destacado no system prompt para a Ana confirmar em vez
 * de reperguntar.
 *
 * Aqui isso pesa mais do que num atendimento comercial: quem chega assustado e tem que
 * repetir de onde veio, como entrou e o que já tentou, pela terceira vez, desiste. Ao
 * acrescentar uma pergunta nova à qualificação, acrescente o campo aqui também.
 *
 * Os campos são os da estrutura herdada, com a leitura deste domínio: `region` é onde a
 * pessoa está agora, `servicesInterested` é o que ela procura (visto, regularização,
 * refúgio...) e `clientType` guarda a nacionalidade quando ela é dita.
 */
export function buildDadosConhecidosBlock(lead: Lead | null): string {
  if (!lead) return "";
  const known = [
    lead.contactName && `Nome: ${lead.contactName}`,
    lead.clientType && `Nacionalidade: ${lead.clientType}`,
    lead.region && `Onde está agora: ${lead.region}`,
    lead.servicesInterested?.length && `O que procura: ${lead.servicesInterested.join(", ")}`,
    lead.urgency && `Prazo: ${PRAZO_LABEL[lead.urgency] ?? lead.urgency}`,
    lead.contractDuration && `Situação atual: ${lead.contractDuration}`,
    lead.companyName && `Empresa/instituição: ${lead.companyName}`,
    lead.email && `E-mail: ${lead.email}`,
  ].filter(Boolean);
  if (!known.length) return "";
  return `\n\n════════ DADOS JÁ CONHECIDOS DESTE CONTATO (confirme, NÃO pergunte de novo) ════════\n${known.join(" · ")}`;
}

// Bloco "AGORA": data e hora de Brasília + a saudação correta para este momento.
// O DeepSeek não sabe que horas são; sem isto ele espelha a saudação que o cliente
// usou (ou chuta), e a Shayene acaba dando "boa noite" às 9h da manhã.
export function buildAgoraBlock(now: Date): string {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(now);
  const hora = Number(fmt({ hour: "2-digit", hourCycle: "h23" }));
  const saudacao = hora < 12 ? "bom dia" : hora < 18 ? "boa tarde" : "boa noite";
  const diaSemana = fmt({ weekday: "long" });
  const data = fmt({ day: "2-digit", month: "2-digit", year: "numeric" });
  const relogio = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // Seg–Sex 08h–18h. O dia da semana vem do fuso de Brasília, não do servidor: na Vercel
  // o processo roda em UTC, e às 22h de sexta no Rio o `getDay()` já dizia sábado.
  const { dentroDoExpediente, quando } = proximoAtendimento(now);

  return `\n\n════════ AGORA (horário de Brasília — use isto, não chute) ════════
Hoje é ${diaSemana}, ${data}, e agora são ${relogio}.
A saudação correta NESTE MOMENTO é "${saudacao}" — traduzida para o idioma da conversa. Se for cumprimentar, use essa e nenhuma outra.
NUNCA copie a saudação que a pessoa usou: ela pode escrever "boa noite" de manhã, ou a mensagem dela pode ter chegado horas atrás — e quem escreve de outro fuso erra isso o tempo todo. Quem manda é o relógio acima.
Só cumprimente na PRIMEIRA mensagem da conversa. No meio de um atendimento que já está rolando, "boa tarde" de novo entrega robô — vá direto ao assunto.
Estamos ${dentroDoExpediente ? "DENTRO" : "FORA"} do horário de atendimento humano (Seg a Sex, 08h às 18h).${
    dentroDoExpediente
      ? ""
      : `\nVocê continua atendendo normalmente: acolher e informar o que é informação geral não depende de ninguém estar no escritório, e quem escreve de madrugada costuma estar com medo justamente por isso.\nO que você NÃO faz é prometer retorno imediato de uma PESSOA: não há ninguém no escritório agora. Ao encaminhar para o time jurídico, diga que eles retornam ${quando} — com essas palavras, não "em instantes" nem "em até 30 minutos".`
  }`;
}

// Salva a mensagem do cliente e responde na sequência (simulador / caminho síncrono).
export async function processMessage({
  conversationId,
  userText,
  whatsappMessageId,
}: {
  conversationId: string;
  userText: string;
  /** Id da mensagem (Meta/Z-API). Gravado para deduplicar reentregas do webhook. */
  whatsappMessageId?: string;
}): Promise<ProcessResult> {
  const repo = getRepository();
  await repo.addMessage(conversationId, "user", userText, whatsappMessageId);
  return respondToConversation(conversationId);
}

// Roda o agente sobre o histórico ATUAL da conversa e responde. Não adiciona a
// mensagem do usuário — usado pelo webhook depois de AGRUPAR as mensagens do lote.
export async function respondToConversation(conversationId: string): Promise<ProcessResult> {
  const repo = getRepository();

  // LEAD ENVIOU MENSAGEM: reabre se estava inativa (retomando do histórico, nunca do zero),
  // reativa se estava aguardando, e marca a atividade. Envolto em try/catch para que uma
  // coluna/constraint ausente (migration 008 ainda não aplicada) nunca derrube a resposta.
  // A conversa lida aqui é reaproveitada mais abaixo (idioma do contato) — sem isto seria
  // uma segunda ida ao banco por turno, em serverless, só para ler uma coluna.
  let convBefore: Awaited<ReturnType<typeof repo.getConversation>> = null;
  try {
    convBefore = await repo.getConversation(conversationId);
    if (convBefore) {
      if (convBefore.status === "inactive") {
        await repo.updateConversation(conversationId, {
          status: "active",
          followupSentAt: null,
          reopenedAt: new Date().toISOString(),
        });
      } else if (convBefore.status === "waiting") {
        await repo.updateConversationStatus(conversationId, "active");
      }
      await repo.updateLastMessageAt(conversationId);
    }
  } catch (err) {
    console.error("[agent] status (reabertura) falhou:", err instanceof Error ? err.message : err);
  }

  const rawMsgs = await repo.listMessages(conversationId);
  const raw = rawMsgs.map((m) => ({ role: m.role, content: m.content }));
  const history = mergeConsecutive(raw);
  let systemPrompt = await getSystemPrompt();

  // QUE HORAS SÃO: o modelo não tem noção de tempo. Sem este bloco ela dava "boa noite"
  // às 9h da manhã — porque copiava a saudação da última mensagem do cliente em vez de
  // olhar o relógio. O horário vai explícito, em Brasília, junto da saudação correta.
  systemPrompt += buildAgoraBlock(new Date());

  // Reinício após 24h: se o cliente sumiu por mais de 24h e voltou, a Shayene recomeça
  // a saudação (mas aproveita os dados já conhecidos para confirmar, não reperguntar).
  if (rawMsgs.length >= 2) {
    const last = new Date(rawMsgs[rawMsgs.length - 1].createdAt).getTime();
    const prev = new Date(rawMsgs[rawMsgs.length - 2].createdAt).getTime();
    if (last - prev > 24 * 3600 * 1000) {
      systemPrompt +=
        "\n\n════════ ATENÇÃO: esta pessoa está VOLTANDO após mais de 24h ════════\nCumprimente de novo, de forma curta e natural, NO IDIOMA DA CONVERSA, e retome de onde parou. Confirme o que já se sabe em vez de reperguntar — ela já contou a história dela uma vez.";
    }
  }

  // Nº de mensagens do cliente até aqui (usado pela rede de segurança de roteamento).
  const userTurns = rawMsgs.filter((m) => m.role === "user").length;
  const lastUserText = [...rawMsgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const allUserText = rawMsgs.filter((m) => m.role === "user").map((m) => m.content).join("  ");

  // COBERTURA DE POSTO — herança do motor de precificação, que continua no sistema.
  //
  // O bloco só entra quando a conversa é REALMENTE de dimensionamento de posto. Sem esse
  // segundo filtro, "meu visto vence em 24h" acionava o detector e a Ana recebia, no meio
  // de um atendimento de imigração, um bloco falando de porteiro na escala 12x36.
  const falaDePosto = /\b(posto|portaria|porteir|vigia|zelador|asg|limpeza|faxin|recep[çc]ion|escala)\b/i.test(
    allUserText,
  );
  const coberturaFalada = falaDePosto ? detectarCobertura(allUserText) : null;
  if (coberturaFalada) {
    const dim = dimensionar(coberturaFalada);
    systemPrompt +=
      `\n\n════════ ATENÇÃO: o cliente descreveu COBERTURA DE POSTO ════════\n` +
      `Ele falou de ${descreverPosto(dim)}. Um posto assim NÃO é uma pessoa nem duas.\n` +
      `Ao cotar: employees_count = quantidade de POSTOS e cobertura = "${coberturaFalada}". ` +
      `NÃO multiplique por ${dim.funcionariosPorPosto} de cabeça, NÃO marque adicionais.noturno junto e ` +
      `NÃO cote como se fosse ${dim.turnos.length} pessoa(s) — o sistema dimensiona e aplica o adicional noturno pela CCT. ` +
      `Confirme com o cliente se é isso mesmo que ele precisa antes de fechar o valor, e pergunte se haverá rendição no intervalo.`;
  }

  // O DOSSIÊ NÃO DEPENDE MAIS DO MODELO LEMBRAR DA TOOL. Antes, quando o DeepSeek não
  // chamava registrar_dados_lead — e ele esquece direto —, o painel ficava em
  // "Coletando…" enquanto o cliente já tinha dito serviço, quantidade e região. Aqui a
  // leitura é determinística, roda a todo turno e só preenche o que está vazio.
  let knownLead = await repo.getLeadByConversation(conversationId);
  try {
    const patch = capturarDadosDoLead(allUserText, knownLead);
    if (patch) knownLead = await repo.upsertLead(conversationId, patch);
  } catch (err) {
    console.error("[agent] captura automática do lead falhou:", err instanceof Error ? err.message : err);
  }

  // Injeta o que já se sabe deste contato — a Shayene confirma em vez de reperguntar.
  systemPrompt += buildDadosConhecidosBlock(knownLead);

  // IDIOMA. A regra de responder na língua de quem escreveu já é a REGRA ABSOLUTA 1 do
  // DeepSeek. O que ela não cobre é a MEMÓRIA: quem escreveu quatro mensagens em espanhol
  // e mandou só "ok" agora continua sendo atendido em espanhol, e o material oficial que
  // chega no prompt está todo em português. O idioma fica gravado no contato — é o mesmo
  // dado que o follow-up automático e o atendente humano do painel usam.
  const idiomaDetectado = detectarIdioma(lastUserText);
  systemPrompt += buildIdiomaBlock(idiomaDetectado ?? convBefore?.idioma);
  if (idiomaDetectado) await registrarIdioma(conversationId, idiomaDetectado);

  // FREIO DE ENCAMINHAMENTO — bem mais frouxo do que num atendimento comercial.
  //
  // Aqui o que segura é só o reflexo de despachar quem mandou um "oi": a primeira mensagem
  // sozinha não vira transbordo. Qualquer sinal do domínio (situação irregular, processo,
  // refúgio, risco, honorários, aflição) libera na hora, mesmo sem saber o nome de quem
  // fala — quem está com medo não se apresenta antes de pedir ajuda.
  const portao = avaliarTransferencia({
    userTurns,
    temNome: !!knownLead?.contactName,
    ultimaMensagem: lastUserText,
  });
  const blockTools = portao.liberado ? undefined : ["transferir_para_humano"];
  if (!portao.liberado) {
    systemPrompt +=
      `\n\n════════ ANTES DE ENCAMINHAR, ATENDA ════════\nEsta conversa ainda não tem nada que exija um advogado (${portao.motivo}). Acolha, se apresente em uma linha e pergunte o que a pessoa precisa. Não diga que vai encaminhar e não prometa que "o time entra em contato" — ainda não há caso nenhum para encaminhar. Assim que aparecer caso concreto, prazo, irregularidade, refúgio ou pedido de valores, aí sim o encaminhamento é o certo.`;
  }

  // QUEM PROCURA EMPREGO NA PRÓPRIA IMIGRAR BRASIL. É raro, mas acontece — e a diferença
  // entre isso e "quero trabalhar no Brasil" (que é atendimento de imigração, não vaga) é
  // exatamente o que a rede de roteamento aprendeu a separar. Ver lib/agent/routing-net.ts.
  const pedeVaga = rawMsgs.some(
    (m) => m.role === "user" && classifyRouting(m.content)?.kind === "candidato",
  );
  if (pedeVaga) {
    systemPrompt += `\n\n════════ ESTA PESSOA PROCURA VAGA NA IMIGRAR BRASIL ════════\nIsto NÃO é atendimento de imigração — é candidatura a emprego aqui na assessoria. Atenda com o mesmo cuidado: pergunte o nome e a área em que ela atua, registre com registrar_dados_lead (setor "rh", stage "novo") sem avisar que está anotando, e diga que passa para quem cuida disso. Não prometa vaga, prazo nem retorno, e NÃO peça currículo por conta própria.\nCUIDADO PARA NÃO CONFUNDIR: quem diz "quero trabalhar no Brasil", "posso trabalhar com esse visto?" ou "preciso de autorização para trabalhar" está falando de IMIGRAÇÃO. Isso é atendimento normal seu, nunca vaga de emprego.`;
  }

  // ─── QUALIFICAÇÃO PARA O TIME JURÍDICO ───
  // O advogado que pegar esta conversa precisa saber de onde a pessoa é, onde ela está,
  // como entrou, o que quer e se há prazo. Este bloco diz, no turno em que a Ana está
  // decidindo o que responder, o que ainda falta — e insiste em UMA pergunta por vez,
  // porque a mesma lista perguntada de enfiada vira interrogatório com quem já chega com
  // medo de estar sendo fiscalizado.
  const setorLead = knownLead?.setor ?? "comercial";
  const jaTemProposta = await repo.hasProposalForConversation(conversationId).catch(() => false);
  const faltaNaTriagem = qualificacaoFaltando(knownLead);
  // A rede de roteamento também é consultada aqui (e não só depois da resposta): quem
  // procura vaga na assessoria não recebe pergunta sobre nacionalidade e prazo de visto.
  const routed = classifyRouting(lastUserText);
  const ehAtendimentoMigratorio = setorLead === "comercial" && !pedeVaga && !routed;
  if (ehAtendimentoMigratorio && userTurns >= 1) {
    systemPrompt += faltaNaTriagem.completo
      ? `\n\n════════ QUALIFICAÇÃO COMPLETA ════════\nVocê já sabe o que o time jurídico precisa para pegar este caso. Não pergunte mais nada de cadastro: ou você informa algo útil com o material oficial que tiver, ou encaminha (avisando e confirmando antes).`
      : `\n\n════════ O QUE O TIME JURÍDICO AINDA NÃO SABE ════════\nFalta descobrir: ${faltaNaTriagem.faltam.join(", ")}.\nIsto NÃO é a ordem das perguntas nem uma lista para despejar: é o que você precisa saber ao longo da conversa. Faça UMA pergunta por vez, na ordem que a conversa pedir, aproveitando o que a pessoa já contou sozinha, e comente algo útil entre uma coisa e outra. Se ela não quiser responder alguma, siga em frente sem insistir.\nNão segure o encaminhamento por causa desta lista: caso concreto, prazo correndo, situação irregular ou risco vão para o time jurídico mesmo com a lista pela metade.`;
  }

  // ─── MATERIAL OFICIAL (RAG) ───
  // O bloco entra POR ÚLTIMO, logo antes da chamada: é o que o modelo mais precisa ter
  // fresco quando decide a resposta. A recuperação é determinística e roda a todo turno
  // — não depende de o modelo lembrar de chamar `buscar_material_oficial`, pelo mesmo
  // motivo que o dossiê do lead deixou de depender disso.
  //
  // Sem Supabase, sem provedor de embeddings ou sem trecho relevante, `blocoMaterialPara`
  // devolve "" e nada muda: a Ana diz que não tem a informação e encaminha, que é o
  // comportamento que o prompt já manda — e é o comportamento SEGURO.
  const mensagensDoCliente = rawMsgs.filter((m) => m.role === "user").map((m) => m.content);
  systemPrompt += await blocoMaterialPara(consultaDoTurno(mensagensDoCliente));

  const { reply: rawReply, toolCalls, source } = await runAgent({
    systemPrompt,
    history,
    conversationId,
    blockTools,
  });

  // Botões de resposta rápida (enviar_opcoes): a pergunta da tool vira uma mensagem
  // com botões. Usa a mensagem da tool como texto e ignora um reply redundante.
  let reply = rawReply;
  let buttons: { id: string; label: string }[] | undefined;
  const btnTool = toolCalls.find((t) => t.name === "enviar_opcoes");
  if (btnTool) {
    const inp = btnTool.input as { message?: string; opcoes?: unknown };
    const opts = Array.isArray(inp.opcoes) ? inp.opcoes.map(String).filter(Boolean).slice(0, 3) : [];
    if (opts.length) {
      buttons = opts.map((label, idx) => ({ id: String(idx + 1), label }));
      if (inp.message && inp.message.trim()) reply = inp.message.trim();
    }
  }

  // REDE DE SEGURANÇA de roteamento: cobre o que o DeepSeek deixar passar. Se a mensagem
  // casa com um padrão CLARO (colaborador alocado, funcionário interno, candidato) e o
  // modelo não disparou a tool certa, o sistema força o encaminhamento e assume a resposta.
  const alreadyTransferred = toolCalls.some((t) => t.name === "transferir_para_humano");
  // A rede é só um BACKSTOP e age TARDE de propósito: os primeiros turnos são a triagem
  // natural da Shayene (acolher, entender quem é, coletar nome/CPF/o que precisa). A partir
  // do 3º turno do cliente — antes disso ela ainda está entendendo o caso, e encaminhar aí
  // é o que fazia o atendimento parecer apressado — se ela ainda não encaminhou um caso
  // CLARO de operacional (colaborador alocado) ou DP (folha/salário), a rede garante o
  // encaminhamento. CANDIDATO fica fora da rede: o modelo conduz.
  // Efeitos colaterais em best-effort; o push + override do reply acontecem quando a rede age.
  if (
    userTurns >= 3 &&
    routed &&
    (routed.kind === "operacional" || routed.kind === "departamento_pessoal") &&
    !alreadyTransferred
  ) {
    await executeTool("transferir_para_humano", {
      conversation_id: conversationId,
      reason: routed.reason,
      summary: lastUserText,
      setor: routed.setor,
    }).catch((err) => console.error("[routing-net] transferir:", err instanceof Error ? err.message : err));
    // Marca como SOLICITAÇÃO (não lead comercial) na pipeline do setor certo.
    await repo.upsertLead(conversationId, { setor: routed.setor, stage: "transferido" }).catch(() => {});
    toolCalls.push({ name: "transferir_para_humano", input: { setor: routed.setor, reason: routed.reason }, result: { ok: true, net: true } });
    reply = routed.handoffMsg;
    buttons = undefined;
  }

  // CANDIDATO A VAGA — lado do CRM: mesmo que o modelo não chame tool nenhuma, a pessoa
  // entra no funil do RH. Antes ela respondia o e-mail do RH e o candidato sumia.
  const jaTemSetor = toolCalls.some(
    (t) => t.name === "registrar_dados_lead" && !!(t.input as { setor?: string })?.setor,
  );
  if (pedeVaga && !alreadyTransferred && !jaTemSetor) {
    const leadAtual = await repo.getLeadByConversation(conversationId).catch(() => null);
    // Não sequestra lead comercial nem de outro setor já definido.
    if (!leadAtual?.setor || leadAtual.setor === "rh") {
      await repo
        .upsertLead(conversationId, { setor: "rh", stage: leadAtual?.stage ?? "novo" })
        .catch((err) => console.error("[routing-net] candidato→rh:", err instanceof Error ? err.message : err));
    }
  }

  // TRAVOU REPETINDO A MESMA RESPOSTA: sinal de que ela esbarrou em algo que não sabe
  // resolver (evento por diária, função sem preço, pedido fora do padrão). Insistir na
  // mesma mensagem é o pior desfecho possível — o cliente confirma, ela repergunta, e a
  // proposta nunca sai. Aqui a conversa é entregue a uma pessoa, com dossiê — do SETOR
  // desta conversa: mandar um candidato a vaga para o comercial ouvir sobre "valores
  // exatos" é pior do que não encaminhar nada.
  const respostasAnteriores = [...rawMsgs]
    .reverse()
    .filter((m) => m.role === "assistant")
    .map((m) => m.content);
  const setorDaConversa: LeadSetor = pedeVaga
    ? "rh"
    : (routed?.setor ?? knownLead?.setor ?? "comercial");
  const janela = proximoAtendimento(new Date());
  const impasse = avaliarImpasse({
    novaResposta: reply,
    respostasAnteriores,
    ultimaMensagemDoCliente: lastUserText,
    setor: setorDaConversa,
    fonte: source,
    jaTransferiu: toolCalls.some((t) => t.name === "transferir_para_humano"),
    // No comercial, travar não chama ninguém: falta dado na triagem, e a saída é
    // perguntar o que falta e mandar o PDF.
    jaTemProposta,
    faltamNoDossie: faltaNaTriagem.faltam,
    proximoRetorno: janela.dentroDoExpediente ? undefined : janela.quando,
  });
  if (impasse?.acao === "encaminhar") {
    await executeTool("transferir_para_humano", {
      conversation_id: conversationId,
      reason: impasse.motivo,
      summary: lastUserText,
      setor: impasse.setor,
      priority: impasse.priority,
    }).catch((err) => console.error("[anti-loop] transferir:", err instanceof Error ? err.message : err));
    toolCalls.push({ name: "transferir_para_humano", input: { setor: impasse.setor, reason: impasse.motivo }, result: { ok: true, antiLoop: true } });
    reply = impasse.msg;
    buttons = undefined;
  } else if (impasse?.acao === "destravar") {
    // Nada é encaminhado: a mensagem sai pedindo o que falta, e a conversa continua com ela.
    console.log(`[anti-loop] ${impasse.motivo} (conversa ${conversationId})`);
    reply = impasse.msg;
    buttons = undefined;
  }

  await repo.addMessage(conversationId, "assistant", reply);

  const transferred = toolCalls.some((t) => t.name === "transferir_para_humano");
  const proposalMade = toolCalls.some((t) => t.name === "gerar_proposta_pdf");
  const desqualificado = toolCalls.some(
    (t) => t.name === "registrar_dados_lead" && (t.input as { stage?: string })?.stage === "desqualificado",
  );
  // SHAYENE RESPONDEU: define o status do ciclo de vida da conversa.
  // proposta → negociando · transferência → transferida · desqualificado → finalizada ·
  // caso contrário → aguardando resposta do lead (o cron cuida do follow-up de 24h).
  const status: ConversationStatus = transferred
    ? "transferred"
    : proposalMade
      ? "negotiating"
      : desqualificado
        ? "finished"
        : "waiting";
  // try/catch: sem a migration 008 o CHECK antigo rejeitaria 'waiting'/'negotiating';
  // isso não pode impedir a Shayene de responder.
  try {
    await repo.updateConversationStatus(conversationId, status);
    await repo.updateLastMessageAt(conversationId);
  } catch (err) {
    console.error("[agent] status (resposta) falhou:", err instanceof Error ? err.message : err);
  }
  const conv = await repo.getConversation(conversationId);

  // Lead score + funil: computa o score e persiste na CONVERSA (antes ficava sempre 0
  // na lista de Conversas) e move o lead no Kanban — 'orçado' quando gera proposta,
  // 'qualificado' quando o score sobe. Sem isto o CRM não reagia ao atendimento.
  try {
    const msgs = await repo.listMessages(conversationId);
    const lead = await repo.getLeadByConversation(conversationId);
    const { score } = computeLeadScore({ messages: msgs, lead });
    if (conv && conv.leadScore !== score) {
      await repo.updateConversation(conversationId, { leadScore: score });
    }
    if (lead) {
      // Não mexe em estágios "finais" definidos manualmente ou pela Shayene
      // (desqualificado/perdido/ganho/transferido) — a automação não os sobrescreve.
      const terminal = ["desqualificado", "perdido", "ganho", "transferido"];
      let stage = lead.stage;
      if (!terminal.includes(lead.stage ?? "novo")) {
        if (proposalMade) stage = "orcado";
        else if (score >= 45 && (!lead.stage || lead.stage === "novo")) stage = "qualificado";
      }
      if (stage !== lead.stage || lead.score !== score) {
        await repo.upsertLead(conversationId, { score, stage });
      }
    }
  } catch (err) {
    console.error("[agent] falha ao atualizar lead score/funil:", err instanceof Error ? err.message : err);
  }

  return { reply, toolCalls, status, buttons };
}
