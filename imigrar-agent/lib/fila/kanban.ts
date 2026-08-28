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
import { contaComoOperacaoReal } from "@/lib/domain/ambiente";
import { eConversaDeGrupo } from "@/lib/whatsapp/remetente";
import { relogioApertado, temPrazo, ultimaAtividade, type LeadDaFila } from "@/lib/fila/ordenacao";

export const COLUNAS: AtendimentoStatus[] = [
  "novo",
  "em_atendimento",
  "proposta_enviada",
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
    // ENSAIO NÃO É ATENDIMENTO. A fila já respeitava isso; o quadro não, e por isso
    // `sim:v2-5` e companhia apareciam como cards entre casos de gente de verdade. Quem
    // organiza o quadro está decidindo o que a equipe pega hoje — um ensaio ali não é
    // ruído inofensivo, é trabalho alocado para uma pessoa que não existe.
    if (!contaComoOperacaoReal(lead.ambiente)) continue;
    // GRUPO NÃO É PESSOA. O webhook parou de criar estes leads, mas os que já entraram
    // continuam no banco — e um card cujo "nome" é o JID de um grupo é trabalho alocado
    // para ninguém. Ler o próprio número conserta o passado sem UPDATE em produção.
    if (eConversaDeGrupo(lead.whatsappNumber)) continue;
    if (eFiltrada(lead.classificacao)) continue;
    const status = lead.atendimentoStatus ?? "novo";
    // Status desconhecido (coluna removida, dado antigo) cai em "novo" em vez de sumir:
    // um caso invisível é pior do que um caso na coluna errada.
    (porStatus.get(status) ?? porStatus.get("novo")!).push(lead);
  }

  return COLUNAS.map((status) => {
    const leadsDaColuna = porStatus.get(status)!;
    ordenarColuna(leadsDaColuna, status, agora);
    return { status, leads: leadsDaColuna };
  });
}

/**
 * A ordem DENTRO de uma coluna, no lugar (mutando o array).
 *
 * Vive aqui e não no componente porque o quadro do CRM (lib/crm/funil.ts) monta colunas
 * customizadas e precisa ordenar do MESMO jeito: uma etapa nova chamada "aguardando
 * certidão" continua sendo trabalho, e trabalho se ordena por prazo.
 */
export function ordenarColuna(
  leads: LeadDaFila[],
  status: AtendimentoStatus,
  agora: Date = new Date(),
): void {
  leads.sort(
    DESFECHOS.includes(status)
      ? (a, b) => ultimaAtividade(b) - ultimaAtividade(a)
      : (a, b) => peso(b, agora) - peso(a, agora) || ultimaAtividade(a) - ultimaAtividade(b),
  );
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

export type AcaoAtendimento =
  | "assumir"
  | "propor"
  | "agendar"
  | "fechar"
  | "perder"
  | "reabrir";

export interface Transicao {
  acao: AcaoAtendimento;
  /** Alvo explícito de `reabrir`, que é a única ação que não determina sozinha o status. */
  para?: AtendimentoStatus;
  /** O motivo é obrigatório: a coluna "Perdido" sem porquê não se lê seis meses depois. */
  exigeMotivo?: boolean;
  /**
   * A proposta é obrigatória ao entrar em "proposta enviada": data, valor, serviço e
   * validade. Uma coluna de propostas em que não se sabe de quanto é cada uma responde a
   * mesma pergunta que a coluna anterior já respondia — e é justamente a pergunta do
   * dinheiro que ela existe para responder.
   */
  exigeProposta?: boolean;
  /**
   * Fechar exige dizer QUANTO foi contratado — ou dizer explicitamente que não houve
   * contrato. Deixar o campo simplesmente em branco produz a pior das três respostas:
   * não dá para distinguir "fechou sem valor" de "esqueceram de preencher", e a soma do
   * mês fica errada sem ninguém perceber.
   */
  exigeValor?: boolean;
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
    case "proposta_enviada":
      return { acao: "propor", exigeProposta: true };
    case "em_atendimento":
      // Vindo de "novo" é alguém pegando o caso: assumir grava o responsável e marca o
      // relógio do primeiro contato. Vindo de um desfecho é reabertura, e reabrir não
      // pode reatribuir o caso a quem por acaso arrastou o card.
      return de === "novo" ? { acao: "assumir" } : { acao: "reabrir", para: "em_atendimento" };
    case "agendado":
      return { acao: "agendar" };
    case "fechado":
      return { acao: "fechar", exigeValor: true };
    case "perdido":
      return { acao: "perder", exigeMotivo: true };
    case "novo":
      return { acao: "reabrir", para: "novo" };
  }
}
