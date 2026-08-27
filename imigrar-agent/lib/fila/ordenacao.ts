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

import type { AmbienteInstancia, Classificacao, Lead } from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { diaEmBrasilia } from "@/lib/dashboard/periodo";
import { slaHumanoEstourado } from "@/lib/agent/expediente";

/** O lead como a fila o lê: o registro + quando foi o último contato daquela conversa. */
export interface LeadDaFila extends Lead {
  ultimoContatoEm?: string | null;
  responsavelNome?: string | null;
  /**
   * Quem falou por último. É a informação que separa "esperando eu" de "esperando o
   * cliente" — e sem ela todo lead parado parece igual, quando na verdade metade está
   * esperando uma ação nossa e a outra metade está legitimamente esperando a pessoa.
   */
  ultimaMensagemDe?: "user" | "assistant" | null;
  /**
   * Onde a conversa aconteceu. Teste NÃO entra na fila de trabalho: um ensaio no meio da
   * fila é indistinguível de um caso, e alguém vai gastar uma ligação com ele.
   */
  ambiente?: AmbienteInstancia;
  /**
   * O relógio da primeira resposta humana. Preenchido quando a mensagem chegou com o
   * agente desligado e ninguém respondeu ainda.
   */
  aguardandoHumanoDesde?: string | null;
  /** SLA da instância por onde a conversa entrou, em minutos de expediente. */
  slaMinutos?: number | null;
}

/** O SLA da primeira resposta humana estourou neste caso? */
export function esperandoHumanoDemais(l: LeadDaFila, agora: Date = new Date()): boolean {
  return slaHumanoEstourado(l.aguardandoHumanoDesde, l.slaMinutos ?? 30, agora);
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

/**
 * O RELÓGIO DO CASO, quando tem data — e por que ele NÃO é um quarto bloco.
 *
 * "As aulas começam em março" é tranquilo em novembro e é emergência em fevereiro. Sem
 * data, ninguém vê a virada: a frase na ficha continua idêntica enquanto a coisa que ela
 * descreve muda de natureza. Com data, o lead sobe dentro do BLOCO 3 quando entra na
 * janela — e para aí.
 *
 * Não vira bloco de prazo, não liga `temPrazoCorrendo` e não usa a cor do prazo, porque
 * não é a mesma coisa: perder o início das aulas custa um semestre, perder um prazo de
 * defesa custa o caso. Misturar os dois é como o bloco de prazos deixa de ser levado a
 * sério — e aí o que se perde é o prazo de verdade.
 */
export const RELOGIO_APERTADO_DIAS = 30;

/** Dias até a data do relógio. Mesma contagem de calendário, em Brasília, do prazo. */
export function diasDoRelogio(l: Pick<Lead, "relogioData">, agora: Date = new Date()): number | null {
  if (!l.relogioData) return null;
  const d = diasRestantes(l.relogioData, agora);
  return Number.isFinite(d) ? d : null;
}

/** Está dentro da janela? Vencido também conta: ninguém percebeu passar. */
export function relogioApertado(
  l: Pick<Lead, "relogioData">,
  agora: Date = new Date(),
  janela: number = RELOGIO_APERTADO_DIAS,
): boolean {
  const d = diasDoRelogio(l, agora);
  return d !== null && d <= janela;
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
    // CONVERSA DE TESTE NÃO ENTRA NA FILA DE TRABALHO. Nem em `filtradas`: aquela aba
    // existe para auditar o que o agente descartou, e um ensaio ali é ruído que faz a
    // amostragem mentir. Ensaio se olha na tela de sombra, não na fila do time.
    if (lead.ambiente === "teste") continue;

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

  // Bloco 3: primeiro quem tem relógio apertado (o mais próximo de vencer no topo, e o
  // que já passou acima de todos); depois a ordem de sempre — judicial primeiro, e
  // dentro de cada grupo o mais parado no alto.
  //
  // E ACIMA DE TUDO ISSO: quem chegou com o agente desligado e ainda não teve resposta
  // humana NENHUMA, com o SLA estourado. É o caso em que a promessa do modo desligado
  // ("alguém responde") já foi quebrada — e a única coisa que impede "desligado" de
  // virar "ignorado" é este caso subir até alguém pegá-lo.
  normal.sort((a, b) => {
    const ea = esperandoHumanoDemais(a, agora);
    const eb = esperandoHumanoDemais(b, agora);
    if (ea !== eb) return ea ? -1 : 1;
    if (ea && eb) {
      // Entre dois estourados, quem espera há mais tempo primeiro.
      return Date.parse(a.aguardandoHumanoDesde!) - Date.parse(b.aguardandoHumanoDesde!);
    }
    const ra = relogioApertado(a, agora) ? diasDoRelogio(a, agora)! : null;
    const rb = relogioApertado(b, agora) ? diasDoRelogio(b, agora)! : null;
    if (ra !== null && rb !== null) return ra - rb || ultimaAtividade(a) - ultimaAtividade(b);
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    return (
      pesoNormal(a.classificacao) - pesoNormal(b.classificacao) ||
      ultimaAtividade(a) - ultimaAtividade(b)
    );
  });

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

/**
 * Rótulo do relógio do caso. Deliberadamente diferente do `rotuloPrazo`: quem varre a
 * fila precisa distinguir num relance "as aulas começam em 12 dias" de "faltam 12 dias
 * para protocolar a defesa". Mesma tipografia para as duas coisas seria o começo de as
 * duas serem tratadas igual.
 */
export function rotuloRelogio(dias: number): string {
  if (dias < -1) return `passou há ${Math.abs(dias)} dias`;
  if (dias === -1) return "passou ontem";
  if (dias === 0) return "é hoje";
  if (dias === 1) return "é amanhã";
  return `em ${dias} dias`;
}
