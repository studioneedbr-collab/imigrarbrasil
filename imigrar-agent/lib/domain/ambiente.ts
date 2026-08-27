// ENSAIO NÃO É ATENDIMENTO — a regra, num lugar só.
//
// A separação por ambiente já existia na instância Z-API (migration 023): conversa de
// teste não entra na fila, não entra no quadro e não entra nas métricas. O que faltava
// era o SIMULADOR, que nasce sem instância nenhuma e por isso caía no padrão `producao`.
//
// O resultado apareceu na tela: `sim:v2-5`, `sim:v2-6`, `sim:v2-7`, `sim:v2-12` e
// `sim:at-8-3` na fila de trabalho e no quadro, misturados com gente de verdade. Quem
// abre o painel às oito da manhã não tem como saber que três daqueles casos são ensaio —
// e o custo de descobrir isso caso a caso é maior do que o de não ter a tela.
//
// A leitura é do PRÓPRIO NÚMERO porque isso conserta o passado junto: as conversas de
// ensaio que já estão no banco com `ambiente = 'producao'` somem da fila sem ninguém
// precisar rodar UPDATE.

import type { AmbienteInstancia } from "@/lib/domain/types";

/** Prefixo dos números criados pelo simulador. Contato real nunca começa assim. */
export const PREFIXO_SIMULADOR = "sim:";

/** Esta conversa é ensaio (simulador)? */
export function ehEnsaio(whatsappNumber?: string | null): boolean {
  return (whatsappNumber ?? "").startsWith(PREFIXO_SIMULADOR);
}

/**
 * O ambiente efetivo de uma conversa: o que está gravado, com o simulador por cima e
 * `producao` como padrão para quem é anterior à migration 023.
 */
export function ambienteDaConversa(conv?: {
  whatsappNumber?: string | null;
  ambiente?: AmbienteInstancia | null;
} | null): AmbienteInstancia {
  if (ehEnsaio(conv?.whatsappNumber)) return "teste";
  return conv?.ambiente ?? "producao";
}

/** Entra na fila, no quadro e nas métricas? */
export function contaComoOperacaoReal(ambiente?: AmbienteInstancia | null): boolean {
  return ambiente !== "teste";
}
