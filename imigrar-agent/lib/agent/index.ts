import { getRepository } from "@/lib/data";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { runAgent, type AgentTurn, type ToolCallTrace } from "@/lib/agent/runner";
import { computeLeadScore } from "@/lib/agent/lead-score";
import { executeTool } from "@/lib/agent/tools";
import { classifyRouting } from "@/lib/agent/routing-net";
import { avaliarImpasse } from "@/lib/agent/anti-loop";
import { avaliarTransferencia } from "@/lib/agent/transfer-gate";
import { proximoAtendimento } from "@/lib/agent/expediente";
import { capturarDadosDoLead, dossieComercialFaltando } from "@/lib/agent/lead-capture";
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
 * Tudo que já se sabe do contato, destacado no system prompt para a Shayene confirmar em
 * vez de reperguntar.
 *
 * O bloco tem que listar TODO campo que ela pergunta ao longo da qualificação. Escala,
 * tipo de cliente, prazo e duração do contrato já eram gravados no lead e ficavam de fora
 * daqui: a resposta continuava no histórico, mas nada a destacava, e algumas mensagens
 * depois ela perguntava de novo. Ao acrescentar uma pergunta nova à qualificação,
 * acrescente o campo aqui também.
 */
export function buildDadosConhecidosBlock(lead: Lead | null): string {
  if (!lead) return "";
  const known = [
    lead.contactName && `Nome: ${lead.contactName}`,
    lead.companyName && `Empresa: ${lead.companyName}`,
    lead.clientType && `Tipo de cliente: ${lead.clientType}`,
    lead.servicesInterested?.length && `Serviço(s): ${lead.servicesInterested.join(", ")}`,
    lead.employeesNeeded && `Nº de postos: ${lead.employeesNeeded}`,
    lead.schedule && `Escala: ${lead.schedule}`,
    lead.region && `Localização: ${lead.region}`,
    lead.urgency && `Prazo: ${PRAZO_LABEL[lead.urgency] ?? lead.urgency}`,
    lead.contractDuration && `Duração do contrato: ${lead.contractDuration}`,
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
A saudação correta NESTE MOMENTO é "${saudacao}". Se for cumprimentar, use essa e nenhuma outra.
NUNCA copie a saudação que o cliente usou: ele pode escrever "boa noite" de manhã, ou a mensagem dele pode ter chegado horas atrás. Quem manda é o relógio acima.
Só cumprimente na PRIMEIRA mensagem da conversa. No meio de um atendimento que já está rolando, "boa tarde" de novo entrega robô — vá direto ao assunto.
Estamos ${dentroDoExpediente ? "DENTRO" : "FORA"} do horário comercial (Seg a Sex, 08h às 18h).${
    dentroDoExpediente
      ? ""
      : `\nVocê continua atendendo normalmente e resolve o que é seu (cotação, preço, proposta em PDF) na hora, sábado, domingo ou de madrugada — isso não depende de ninguém.\nO que você NÃO faz é prometer retorno imediato de uma PESSOA: não há ninguém no escritório agora. Se precisar envolver alguém do time, diga que ele retorna ${quando} — com essas palavras, não "em instantes" nem "em até 30 minutos".`
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
  try {
    const convBefore = await repo.getConversation(conversationId);
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
        "\n\n════════ ATENÇÃO: o cliente está VOLTANDO após mais de 24h ════════\nCumprimente de novo de forma calorosa e natural (ex.: \"Oi de novo! Que bom te ver por aqui 😊\") e retome o atendimento do começo. Confirme os dados já conhecidos em vez de reperguntar.";
    }
  }

  // Nº de mensagens do cliente até aqui (usado pela rede de segurança de roteamento).
  const userTurns = rawMsgs.filter((m) => m.role === "user").length;
  const lastUserText = [...rawMsgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const allUserText = rawMsgs.filter((m) => m.role === "user").map((m) => m.content).join("  ");

  // COBERTURA: "posto 24h" não é duas pessoas. Em 17/08/2026 a Shayene cotou um posto de
  // 24h como 2 porteiros, sem adicional noturno — metade da mão de obra. A regra está na
  // base de conhecimento, mas conhecimento comprido o modelo às vezes atravessa; quando o
  // cliente FALA de cobertura, a regra vai na cara dele, no turno em que importa.
  const coberturaFalada = detectarCobertura(allUserText);
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

  // FREIO: enquanto ela não tiver feito o mínimo de atendimento (saber com quem fala e
  // ter trocado ao menos uma pergunta), a tool de transferência nem é oferecida — o
  // modelo dispara na primeira frase quando a mensagem toca em contrato, férias ou
  // reclamação. Emergência e pedido explícito por uma pessoa passam sempre.
  const portao = avaliarTransferencia({
    userTurns,
    temNome: !!knownLead?.contactName,
    ultimaMensagem: lastUserText,
  });
  const blockTools = portao.liberado ? undefined : ["transferir_para_humano"];
  if (!portao.liberado) {
    systemPrompt +=
      `\n\n════════ AGORA NÃO É HORA DE ENCAMINHAR ════════\nVocê ainda não pode passar esta conversa para outro setor (${portao.motivo}). Atenda: acolha, entenda quem é a pessoa e o que ela precisa, e colete o que faltar. Não diga que vai encaminhar, não prometa que "o setor entra em contato" — resolva o que dá para resolver agora e pergunte o que falta.`;
  }

  // CANDIDATO A VAGA: sem isto ela responde "manda o currículo para rh@shinerio.com" na
  // segunda mensagem e encerra — sem o nome, sem a função, sem nada. O RH recebe um
  // currículo sem contexto e a pessoa sai com a sensação de ter sido dispensada. Aqui a
  // triagem que falta é dita na hora em que ela está decidindo o que responder.
  const pedeVaga = rawMsgs.some(
    (m) => m.role === "user" && classifyRouting(m.content)?.kind === "candidato",
  );
  if (pedeVaga) {
    const falta = [
      !knownLead?.contactName && "o nome completo",
      !knownLead?.servicesInterested?.length && "para qual função quer se candidatar",
      !knownLead?.region && "de qual cidade/região é",
    ].filter(Boolean);
    const jaMandouCurriculo = rawMsgs.some(
      (m) => m.role === "user" && /📎 Arquivo recebido|curr[íi]culo|curriculum|\bcv\b/i.test(m.content),
    );
    if (falta.length) {
      systemPrompt += `\n\n════════ ESTA PESSOA PROCURA VAGA — ATENDA, NÃO DESPACHE ════════\nAinda falta saber: ${falta.join(", ")}.\nDescubra isso CONVERSANDO, na ordem que a conversa pedir — não faça interrogatório nem peça tudo de uma vez. Comente algo útil sobre a função ou sobre a empresa entre uma coisa e outra, como uma pessoa do time faria. Registre com registrar_dados_lead (setor "rh", stage "novo") conforme for aparecendo, sem avisar que está anotando.\nNÃO mande a pessoa para o e-mail do RH ainda, e não encerre a conversa. O currículo você pede só depois de ter esses dados — e aí ela escolhe se manda aqui pelo WhatsApp ou por e-mail.`;
    } else if (!jaMandouCurriculo) {
      // Triagem completa e nenhum currículo ainda: o próximo passo é pedir o arquivo.
      // Sem isto ela agradece, diz que registrou e a conversa morre sem currículo nenhum.
      systemPrompt += `\n\n════════ TRIAGEM DO CANDIDATO COMPLETA — PEÇA O CURRÍCULO ════════\nVocê já tem nome, função e região desta pessoa. Agora PEÇA o currículo, deixando ela escolher o caminho: pode mandar aqui mesmo pelo WhatsApp, ou por e-mail em rh@shinerio.com. Diga que já deixou tudo registrado com o RH. Não prometa vaga, prazo de retorno nem resultado — isso é decisão do RH.`;
    }
  }

  // ─── TRIAGEM COMERCIAL ANTES DA PROPOSTA ───
  // Uma cotação não começa em "vou te enviar" — começa em saber quem é. Este bloco diz,
  // no momento em que ela decide o que responder, exatamente o que ainda falta para o PDF
  // poder sair, e deixa claro que quem manda a proposta é ela, não o comercial.
  //
  // Vem DEPOIS do bloco do candidato e só vale para lead comercial: mandar quem procura
  // emprego informar CNPJ e e-mail da empresa seria pior do que não ter triagem nenhuma.
  const setorLead = knownLead?.setor ?? "comercial";
  const jaTemProposta = await repo.hasProposalForConversation(conversationId).catch(() => false);
  const faltaNaTriagem = dossieComercialFaltando(knownLead);
  // A rede de roteamento também é consultada aqui (e não só depois da resposta): um
  // colaborador reclamando de escala não pode receber pedido de CNPJ.
  const routed = classifyRouting(lastUserText);
  const ehCotacao = setorLead === "comercial" && !pedeVaga && !routed;
  if (ehCotacao && !jaTemProposta && userTurns >= 1) {
    const depois = faltaNaTriagem.complementares.length
      ? ` Depois que o PDF sair, aí sim você pede o que falta para o cadastro: ${faltaNaTriagem.complementares.join(", ")}.`
      : "";
    systemPrompt += faltaNaTriagem.completo
      ? `\n\n════════ TRIAGEM COMPLETA — MANDE A PROPOSTA AGORA ════════\nVocê já tem tudo que a proposta precisa. Chame gerar_proposta_pdf NESTA RESPOSTA e diga que enviou o PDF. Não pergunte se ele quer receber, não peça CNPJ, não peça e-mail antes e não envolva o comercial.${depois}`
      : `\n\n════════ TRIAGEM DESTE LEAD — O QUE AINDA SEGURA O PDF ════════\nPara a proposta em PDF sair, falta SÓ isto: ${faltaNaTriagem.faltam.join(", ")}.\nPergunte isso e nada além disso — quanto menos passos até o PDF, melhor. Uma coisa por vez, aproveitando o que ele já disse. Assim que a lista zerar, gere a proposta na mesma resposta, sem pedir mais nenhum dado.${depois}\nENQUANTO FALTAR DADO, VOCÊ NÃO ENCAMINHA PARA O COMERCIAL. Quem monta e envia a proposta é você. A tool transferir_para_humano vai recusar mesmo, e dizer ao cliente que "já chamei uma pessoa do comercial" sem ter chamado é o pior desfecho possível.`;
  }

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
