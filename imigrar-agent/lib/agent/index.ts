import { getRepository } from "@/lib/data";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { runAgent, type AgentTurn, type ToolCallTrace } from "@/lib/agent/runner";
import { computeLeadScore } from "@/lib/agent/lead-score";
import { executeTool } from "@/lib/agent/tools";
import { classifyRouting } from "@/lib/agent/routing-net";
import { avaliarImpasse } from "@/lib/agent/anti-loop";
import { avaliarConfirmacao, avaliarTransferencia } from "@/lib/agent/transfer-gate";
import { revisarTurno } from "@/lib/agent/verificador-de-saida";
import { proximoAtendimento } from "@/lib/agent/expediente";
import { capturarDadosDoLead, qualificacaoFaltando } from "@/lib/agent/lead-capture";
import { blocoMaterialPara, consultaDoTurno } from "@/lib/agent/rag";
import { buildIdiomaBlock, registrarIdioma } from "@/lib/agent/idioma";
import { idiomaDaConversaOuModelo } from "@/lib/agent/idioma-modelo";
import { useDeepseek } from "@/lib/env";
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

  // ─────────────────────────────────────────────────────────────────────────
  // A FICHA INTEIRA, e não os seis campos herdados.
  //
  // O bloco listava nome, nacionalidade (em `clientType`), região, serviços, urgência,
  // situação, empresa e e-mail — os campos da estrutura comercial que originou este
  // código. Só que a ficha deste produto cresceu: `nacionalidade`, `localizacao`,
  // `objetivo`, `modalidadeProvavel`, `intencao`, o sinal de prazo e a data confirmada
  // por um humano são campos PRÓPRIOS, e nenhum deles chegava aqui.
  //
  // O efeito era exatamente o que a tela promete que não acontece: a pessoa dizia que
  // recebeu multa, o atendente ligava, confirmava a data limite e gravava na ficha — e
  // na mensagem seguinte a Ana perguntava de novo se havia algum prazo. Quem está com
  // medo e repete a mesma resposta pela terceira vez desiste do atendimento.
  //
  // O QUE NÃO ENTRA: número de documento. `situacaoDocumental` e `contractDuration` já
  // vêm limpos por `semNumeroDeDocumento` (lib/agent/lead-capture.ts), e nada aqui
  // reintroduz CPF, passaporte ou protocolo no prompt.
  // ─────────────────────────────────────────────────────────────────────────
  const onde =
    lead.localizacao === "brasil"
      ? `no Brasil${lead.region ? ` — ${lead.region}` : ""}`
      : lead.localizacao === "exterior"
        ? `no exterior${lead.paisExterior ? ` — ${lead.paisExterior}` : ""}`
        : lead.region ?? null;

  const prazo = lead.prazoDataLimite
    ? `Prazo processual: data limite ${lead.prazoDataLimite} JÁ CONFIRMADA pelo time — não pergunte de novo e não recalcule`
    : lead.temPrazoCorrendo
      ? `Prazo processual: ${lead.prazoTipo ? PRAZO_TIPO_CONHECIDO[lead.prazoTipo] ?? "sinalizado" : "sinalizado"} — o time vai confirmar a data com ela; não calcule prazo`
      : null;

  const known = [
    lead.contactName && `Nome: ${lead.contactName}`,
    (lead.nacionalidade ?? lead.clientType) &&
      `Nacionalidade: ${lead.nacionalidade ?? lead.clientType}`,
    onde && `Onde está agora: ${onde}`,
    lead.objetivo && `O que ela quer conseguir: ${lead.objetivo}`,
    lead.servicesInterested?.length && `O que procura: ${lead.servicesInterested.join(", ")}`,
    lead.modalidadeProvavel && `Caminho provável (hipótese interna, não diga a ela): ${lead.modalidadeProvavel}`,
    lead.urgency && `Urgência: ${PRAZO_LABEL[lead.urgency] ?? lead.urgency}`,
    prazo,
    lead.relogioDoCaso && `O que pressiona o caso: ${lead.relogioDoCaso}`,
    lead.intencao && `Intenção declarada: ${INTENCAO_CONHECIDA[lead.intencao] ?? lead.intencao} — já perguntada, NÃO pergunte de novo`,
    lead.situacaoDocumental && `Situação documental: ${lead.situacaoDocumental}`,
    lead.contractDuration && `Como entrou / o que tem hoje: ${lead.contractDuration}`,
    lead.entradaControleMigratorio && "Entrou pelo controle migratório (ela contou)",
    lead.documentosPossui && `Documentos que tem: ${lead.documentosPossui}`,
    lead.documentosFaltantes && `Documentos que faltam: ${lead.documentosFaltantes}`,
    lead.vinculoFamiliarBrasil && `Vínculo familiar no Brasil: ${lead.vinculoFamiliarBrasil}`,
    lead.email && `E-mail: ${lead.email}`,
  ].filter(Boolean);
  if (!known.length) return "";
  return `\n\n════════ DADOS JÁ CONHECIDOS DESTE CONTATO (confirme, NÃO pergunte de novo) ════════\n${known.join(" · ")}`;
}

/** Rótulos legíveis para o prompt — o código interno não diz nada ao modelo. */
const PRAZO_TIPO_CONHECIDO: Record<string, string> = {
  multa: "multa migratória",
  indeferimento: "indeferimento",
  notificacao_saida: "notificação de saída",
  outro: "sinalizado",
};

const INTENCAO_CONHECIDA: Record<string, string> = {
  contratar: "quer que o escritório conduza",
  sozinho: "prefere tocar o processo sozinha",
  sem_condicoes: "declarou não ter condições de pagar",
};

// Bloco "AGORA": data e hora de Brasília + a saudação correta para este momento.
// O DeepSeek não sabe que horas são; sem isto ele espelha a saudação que a pessoa
// usou (ou chuta), e a Ana acaba dando "boa noite" às 9h da manhã — o que é ainda mais
// fácil de acontecer aqui, onde metade de quem escreve está em outro fuso.
export function buildAgoraBlock(now: Date): string {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(now);
  const hora = Number(fmt({ hour: "2-digit", hourCycle: "h23" }));
  // A MADRUGADA É "BOA NOITE". O corte em `hora < 12` mandava dar bom dia à 1h da manhã —
  // e quem escreve de madrugada para uma assessoria de imigração é justamente quem está
  // sem dormir com um prazo correndo.
  const saudacao =
    hora < 5 ? "boa noite" : hora < 12 ? "bom dia" : hora < 18 ? "boa tarde" : "boa noite";
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

/**
 * Roda o agente sobre o histórico ATUAL da conversa e responde. Não adiciona a
 * mensagem do usuário — usado pelo webhook depois de AGRUPAR as mensagens do lote.
 *
 * MODO SOMBRA (`sombra: true`): o agente pensa igual, mas a resposta NÃO entra no
 * histórico da conversa e o status do ciclo de vida não muda. É a diferença entre gravar
 * um rascunho e mentir para o próprio agente: uma mensagem "assistant" gravada sem ter
 * sido enviada faz o turno seguinte acreditar que a pessoa já leu aquilo, e a partir daí
 * toda a conversa está apoiada numa coisa que não aconteceu. O rascunho é gravado pelo
 * chamador, em `rascunhos_agente`.
 */
export async function respondToConversation(
  conversationId: string,
  opts: { sombra?: boolean } = {},
): Promise<ProcessResult> {
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

  // Reinício após 24h: se a pessoa sumiu por mais de 24h e voltou, a Ana recomeça
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

  // O DOSSIÊ NÃO DEPENDE DO MODELO LEMBRAR DA TOOL. Quando o DeepSeek não chama
  // registrar_dados_lead — e ele esquece direto —, o painel ficava em "Coletando…"
  // enquanto a pessoa já tinha dito a nacionalidade, onde está e o que precisa. Aqui a
  // leitura é determinística (lib/agent/triagem.ts), roda a todo turno e só preenche o
  // que está vazio.
  let knownLead = await repo.getLeadByConversation(conversationId);
  try {
    const patch = capturarDadosDoLead(allUserText, knownLead);
    if (patch) knownLead = await repo.upsertLead(conversationId, patch);
  } catch (err) {
    console.error("[agent] captura automática do lead falhou:", err instanceof Error ? err.message : err);
  }

  // Injeta o que já se sabe deste contato — a Ana confirma em vez de reperguntar.
  systemPrompt += buildDadosConhecidosBlock(knownLead);

  // IDIOMA. A regra de responder na língua de quem escreveu já é a REGRA ABSOLUTA 1 do
  // DeepSeek. O que ela não cobre é a MEMÓRIA: quem escreveu quatro mensagens em espanhol
  // e mandou só "ok" agora continua sendo atendido em espanhol, e o material oficial que
  // chega no prompt está todo em português. O idioma fica gravado no contato — é o mesmo
  // dado que o follow-up automático e o atendente humano do painel usam.
  // A conversa inteira, e não só a última mensagem: no WhatsApp quase toda mensagem é
  // curta demais para o detector decidir sozinha, e uma conversa inteira em espanhol
  // acabava atendida em português. Ver `idiomaDaConversa`.
  // E QUANDO A HEURÍSTICA NÃO CONHECE A LÍNGUA? Ela é escrita à mão e cobre o que este
  // atendimento mais vê. Alemão, italiano, turco, suaíli e wolof caíam em `undefined` —
  // a resposta do turno saía certa (é a REGRA ABSOLUTA 1 do prompt), mas o contato ficava
  // sem idioma gravado, e aí o follow-up automático saía em português e a fila mostrava o
  // chip vazio. Aí, e só aí, o modelo é consultado. Ver lib/agent/idioma-modelo.ts.
  const idiomaDetectado = await idiomaDaConversaOuModelo(
    lastUserText,
    allUserText,
    convBefore?.idioma,
    { conversationId, habilitado: useDeepseek },
  );
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
  // CONFIRMAÇÃO PENDENTE. O outro lado do mesmo portão: aqui não se pergunta se já há
  // caso, e sim se a Ana pediu autorização para passar o contato e ainda não recebeu um
  // sim. Ver lib/agent/transfer-gate.ts — e a conversa da Ana Rodríguez, em que "me llamo
  // Ana Rodríguez, vivo en Boa Vista" foi lido como confirmação.
  const ultimaRespostaDoAgente =
    [...rawMsgs].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const confirmacao = avaliarConfirmacao({
    ultimaRespostaDoAgente,
    ultimaMensagem: lastUserText,
    textoRecente: rawMsgs
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join("  "),
  });

  const blockTools =
    portao.liberado && confirmacao.liberado ? undefined : ["transferir_para_humano"];

  if (!confirmacao.liberado) {
    systemPrompt +=
      `\n\n════════ VOCÊ PEDIU CONFIRMAÇÃO E ELA AINDA NÃO DISSE SIM ════════\nA sua última mensagem perguntou se pode passar o contato dela. O que veio agora não é um sim — é outra coisa que ela quis contar. Resposta que não responde à pergunta não é confirmação, e silêncio sobre a pergunta muito menos.\nEntão: acolha o que ela acabou de dizer, aproveite o dado se ele serve para a ficha, e repita a pergunta uma vez, de leve, no fim da mensagem. NÃO encaminhe e, principalmente, NÃO escreva que já encaminhou nem que ela concordou — dizer que ela confirmou quando ela não confirmou é o tipo de frase que faz alguém parar de contar o que importa.\nSe aparecer prazo correndo, situação irregular, refúgio ou risco, aí você passa na hora, sem esperar resposta — e diz isso com todas as letras ("vou passar o seu caso agora"), nunca como se ela tivesse autorizado.`;
  }

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

  const alreadyTransferred = toolCalls.some((t) => t.name === "transferir_para_humano");

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
  // resolver (uma pergunta que o material oficial não cobre, um caso que ela não deveria
  // estar conduzindo). Insistir na mesma mensagem é o pior desfecho possível — quem está
  // com prazo correndo lê isso como não estar sendo ouvido. Aqui a conversa é entregue a
  // uma pessoa, do SETOR desta conversa: mandar um candidato a vaga para o time jurídico
  // é pior do que não encaminhar nada.
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

  // CHAMAR A TOOL NÃO É TER ENCAMINHADO. O portão de lib/agent/transfer-gate.ts recusa o
  // encaminhamento quando a conversa ainda não tem caso nenhum, e devolve `ok: false`.
  // Contar a CHAMADA marcava a conversa como "transferida" no painel sem ninguém ter sido
  // chamado: o atendente via um caso encaminhado que não existia no funil, e a Ana parava
  // de ser cobrada pelo atendimento que continuava só dela.
  //
  // Isto é lido ANTES de gravar a resposta porque o verificador de saída precisa saber o
  // FATO: uma mensagem que diz "já passei o seu caso" sem encaminhamento nenhum deixa
  // alguém aflito esperando um telefonema que ninguém agendou.
  const transferred = toolCalls.some(
    (t) => t.name === "transferir_para_humano" && (t.result as { ok?: boolean })?.ok !== false,
  );

  // ─── O VERIFICADOR DE SAÍDA ───
  //
  // A última leitura antes de a mensagem sair. Corta duas coisas que o prompt proíbe e o
  // modelo escreve assim mesmo, sempre por gentileza: o parecer sobre a situação da
  // pessoa ("sua entrada ficou regular") e o anúncio de um encaminhamento que não houve.
  // Ver lib/agent/verificador-de-saida.ts.
  const revisao = revisarTurno(reply, {
    idioma: idiomaDetectado ?? convBefore?.idioma,
    encaminhou: transferred,
  });
  if (revisao.cortes.length) {
    reply = revisao.texto;
    // O CORTE NÃO PODE SER SILENCIOSO. Ele salva aquela mensagem; o registro é o que
    // permite descobrir que o PROMPT está deixando isso passar com frequência — e prompt
    // que deixa passar parecer é defeito, não azar.
    console.warn(`[verificador] cortei ${revisao.cortes.length} frase(s) da resposta (conversa ${conversationId})`);
    await repo
      .registrarEventoOperacao({
        tipo: "parecer_barrado",
        conversationId,
        detalhe: revisao.cortes.join(" ⁄ ").slice(0, 500),
      })
      .catch(() => {
        // Registrar o corte não pode virar um segundo problema no meio do atendimento.
      });
  }

  if (!opts.sombra) await repo.addMessage(conversationId, "assistant", reply);
  const desqualificado = toolCalls.some(
    (t) => t.name === "registrar_dados_lead" && (t.input as { stage?: string })?.stage === "desqualificado",
  );
  // A ANA RESPONDEU: define o status do ciclo de vida da conversa.
  // transferência → transferida · desqualificado (engano/spam) → finalizada ·
  // caso contrário → aguardando resposta (o cron cuida do follow-up de 24h).
  const status: ConversationStatus = transferred
    ? "transferred"
    : desqualificado
      ? "finished"
      : "waiting";
  // try/catch: sem a migration 008 o CHECK antigo rejeitaria 'waiting';
  // isso não pode impedir a Ana de responder.
  try {
    // Em sombra nada disto acontece: a Ana não respondeu, então a conversa não passou a
    // "aguardando o cliente" e o relógio de última mensagem não se move.
    if (!opts.sombra) {
      await repo.updateConversationStatus(conversationId, status);
      await repo.updateLastMessageAt(conversationId);
    }
  } catch (err) {
    console.error("[agent] status (resposta) falhou:", err instanceof Error ? err.message : err);
  }
  const conv = await repo.getConversation(conversationId);

  // A FICHA DA TRIAGEM MORA NO LEAD, não em `notes`.
  //
  // Havia aqui um segundo classificador, que montava a ficha como texto e a escrevia em
  // `notes`. Ele era a solução de quem não tinha coluna para guardar o caso; agora existe
  // o modelo estruturado (migration 019) e ele é preenchido por `capturarDadosDoLead`,
  // logo no começo deste mesmo turno.
  //
  // Manter os dois era pior do que escolher: duas classificações da mesma conversa,
  // calculadas por regras diferentes, aparecendo lado a lado no painel — e a antiga
  // devolvia CURIOSO, DPU e FORA_ESCOPO por regex, que é justamente o que
  // lib/agent/classificacao.ts proíbe. Filtrar alguém por expressão regular descarta em
  // silêncio quem precisava de ajuda, e o prejuízo não aparece em métrica nenhuma.

  // Lead score + funil: computa o score e persiste na CONVERSA (antes ficava sempre 0
  // na lista de Conversas) e move o contato no Kanban para 'qualificado' quando o score
  // sobe. Sem isto o CRM não reagia ao atendimento.
  try {
    const msgs = await repo.listMessages(conversationId);
    const lead = await repo.getLeadByConversation(conversationId);
    const { score } = computeLeadScore({ messages: msgs, lead });
    if (conv && conv.leadScore !== score) {
      await repo.updateConversation(conversationId, { leadScore: score });
    }
    if (lead) {
      // Não mexe em estágios "finais" definidos manualmente ou pela Ana
      // (desqualificado/perdido/ganho/transferido) — a automação não os sobrescreve.
      const terminal = ["desqualificado", "perdido", "ganho", "transferido"];
      let stage = lead.stage;
      if (!terminal.includes(lead.stage ?? "novo")) {
        if (score >= 45 && (!lead.stage || lead.stage === "novo")) stage = "qualificado";
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
