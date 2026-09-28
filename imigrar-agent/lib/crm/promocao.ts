import type { AtendimentoStatus, Lead } from "@/lib/domain/types";

/**
 * QUANDO O ATENDIMENTO DA ANA MOVE O CARD SOZINHO.
 *
 * O veredito de qualificação já existia e era gravado em `stage`, o campo do funil
 * comercial antigo. A coluna do CRM é `atendimentoStatus`, e ela nunca era tocada: o
 * sistema decidia "esta pessoa descreveu um caso com prazo correndo" e o card continuava
 * em "Novo lead" ao lado de quem mandou "oi" e sumiu. Todo caso nascia e morria na
 * primeira coluna até alguém arrastar à mão — e a primeira coluna virava a lista de tudo,
 * que é o contrário do que um quadro serve para responder.
 *
 * ── POR QUE A REGRA É TÃO ESTREITA ────────────────────────────────────────────────
 *
 * Automação que move card é automação que reorganiza o trabalho de outras pessoas. Ela
 * só pode agir onde ninguém agiu:
 *
 *  · SÓ DE `novo` PARA `em_atendimento`. Caso que já foi movido — por alguém do time ou
 *    por um desfecho — não é tocado. A automação não desfaz decisão de gente.
 *  · SÓ COM VEREDITO, nunca por volume de conversa. O critério antigo (`score >= 45`)
 *    promovia quem apenas conversou bastante; o veredito exige caso descrito com intenção
 *    declarada ou prazo correndo.
 *  · NUNCA MEXE EM `etapaId`. Se o escritório desenhou três colunas de trabalho, o caso
 *    cai na primeira daquele status e quem conhece o processo decide o resto. Adivinhar a
 *    coluna certa seria a automação desenhando o funil.
 *  · CASO FILTRADO NÃO SOBE. Curioso, DPU e fora de escopo vivem na aba de auditoria —
 *    promovê-los seria desfazer a filtragem pela porta dos fundos.
 */
export function promocaoDoAtendimento(input: {
  lead: Pick<Lead, "atendimentoStatus" | "classificacao"> | null;
  /** O veredito de `computeLeadScore`. */
  veredito: string | null | undefined;
}): AtendimentoStatus | null {
  const lead = input.lead;
  if (!lead) return null;

  const qualifica = input.veredito === "qualificado" || input.veredito === "prioritario";
  if (!qualifica) return null;

  // Filtrada não sobe: ela não está no quadro, e promovê-la a colocaria lá.
  if (lead.classificacao && ["curioso", "dpu", "fora_escopo"].includes(lead.classificacao)) {
    return null;
  }

  const aindaNovo = !lead.atendimentoStatus || lead.atendimentoStatus === "novo";
  return aindaNovo ? "em_atendimento" : null;
}
