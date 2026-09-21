// O FUNIL COMERCIAL — o que a tela de métricas não media.
//
// A tela responde "quanto tempo o agente economizou": custo do modelo, taxa de filtragem,
// tempo até o humano, desempenho do follow-up. Tudo sobre o AGENTE.
//
// Nada ali responde às perguntas que o escritório faz: quanto tem de proposta na rua,
// quanto fechou, onde os casos estão parados e de qual porta eles vieram. A informação
// existe no banco desde a etapa comercial (migration 027) e desde a coluna de origem
// (031) — faltava alguém contar.
//
// ── O QUE ESTE MÓDULO NÃO FAZ ────────────────────────────────────────────────────────
//
// NÃO ESTIMA VALOR. `propostaValor` e `valorContratado` são campos de humano: o agente
// nunca escreve neles (ver CAMPOS_SO_DE_HUMANO em lib/data/prazo.ts). Quando ninguém
// preencheu, o caso não entra na soma — e o número de casos SEM valor sai junto, ao lado
// do total. Um "R$ 0,00" sozinho é indistinguível de "não vendemos nada" e de "ninguém
// preencheu", e essas duas coisas exigem reações opostas.
//
// ── DUAS PERGUNTAS DIFERENTES, DOIS RECORTES ─────────────────────────────────────────
//
// "Onde os casos estão?" é uma foto de AGORA: o quadro não tem período, e um caso aberto
// há oito meses continua aberto hoje. "Quanto fechou?" é do PERÍODO, senão o número só
// cresce e deixa de significar qualquer coisa. Os dois convivem aqui, e cada campo diz
// qual dos dois é.

import type { AtendimentoStatus, OrigemLead } from "@/lib/domain/types";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import { COLUNAS } from "@/lib/fila/kanban";

/** Uma proposta prestes a vencer é a única coisa aqui que tem hora para ser olhada. */
export const DIAS_DE_ALERTA_DE_VALIDADE = 7;

export interface MetricasDoFunil {
  /** Foto de AGORA: quantos casos em cada etapa, e quanto de proposta há em cada uma. */
  porEtapa: Array<{ status: AtendimentoStatus; total: number; valor: number }>;
  /** O dinheiro que está com o cliente neste momento. */
  propostas: {
    abertas: number;
    valor: number;
    /** Abertas sem ninguém ter escrito o valor. Sem isto, `valor` mente por omissão. */
    semValor: number;
    vencidas: number;
    vencemEmBreve: number;
  };
  /** O que fechou DENTRO do período. */
  fechados: { total: number; valor: number; semValor: number; ticketMedio: number | null };
  /** Dos casos que tiveram desfecho no período, quantos fecharam. */
  conversao: { comDesfecho: number; fechados: number; taxa: number };
  /**
   * De qual porta os casos vieram — e, mais importante, quanto cada porta FECHOU.
   *
   * Contar só a entrada faz a porta mais barulhenta parecer a melhor. A campanha que traz
   * cem curiosos e a indicação que traz três clientes aparecem como 100 e 3 até alguém
   * perguntar quantos viraram contrato.
   */
  porOrigem: Array<{ origem: OrigemLead; total: number; fechados: number; valor: number }>;
}

function numero(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

function noPeriodo(iso: string | null | undefined, de: Date, ate: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= de.getTime() && t <= ate.getTime();
}

/** Dias até a validade da proposta. Negativo = já venceu. */
export function diasAteVencer(validade: string | null | undefined, agora: Date): number | null {
  if (!validade) return null;
  const t = Date.parse(validade);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - agora.getTime()) / 86_400_000);
}

export function resumirFunil(
  todosOsLeads: LeadDaFila[],
  de: Date,
  ate: Date,
  agora: Date = new Date(),
): MetricasDoFunil {
  // Ensaio fora, como em toda métrica desta tela: a primeira semana de testes
  // envenenaria a taxa de conversão do escritório para sempre.
  const leads = todosOsLeads.filter((l) => l.ambiente !== "teste");

  // ── A FOTO DE AGORA ──
  const porEtapa = COLUNAS.map((status) => {
    const daEtapa = leads.filter((l) => (l.atendimentoStatus ?? "novo") === status);
    return {
      status,
      total: daEtapa.length,
      valor: daEtapa.reduce((soma, l) => soma + (numero(l.propostaValor) ?? 0), 0),
    };
  });

  const abertas = leads.filter((l) => l.atendimentoStatus === "proposta_enviada");
  const propostas = {
    abertas: abertas.length,
    valor: abertas.reduce((s, l) => s + (numero(l.propostaValor) ?? 0), 0),
    semValor: abertas.filter((l) => numero(l.propostaValor) === null).length,
    vencidas: abertas.filter((l) => {
      const d = diasAteVencer(l.propostaValidade, agora);
      return d !== null && d < 0;
    }).length,
    vencemEmBreve: abertas.filter((l) => {
      const d = diasAteVencer(l.propostaValidade, agora);
      return d !== null && d >= 0 && d <= DIAS_DE_ALERTA_DE_VALIDADE;
    }).length,
  };

  // ── O QUE ACONTECEU NO PERÍODO ──
  //
  // O desfecho é datado por `updatedAt` e não por `createdAt`: a pergunta é "o que fechou
  // neste mês", e um caso que entrou em janeiro e fechou em março pertence a março. Usar
  // a data de entrada faria todo fechamento de caso antigo desaparecer do relatório.
  const comDesfechoNoPeriodo = leads.filter(
    (l) =>
      (l.atendimentoStatus === "fechado" || l.atendimentoStatus === "perdido") &&
      noPeriodo(l.updatedAt, de, ate),
  );
  const fechadosNoPeriodo = comDesfechoNoPeriodo.filter((l) => l.atendimentoStatus === "fechado");
  const valoresFechados = fechadosNoPeriodo
    .map((l) => numero(l.valorContratado))
    .filter((v): v is number => v !== null);

  const fechados = {
    total: fechadosNoPeriodo.length,
    valor: valoresFechados.reduce((a, b) => a + b, 0),
    semValor: fechadosNoPeriodo.length - valoresFechados.length,
    ticketMedio: valoresFechados.length
      ? Math.round(valoresFechados.reduce((a, b) => a + b, 0) / valoresFechados.length)
      : null,
  };

  const conversao = {
    comDesfecho: comDesfechoNoPeriodo.length,
    fechados: fechadosNoPeriodo.length,
    taxa: comDesfechoNoPeriodo.length
      ? fechadosNoPeriodo.length / comDesfechoNoPeriodo.length
      : 0,
  };

  // ── DE ONDE VIERAM ──
  // A foto de agora, e não do período: a carga da planilha entrou toda num dia só, e
  // recortá-la por período faria "de onde vêm os casos" mudar de resposta conforme o
  // filtro — que é o contrário do que a pergunta quer saber.
  const origens = new Map<OrigemLead, { total: number; fechados: number; valor: number }>();
  for (const l of leads) {
    const origem = (l.origem ?? "whatsapp") as OrigemLead;
    const atual = origens.get(origem) ?? { total: 0, fechados: 0, valor: 0 };
    atual.total++;
    if (l.atendimentoStatus === "fechado") {
      atual.fechados++;
      atual.valor += numero(l.valorContratado) ?? 0;
    }
    origens.set(origem, atual);
  }

  return {
    porEtapa,
    propostas,
    fechados,
    conversao,
    porOrigem: Array.from(origens.entries())
      .map(([origem, v]) => ({ origem, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}
