// O KANBAN DE ATENDIMENTOS — a regra de colunas, isolada e testável.
//
// A fila responde "o que vence primeiro?". O kanban responde outra pergunta: "onde cada
// caso está?". São perguntas diferentes e por isso são telas diferentes — num kanban por
// status, quem tem multa vencendo amanhã fica no meio da coluna "Novo" junto com quem
// mandou oi, e é assim que se perde a ordenação por prazo, que é a tese do painel.
//
// As colunas são o `atendimentoStatus`, que é o campo do domínio e o que o endpoint de
// atendimento já move. Não é o `stage` herdado do funil comercial: "orçado" e "ganho" são
// vocabulário de venda, e ninguém ganha um pedido de refúgio.

import type { AtendimentoStatus } from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { relogioApertado, temPrazo, ultimaAtividade, type LeadDaFila } from "@/lib/fila/ordenacao";

export const COLUNAS: AtendimentoStatus[] = [
  "novo",
  "em_atendimento",
  "agendado",
  "fechado",
  "perdido",
];

/** As duas colunas de desfecho. Ordenam ao contrário das outras — ver `montarKanban`. */
const DESFECHOS: AtendimentoStatus[] = ["fechado", "perdido"];

export interface ColunaKanban {
  status: AtendimentoStatus;
  leads: LeadDaFila[];
}

/**
 * Distribui os leads nas colunas.
 *
 * O que fica de fora: CURIOSO, DPU e FORA_ESCOPO. São as conversas que o agente tirou da
 * frente do time, vivem na aba Filtradas e existem para auditoria por amostragem —
 * despejá-las na coluna "Novo" desfaria a filtragem inteira pela porta dos fundos.
 *
 * A ordem DENTRO da coluna não é a mesma nos dois lados do quadro, e a diferença é o
 * ponto: nas colunas de trabalho (novo, em atendimento, agendado) sobe quem tem prazo,
 * depois quem tem relógio apertado, depois o mais parado — a mesma hierarquia da fila,
 * porque a pergunta ali continua sendo "o que eu pego agora?". Nas colunas de desfecho
 * sobe o mais RECENTE: ninguém procura o caso fechado há oito meses, procura o de ontem.
 */
export function montarKanban(leads: LeadDaFila[], agora: Date = new Date()): ColunaKanban[] {
  const porStatus = new Map<AtendimentoStatus, LeadDaFila[]>(COLUNAS.map((c) => [c, []]));

  for (const lead of leads) {
    if (eFiltrada(lead.classificacao)) continue;
    const status = lead.atendimentoStatus ?? "novo";
    // Status desconhecido (coluna removida, dado antigo) cai em "novo" em vez de sumir:
    // um caso invisível é pior do que um caso na coluna errada.
    (porStatus.get(status) ?? porStatus.get("novo")!).push(lead);
  }

  return COLUNAS.map((status) => {
    const leadsDaColuna = porStatus.get(status)!;
    leadsDaColuna.sort(
      DESFECHOS.includes(status)
        ? (a, b) => ultimaAtividade(b) - ultimaAtividade(a)
        : (a, b) => peso(b, agora) - peso(a, agora) || ultimaAtividade(a) - ultimaAtividade(b),
    );
    return { status, leads: leadsDaColuna };
  });
}

/** Prazo processual acima de relógio apertado, e os dois acima do resto. */
function peso(lead: LeadDaFila, agora: Date): number {
  if (temPrazo(lead)) return 2;
  if (relogioApertado(lead, agora)) return 1;
  return 0;
}

// ─── AS TRANSIÇÕES ───
//
// Arrastar um card NÃO escreve direto no banco: cada movimento vira uma das ações que o
// endpoint POST /api/leads/[id]/atendimento já conhece. É o que garante que arrastar para
// "Perdido" continue exigindo motivo, que assumir continue gravando responsável, e que
// tudo continue no log de acesso — três coisas que um `update` no drop apagaria em
// silêncio.

export type AcaoAtendimento = "assumir" | "agendar" | "fechar" | "perder" | "reabrir";

export interface Transicao {
  acao: AcaoAtendimento;
  /** Alvo explícito de `reabrir`, que é a única ação que não determina sozinha o status. */
  para?: AtendimentoStatus;
  /** O motivo é obrigatório: a coluna "Perdido" sem porquê não se lê seis meses depois. */
  exigeMotivo?: boolean;
}

/**
 * Que ação um arrasto de `de` para `para` representa — ou `null` quando o arrasto não
 * significa nada (soltar na mesma coluna).
 */
export function transicao(
  de: AtendimentoStatus,
  para: AtendimentoStatus,
): Transicao | null {
  if (de === para) return null;
  switch (para) {
    case "em_atendimento":
      // Vindo de "novo" é alguém pegando o caso: assumir grava o responsável e marca o
      // relógio do primeiro contato. Vindo de um desfecho é reabertura, e reabrir não
      // pode reatribuir o caso a quem por acaso arrastou o card.
      return de === "novo" ? { acao: "assumir" } : { acao: "reabrir", para: "em_atendimento" };
    case "agendado":
      return { acao: "agendar" };
    case "fechado":
      return { acao: "fechar" };
    case "perdido":
      return { acao: "perder", exigeMotivo: true };
    case "novo":
      return { acao: "reabrir", para: "novo" };
  }
}
