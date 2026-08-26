// AS MÉTRICAS DESTE PAINEL.
//
// O painel que originou este código media receita, ticket médio e conversão. Aqui a
// pergunta é outra: QUANTO TEMPO DO TIME O AGENTE ECONOMIZOU — e, do outro lado da
// mesma moeda, se ele está economizando tempo demais.
//
// A métrica que protege o projeto é a TAXA DE RESGATE. Um agente que filtra demais
// parece ótimo nos números — pouca conversa chegando ao time — enquanto destrói o
// negócio em silêncio. Só o resgate (humano devolvendo à fila alguém que o agente
// descartou) mostra isso cedo. Se ela sobe, o agente está descartando gente demais.
//
// Não há gráfico de receita, ticket médio ou previsão de faturamento. Não é o que este
// time acompanha.

import type { Classificacao, Reclassificacao } from "@/lib/domain/types";
import { CLASSIFICACOES, CLASSIFICACOES_FILTRADAS, eFiltrada } from "@/lib/domain/types";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import { prazosPerdidos } from "@/lib/fila/ordenacao";

export interface Metricas {
  /** Recorte usado, em ISO — o rodapé da tela mostra para não haver dúvida. */
  periodo: { de: string; ate: string };
  atendidas: number;
  porIdioma: Array<{ idioma: string; total: number }>;
  /** O número que justifica o projeto: o que o time NÃO precisou olhar. */
  filtradas: { total: number; porClassificacao: Array<{ classificacao: Classificacao; total: number }> };
  /** O que efetivamente chegou ao time, por classificação. */
  qualificados: { total: number; porClassificacao: Array<{ classificacao: Classificacao; total: number }> };
  /** Filtrados que um humano devolveu à fila. Sobe = o agente está descartando demais. */
  resgate: { resgatados: number; base: number; taxa: number };
  /** Quanto o humano discorda da IA. */
  reclassificacao: { reclassificados: number; base: number; taxa: number };
  /**
   * Tempo até um humano assumir, em minutos. Medido separadamente para QUENTE_PRAZO —
   * a média geral esconde justamente o caso em que a demora custa o caso.
   */
  tempoAteHumano: { geralMin: number | null; quentePrazoMin: number | null; semAssumir: number };
  /** Precisa ser zero, e precisa estar visível. */
  prazosPerdidos: LeadDaFila[];
}

function noPeriodo(iso: string | null | undefined, de: Date, ate: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= de.getTime() && t <= ate.getTime();
}

function contar(leads: LeadDaFila[], quais: Classificacao[]) {
  return quais
    .map((c) => ({ classificacao: c, total: leads.filter((l) => l.classificacao === c).length }))
    .filter((r) => r.total > 0);
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Minutos entre a chegada do lead e o momento em que um humano assumiu. */
function minutosAteHumano(l: LeadDaFila): number | null {
  if (!l.assumidoEm) return null;
  const min = (Date.parse(l.assumidoEm) - Date.parse(l.createdAt)) / 60_000;
  return Number.isFinite(min) && min >= 0 ? min : null;
}

export function calcularMetricas(
  todosOsLeads: LeadDaFila[],
  reclassificacoes: Reclassificacao[],
  de: Date,
  ate: Date,
  agora: Date = new Date(),
): Metricas {
  const leads = todosOsLeads.filter((l) => noPeriodo(l.createdAt, de, ate));

  const filtradas = leads.filter((l) => eFiltrada(l.classificacao));
  const qualificados = leads.filter((l) => l.classificacao && !eFiltrada(l.classificacao));

  // Idioma desconhecido aparece como tal em vez de sumir: é ele que denuncia quando a
  // detecção parou de funcionar para alguma língua.
  const idiomas = new Map<string, number>();
  for (const l of leads) {
    const k = (l.idioma ?? "").trim().toLowerCase() || "—";
    idiomas.set(k, (idiomas.get(k) ?? 0) + 1);
  }

  // RESGATE. A base é tudo que o agente filtrou no período — inclusive o que já voltou.
  // Usar só o que continua filtrado faria a taxa cair justamente quando o resgate sobe.
  const resgatadosNoPeriodo = todosOsLeads.filter((l) => noPeriodo(l.resgatadoEm, de, ate));
  const baseResgate = filtradas.length + resgatadosNoPeriodo.length;

  // RECLASSIFICAÇÃO. Base = leads que a IA classificou; numerador = os que um humano
  // mudou de classificação. Um mesmo lead reclassificado duas vezes conta uma vez.
  const baseReclass = leads.filter((l) => l.classificacaoIa).length;
  const idsNoPeriodo = new Set(leads.map((l) => l.id));
  const reclassificados = new Set(
    reclassificacoes.filter((r) => idsNoPeriodo.has(r.leadId)).map((r) => r.leadId),
  ).size;

  const temposGeral = leads.map(minutosAteHumano).filter((n): n is number => n !== null);
  const temposPrazo = leads
    .filter((l) => l.classificacao === "QUENTE_PRAZO" || l.temPrazoCorrendo)
    .map(minutosAteHumano)
    .filter((n): n is number => n !== null);

  return {
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    atendidas: leads.length,
    porIdioma: Array.from(idiomas, ([idioma, total]) => ({ idioma, total })).sort(
      (a, b) => b.total - a.total,
    ),
    filtradas: {
      total: filtradas.length,
      porClassificacao: contar(filtradas, CLASSIFICACOES_FILTRADAS),
    },
    qualificados: {
      total: qualificados.length,
      porClassificacao: contar(
        qualificados,
        CLASSIFICACOES.filter((c) => !CLASSIFICACOES_FILTRADAS.includes(c)),
      ),
    },
    resgate: {
      resgatados: resgatadosNoPeriodo.length,
      base: baseResgate,
      taxa: baseResgate ? resgatadosNoPeriodo.length / baseResgate : 0,
    },
    reclassificacao: {
      reclassificados,
      base: baseReclass,
      taxa: baseReclass ? reclassificados / baseReclass : 0,
    },
    tempoAteHumano: {
      geralMin: media(temposGeral),
      quentePrazoMin: media(temposPrazo),
      semAssumir: leads.filter((l) => !l.assumidoEm && l.atendimentoStatus === "novo").length,
    },
    prazosPerdidos: prazosPerdidos(todosOsLeads, agora),
  };
}
