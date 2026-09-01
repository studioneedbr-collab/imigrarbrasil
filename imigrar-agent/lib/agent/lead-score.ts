import type { Conversation, Lead, Message } from "@/lib/domain/types";
import { classifyRouting } from "@/lib/agent/routing-net";
import { detectarOptOut } from "@/lib/agent/opt-out";
import { detectarSinalDePrazo } from "@/lib/agent/classificacao";

// ─────────────────────────────────────────────────────────────────────────────
// LEAD SCORE — QUEM É ESTA PESSOA, E O QUE O TIME FAZ COM ELA HOJE?
//
// O score não é termômetro de simpatia. Ele responde duas perguntas, nesta ordem, e é
// por isso que tem duas camadas.
//
// 1) O VEREDITO — antes de pontuar qualquer coisa, o motor pergunta se este contato é
//    um CASO do time jurídico. Candidato a vaga, fornecedor, jornalista, quem pediu para
//    parar de receber mensagem, quem tem perfil de Defensoria e quem procura outra área
//    do direito não são "leads frios": são outra coisa. Todos saem com nota 0 e o motivo
//    escrito, para não inflarem a média da fila nem ocupar a agenda de quem atende.
//
//    ATENÇÃO — o veredito nunca FILTRA ninguém sozinho. Ele repete o que já foi decidido
//    (a `classificacao` que o modelo ou um humano gravou, o `setor`, o opt-out) e, no
//    máximo, reconhece candidato a vaga e fornecedor. É a mesma regra de
//    lib/agent/classificacao.ts: descartar por expressão regular é descartar em silêncio
//    quem precisava de ajuda, e isso não aparece em métrica nenhuma até tarde demais.
//
// 2) A NOTA (0–100) — só para quem é caso de verdade, somando o que este escritório
//    realmente precisa saber para decidir a quem ligar primeiro:
//      • caso       (0–35) o quanto já se sabe do caso: objetivo, situação documental,
//                          documentos em mãos, nacionalidade e onde a pessoa está;
//      • urgência   (0–25) prazo processual correndo, ação judicial, relógio do caso;
//      • intenção   (0–20) a resposta sobre conduzir sozinho ou contratar o escritório;
//      • engajamento(0–10) troca real de mensagens — nenhum ponto sem evidência;
//      • progresso  (0–10) onde o atendimento está (proposta, reunião, fechado).
//
// Tudo determinístico e auditável: cada ponto vira um sinal em texto (`signals`) e o que
// falta para o time trabalhar o caso sai em `missing`.
// ─────────────────────────────────────────────────────────────────────────────

export type LeadVerdict =
  | "prioritario" // prazo processual correndo ou caso judicial: é hoje
  | "qualificado" // caso descrito e quer o escritório conduzindo
  | "em_qualificacao" // caso real, ainda faltam respostas
  | "frio" // mal conversou; pode esquentar
  | "dpu" // perfil de gratuidade — Defensoria Pública da União
  | "fora_do_funil" // não é atendimento (candidato, fornecedor, imprensa)
  | "fora_do_escopo" // outra área do direito ou outro país de destino
  | "desqualificado"; // pediu para parar, sem caso concreto, perdido

export interface LeadScoreBreakdown {
  caso: number; // 0–35
  urgencia: number; // 0–25
  intencao: number; // 0–20
  engajamento: number; // 0–10
  progresso: number; // 0–10
}

export interface LeadSignal {
  kind: "positivo" | "negativo" | "bloqueio";
  text: string;
}

export interface LeadScoreResult {
  score: number;
  verdict: LeadVerdict;
  /** Rótulo pronto para a tela: "Prioritário · prazo correndo". */
  label: string;
  /** Por que o contato está nesta nota — em português, pronto para exibir. */
  signals: LeadSignal[];
  /** O que ainda falta para o time trabalhar o caso. */
  missing: string[];
  breakdown: LeadScoreBreakdown;
}

const VERDICT_LABEL: Record<LeadVerdict, string> = {
  prioritario: "Prioritário",
  qualificado: "Qualificado",
  em_qualificacao: "Em qualificação",
  frio: "Frio",
  dpu: "Defensoria (DPU)",
  fora_do_funil: "Fora do funil",
  fora_do_escopo: "Fora do escopo",
  desqualificado: "Desqualificado",
};

const SETOR_LABEL: Record<string, string> = {
  rh: "candidato a vaga",
  suprimentos: "fornecedor",
  diretoria: "imprensa/institucional",
  operacional: "assunto operacional",
  departamento_pessoal: "assunto interno",
};

// ─── Sinais de texto ────────────────────────────────────────────────────────
// Conservadores de propósito: nenhum deles descarta ninguém do atendimento — os dois
// primeiros só desviam para outro setor, e o terceiro só soma pontos.

/** Quer VENDER para a assessoria — vai para suprimentos, não para a fila jurídica. */
const FORNECEDOR =
  /\b(sou|somos)\s+(um[a]?\s+)?(fornecedor|distribuidora?|fabricante|representante)\b|\brepresento\s+a\s+(empresa|marca)\b|\b(ofere[çc](o|emos)|vend(o|emos))\s+(para|pra)\s+(voc[êe]s|o escrit[óo]rio)\b|\bparceria comercial\b|\bparticipar d[ae]s? cota[çc][õo]es\b/i;

/** Imprensa e institucional — quem fala pela casa é a diretoria. */
const IMPRENSA =
  /\b(sou\s+)?jornalista\b|\breportagem\b|\bassessoria de imprensa\b|\bentrevista para\b|\bve[íi]culo de comunica[çc][ãa]o\b|\bpesquisa acad[êe]mica\b|\btrabalho acad[êe]mico\b|\b(tcc|monografia|disserta[çc][ãa]o)\b/i;

/** Perguntou honorários / quer contratar. Sinal de intenção quando o campo ainda é nulo. */
const FALA_EM_CONTRATAR =
  /\b(quanto (custa|fica|sai|voc[êe]s cobram)|qual (o )?(valor|pre[çc]o|honor[áa]rio)|honor[áa]rios?|or[çc]amento|quero contratar|quero que voc[êe]s (cuidem|fa[çc]am|conduzam)|como fa[çc]o para contratar|forma de pagamento|parcel(a|ar))\b/i;

/** Pede orientação pontual — vale menos que contratar, mas não é curiosidade. */
const PEDE_ORIENTACAO =
  /\b(como (fa[çc]o|devo|posso)|o que (eu )?preciso|quais documentos|preciso de ajuda|me ajuda|pode me orientar|d[úu]vida sobre)\b/i;

/** Saudação ou monossílabo — não é conversa. */
const RUIDO =
  /^(oi+|ol[áa]+|opa+|e?[ai]+|ok+|okay|blz|beleza|sim|n[ãa]o|obrigad[oa]|vlw|valeu|bom dia|boa tarde|boa noite|tudo bem\??|hola|hi|hello|kk+|👍|🙏|\.|\?)+[!.…]*$/i;

const STATUS_PROGRESSO: Record<string, number> = {
  novo: 0,
  em_atendimento: 3,
  proposta_enviada: 7,
  agendado: 9,
  fechado: 10,
  perdido: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Quanta amostra existe, de 0 a 1: com `full` observações a confiança é total. */
function confianca(amostra: number, full: number): number {
  return clamp(amostra / full, 0, 1);
}

/** Peso de uma mensagem: saudação vale pouco, frase de conteúdo vale 1. */
function peso(content?: string | null): number {
  const t = (content ?? "").trim();
  if (!t) return 0.25; // áudio/imagem sem transcrição
  if (RUIDO.test(t)) return 0.25;
  if (t.length < 12) return 0.5;
  return 1;
}

function zero(verdict: LeadVerdict, motivo: string, detalhe?: string): LeadScoreResult {
  return {
    score: 0,
    verdict,
    label: detalhe ? `${VERDICT_LABEL[verdict]} · ${detalhe}` : VERDICT_LABEL[verdict],
    signals: [{ kind: "bloqueio", text: motivo }],
    missing: [],
    breakdown: { caso: 0, urgencia: 0, intencao: 0, engajamento: 0, progresso: 0 },
  };
}

export interface LeadScoreInput {
  messages: (Pick<Message, "role" | "createdAt"> & { content?: string | null })[];
  lead?: Partial<Lead> | null;
  /** Traz optOutAt/noFollowupAt — quem pediu silêncio não pode aparecer como caso quente. */
  conversation?: Pick<Conversation, "optOutAt" | "noFollowupAt"> | null;
}

/**
 * A CAMADA 1 SOZINHA — "este contato é um caso do time jurídico?".
 *
 * Exportada porque a lista de conversas precisa da mesma resposta e não pode pagar por
 * ela: montar a nota exige as mensagens de CADA conversa (uma consulta por linha da
 * tabela). O veredito de bloqueio sai só do lead e da conversa, que a lista já tem em
 * mãos — e é justamente ele que o operador precisa ver ali: um fornecedor com nota 0
 * não é "contato frio", é gente esperando resposta de outro setor.
 *
 * Devolve `null` quando não há bloqueio: aí é caso, e a nota é que responde.
 */
export function vereditoBloqueante(
  lead?: Partial<Lead> | null,
  conversation?: Pick<Conversation, "optOutAt" | "noFollowupAt"> | null,
  texto = "",
): LeadScoreResult | null {
  if (conversation?.optOutAt || (texto && detectarOptOut(texto) === "bloquear")) {
    return zero("desqualificado", "Pediu para não receber mais mensagens.", "opt-out");
  }

  // Classificação já decidida (pelo modelo, pela tool ou por um humano). O motor repete,
  // não julga de novo — e nunca classifica ninguém assim por conta própria.
  const classificacao = lead?.classificacao ?? null;
  if (classificacao === "DPU") {
    return zero("dpu", "Perfil de gratuidade — encaminhado à Defensoria Pública da União.");
  }
  if (classificacao === "FORA_ESCOPO") {
    return zero("fora_do_escopo", "Outro país de destino, ou outra área do direito.");
  }
  if (classificacao === "CURIOSO") {
    return zero("desqualificado", "Perguntou por curiosidade, sem caso concreto.", "sem caso");
  }
  // A resposta sobre condições vale o mesmo que a classificação: quem não tem como pagar
  // é atendimento da Defensoria, e deixá-lo pontuando na fila comercial é fazer o time
  // ligar para quem já foi encaminhado.
  if (lead?.intencao === "sem_condicoes") {
    return zero("dpu", "Declarou não ter condições de pagar — perfil de Defensoria.");
  }
  if (lead?.atendimentoStatus === "perdido" || lead?.stage === "perdido" || lead?.stage === "desqualificado") {
    return zero("desqualificado", "Caso encerrado como perdido no quadro.");
  }

  // Setor já registrado manda mais que qualquer heurística.
  const setor = lead?.setor ?? null;
  if (setor && setor !== "comercial") {
    return zero("fora_do_funil", `Registrado no setor ${setor}.`, SETOR_LABEL[setor] ?? setor);
  }
  // O roteamento lê cada mensagem inteira: os padrões de candidato exigem âncora na
  // empresa ("trabalhar aí com vocês") e juntar tudo num texto só criaria vizinhanças
  // que nunca foram ditas na mesma frase.
  for (const linha of texto.split("\n")) {
    const r = classifyRouting(linha);
    if (r) return zero("fora_do_funil", r.reason, SETOR_LABEL[r.setor] ?? r.kind);
  }
  if (FORNECEDOR.test(texto)) {
    return zero("fora_do_funil", "Quer vender para o escritório (fornecedor/parceria).", "fornecedor");
  }
  if (IMPRENSA.test(texto)) {
    return zero("fora_do_funil", "Imprensa, instituição ou pesquisa acadêmica.", "imprensa/institucional");
  }
  return null;
}

export function computeLeadScore(input: LeadScoreInput): LeadScoreResult {
  const msgs = input.messages ?? [];
  const lead = input.lead ?? null;
  const userMsgs = msgs.filter((m) => m.role === "user");
  const agentMsgs = msgs.filter((m) => m.role === "assistant");
  const texto = userMsgs.map((m) => m.content ?? "").join("\n");

  // ── CAMADA 1: isto é um caso do time jurídico? ─────────────────────────────
  const bloqueio = vereditoBloqueante(lead, input.conversation, texto);
  if (bloqueio) return bloqueio;

  // ── CAMADA 2: quão perto de virar atendimento? ─────────────────────────────

  const classificacao = lead?.classificacao ?? null;
  const signals: LeadSignal[] = [];
  const missing: string[] = [];

  // CASO (0–35): o quanto o time já tem para trabalhar.
  const objetivo = lead?.objetivo ?? lead?.modalidadeProvavel ?? null;
  let caso = 0;
  if (objetivo) {
    caso += 12;
    signals.push({ kind: "positivo", text: `Objetivo: ${objetivo}` });
  } else if (lead?.servicesInterested?.length) {
    caso += 8;
    signals.push({ kind: "positivo", text: `Procura: ${lead.servicesInterested.join(", ")}` });
  } else missing.push("o que a pessoa quer");
  if (lead?.situacaoDocumental) {
    caso += 8;
    signals.push({ kind: "positivo", text: `Situação documental: ${lead.situacaoDocumental}` });
  } else missing.push("situação documental");
  if (lead?.documentosPossui) caso += 5;
  else missing.push("documentos em mãos");
  if (lead?.nacionalidade) {
    caso += 4;
    signals.push({ kind: "positivo", text: `Nacionalidade: ${lead.nacionalidade}` });
  } else missing.push("nacionalidade");
  if (lead?.localizacao) {
    caso += 6;
    signals.push({
      kind: "positivo",
      text:
        lead.localizacao === "exterior"
          ? `No exterior${lead.paisExterior ? ` (${lead.paisExterior})` : ""}`
          : "No Brasil",
    });
  } else missing.push("onde a pessoa está");
  caso = clamp(caso, 0, 35);

  // URGÊNCIA (0–25): o que faz este caso ser hoje e não semana que vem.
  let urgencia = 0;
  const sinalTexto = detectarSinalDePrazo(texto);
  if (lead?.temPrazoCorrendo) {
    urgencia += 18;
    signals.push({
      kind: "positivo",
      text: `Prazo processual correndo${lead.prazoTipo ? `: ${lead.prazoTipo}` : ""}`,
    });
    // Data confirmada por gente — o motor nunca data um prazo sozinho (classificacao.ts).
    if (lead.prazoDataLimite) urgencia += 5;
    else missing.push("confirmar a data do prazo");
  } else if (sinalTexto.temPrazo) {
    urgencia += 12;
    signals.push({ kind: "positivo", text: "A pessoa mencionou prazo — falta confirmar" });
    missing.push("confirmar o prazo mencionado");
  }
  if (classificacao === "QUENTE_JUDICIAL") {
    urgencia += 15;
    signals.push({ kind: "positivo", text: "Caso exige ação judicial" });
  }
  if (lead?.relogioDoCaso) {
    urgencia += 6;
    signals.push({ kind: "positivo", text: `Relógio do caso: ${lead.relogioDoCaso}` });
  }
  urgencia = clamp(urgencia, 0, 25);

  // INTENÇÃO (0–20): quer conduzir sozinha ou quer o escritório?
  let intencao = 0;
  if (lead?.intencao === "contratar") {
    intencao = 20;
    signals.push({ kind: "positivo", text: "Quer que o escritório cuide" });
  } else if (lead?.intencao === "sozinho") {
    intencao = 5;
    signals.push({ kind: "negativo", text: "Prefere tocar o processo sozinha" });
  } else {
    // Campo ainda nulo: o texto adianta parte da resposta, mas não a substitui.
    if (FALA_EM_CONTRATAR.test(texto)) {
      intencao += 10;
      signals.push({ kind: "positivo", text: "Perguntou honorários / falou em contratar" });
    } else if (PEDE_ORIENTACAO.test(texto)) {
      intencao += 4;
    }
    missing.push("perguntar se quer o escritório conduzindo");
  }
  intencao = clamp(intencao, 0, 20);

  // ENGAJAMENTO (0–10): conversa de verdade, com evidência.
  const conteudo = userMsgs.reduce((soma, m) => soma + peso(m.content), 0);
  const volume = clamp((conteudo / 6) * 5, 0, 5);
  const ratio = agentMsgs.length ? Math.min(userMsgs.length / agentMsgs.length, 1) : 0;
  const responsividade = clamp(ratio * 3 * confianca(agentMsgs.length, 3), 0, 3);
  const gaps: number[] = [];
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i].role === "user" && msgs[i - 1].role === "assistant") {
      const dt = new Date(msgs[i].createdAt).getTime() - new Date(msgs[i - 1].createdAt).getTime();
      if (dt >= 0) gaps.push(dt);
    }
  }
  // Sem tempo medido a velocidade é 0. O "neutro" de meio componente que existia aqui era
  // o que fazia um "oi" solto nascer valendo 43 de 100.
  let velocidade = 0;
  if (gaps.length) {
    const sorted = [...gaps].sort((a, b) => a - b);
    const minutos = sorted[Math.floor(sorted.length / 2)] / 60000;
    velocidade = clamp(2 * (1 - (minutos - 2) / 58), 0, 2) * confianca(gaps.length, 2);
  }
  const engajamento = clamp(volume + responsividade + velocidade, 0, 10);
  if (conteudo <= 0.5 && userMsgs.length) {
    signals.push({ kind: "negativo", text: "Só mandou saudação — ainda não contou o caso" });
  }

  // PROGRESSO (0–10): onde o atendimento está.
  const progresso = clamp(STATUS_PROGRESSO[lead?.atendimentoStatus ?? "novo"] ?? 0, 0, 10);

  const score = clamp(Math.round(caso + urgencia + intencao + engajamento + progresso), 0, 100);

  // O veredito não é uma faixa de nota. Prazo correndo vem primeiro mesmo com pouca
  // conversa: quem tem multa para responder não pode ficar atrás de quem só engajou bem.
  let verdict: LeadVerdict;
  if (lead?.temPrazoCorrendo || classificacao === "QUENTE_PRAZO" || classificacao === "QUENTE_JUDICIAL") {
    verdict = "prioritario";
  } else if (lead?.intencao === "contratar" && caso >= 18) {
    verdict = "qualificado";
  } else if (score >= 30 || intencao >= 10) {
    verdict = "em_qualificacao";
  } else {
    verdict = "frio";
  }

  const detalhe =
    verdict === "prioritario"
      ? lead?.temPrazoCorrendo || classificacao === "QUENTE_PRAZO"
        ? "prazo correndo"
        : "judicial"
      : undefined;

  return {
    score,
    verdict,
    label: detalhe ? `${VERDICT_LABEL[verdict]} · ${detalhe}` : VERDICT_LABEL[verdict],
    signals,
    missing,
    breakdown: {
      caso: Math.round(caso),
      urgencia: Math.round(urgencia),
      intencao: Math.round(intencao),
      engajamento: Math.round(engajamento),
      progresso: Math.round(progresso),
    },
  };
}
