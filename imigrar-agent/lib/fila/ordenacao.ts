// A FILA DE PRAZOS — a regra de ordem, isolada e testável.
//
// A tela inicial não é uma tabela ordenada por data. É uma fila de trabalho em três
// blocos, e a ordem entre eles não é preferência estética: é a ordem em que uma demora
// custa caro.
//
//   BLOCO 1  prazo sinalizado, data ainda não confirmada  → alguém precisa ligar HOJE
//   BLOCO 2  prazo confirmado, correndo                   → por data limite crescente
//   BLOCO 3  o resto do trabalho                          → mais antigo primeiro
//
// Duas decisões que valem o comentário:
//
// 1. O bloco 1 vem ANTES do bloco 2 mesmo quando o bloco 2 tem um caso vencendo amanhã.
//    Um prazo confirmado é um risco medido; um prazo não confirmado é um risco de
//    tamanho desconhecido, e a única forma de saber é ligar. Enquanto a data não existe,
//    não há contador — inventar um seria o mesmo erro que a regra toda evita.
//
// 2. O bloco 3 ordena do MAIS ANTIGO para o mais recente, ao contrário do funil de
//    vendas que originou este código. Lead parado é lead esfriando: o que está há três
//    dias sem resposta precisa aparecer acima do que chegou agora.

import type { Classificacao, Lead } from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { diaEmBrasilia } from "@/lib/dashboard/periodo";

/** O lead como a fila o lê: o registro + quando foi o último contato daquela conversa. */
export interface LeadDaFila extends Lead {
  ultimoContatoEm?: string | null;
  responsavelNome?: string | null;
}

/**
 * Três faixas, e `vencido`. A cor mais forte da interface pertence a `critico` e a nada
 * mais — se tudo chama atenção, nada chama.
 */
export type FaixaPrazo = "vencido" | "critico" | "atencao" | "acompanhamento";

export interface ItemComPrazo {
  lead: LeadDaFila;
  diasRestantes: number;
  faixa: FaixaPrazo;
}

export interface Fila {
  /** BLOCO 1 — prazo sinalizado pela IA, data limite ainda não confirmada por humano. */
  aConfirmar: LeadDaFila[];
  /** BLOCO 2 — prazo confirmado, ordenado por data limite crescente. */
  correndo: ItemComPrazo[];
  /** BLOCO 3 — o trabalho sem prazo processual, mais antigo primeiro. */
  normal: LeadDaFila[];
  /** Fora da fila: CURIOSO, DPU e FORA_ESCOPO. Vivem na aba de conversas filtradas. */
  filtradas: LeadDaFila[];
}

/** Desfechos: saem da fila, mas continuam no histórico e nas métricas. */
function encerrado(l: LeadDaFila): boolean {
  return l.atendimentoStatus === "fechado" || l.atendimentoStatus === "perdido";
}

/**
 * Tem prazo correndo? A IA sinaliza pelo booleano; a classificação QUENTE_PRAZO diz a
 * mesma coisa por outro caminho. Aceitar as duas evita o caso em que um lead
 * classificado como prazo, mas sem o booleano, sumiria dos dois blocos de prazo.
 */
export function temPrazo(l: Pick<Lead, "temPrazoCorrendo" | "classificacao">): boolean {
  return !!l.temPrazoCorrendo || l.classificacao === "QUENTE_PRAZO";
}

/**
 * Dias de calendário até a data limite, contados em Brasília. Zero = vence hoje.
 *
 * Calendário e não 24h: quem olha o painel às 23h de segunda com prazo na terça precisa
 * ler "vence amanhã", não "faltam 0,9 dias". E o "hoje" sai do fuso de Brasília porque o
 * processo roda em UTC na Vercel — das 21h à meia-noite o servidor já está no dia
 * seguinte, e o contador adiantaria um dia todas as noites.
 */
export function diasRestantes(dataLimite: string, agora: Date = new Date()): number {
  const hoje = Date.parse(`${diaEmBrasilia(agora)}T00:00:00Z`);
  const limite = Date.parse(`${dataLimite.slice(0, 10)}T00:00:00Z`);
  return Math.round((limite - hoje) / 86_400_000);
}

export function faixaDoPrazo(dias: number): FaixaPrazo {
  if (dias < 0) return "vencido";
  if (dias <= 3) return "critico";
  if (dias <= 7) return "atencao";
  return "acompanhamento";
}

/** Prioridade dentro do bloco 3. Não classificado fica por último, mas nunca some. */
const ORDEM_NORMAL: Classificacao[] = [
  "QUENTE_JUDICIAL",
  "MORNO_ADMINISTRATIVO",
  "EXTERIOR_VISTO",
];

function pesoNormal(c: Classificacao | null | undefined): number {
  const i = c ? ORDEM_NORMAL.indexOf(c) : -1;
  return i >= 0 ? i : ORDEM_NORMAL.length;
}

/** Quando este lead se mexeu pela última vez. É por aqui que "parado" se mede. */
export function ultimaAtividade(l: LeadDaFila): number {
  return Date.parse(l.ultimoContatoEm ?? l.updatedAt ?? l.createdAt);
}

export function montarFila(leads: LeadDaFila[], agora: Date = new Date()): Fila {
  const aConfirmar: LeadDaFila[] = [];
  const correndo: ItemComPrazo[] = [];
  const normal: LeadDaFila[] = [];
  const filtradas: LeadDaFila[] = [];

  for (const lead of leads) {
    if (eFiltrada(lead.classificacao)) {
      filtradas.push(lead);
      continue;
    }
    if (encerrado(lead)) continue;

    if (lead.prazoDataLimite) {
      const dias = diasRestantes(lead.prazoDataLimite, agora);
      correndo.push({ lead, diasRestantes: dias, faixa: faixaDoPrazo(dias) });
      continue;
    }
    if (temPrazo(lead)) {
      aConfirmar.push(lead);
      continue;
    }
    normal.push(lead);
  }

  // Bloco 1: quem está esperando confirmação há mais tempo aparece primeiro. É o item
  // que já custou mais dias sem que ninguém soubesse quantos dias sobravam.
  aConfirmar.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  // Bloco 2: data limite crescente. Empate desempata pelo mais antigo.
  correndo.sort(
    (a, b) =>
      Date.parse(a.lead.prazoDataLimite!) - Date.parse(b.lead.prazoDataLimite!) ||
      Date.parse(a.lead.createdAt) - Date.parse(b.lead.createdAt),
  );

  // Bloco 3: judicial primeiro, e dentro de cada grupo o mais parado no topo.
  normal.sort(
    (a, b) =>
      pesoNormal(a.classificacao) - pesoNormal(b.classificacao) ||
      ultimaAtividade(a) - ultimaAtividade(b),
  );

  filtradas.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { aConfirmar, correndo, normal, filtradas };
}

/**
 * PRAZOS PERDIDOS. Precisa ser zero, e precisa estar visível.
 *
 * Vencido e ainda aberto continua contando: fechar a conversa é o que tira o caso da
 * lista, e é uma decisão de gente. Some sozinho seria a métrica se escondendo.
 */
export function prazosPerdidos(leads: LeadDaFila[], agora: Date = new Date()): LeadDaFila[] {
  return leads.filter(
    (l) => l.prazoDataLimite && !encerrado(l) && diasRestantes(l.prazoDataLimite, agora) < 0,
  );
}

/** Rótulo do contador. Inequívoco de propósito: "vence hoje" não é "0 dias". */
export function rotuloPrazo(dias: number): string {
  if (dias < -1) return `vencido há ${Math.abs(dias)} dias`;
  if (dias === -1) return "vencido ontem";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `faltam ${dias} dias`;
}
