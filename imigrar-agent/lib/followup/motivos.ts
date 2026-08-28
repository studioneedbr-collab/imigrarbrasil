// O MOTIVO DA ESPERA — a premissa do follow-up neste domínio.
//
// Em imigração o tempo morto é DO CLIENTE, não do vendedor. A pessoa some três semanas
// porque está esperando certidão do consulado, apostilamento, tradução juramentada ou
// agendamento na Polícia Federal. Nada disso depende dela, e nada disso anda mais rápido
// porque alguém perguntou.
//
// É por isso que a cadência de vendas não serve aqui. "Passando para saber se ainda tem
// interesse", mandada a quem está há duas semanas na fila do consulado, não é insistência
// inútil: é a prova de que o escritório não sabe em que pé está o caso dela. O follow-up
// tem de ser sobre O QUE ESTAMOS ESPERANDO — e para isso o motivo precisa estar gravado.
//
// A CADÊNCIA É SUGESTÃO, NÃO REGRA. O número aqui é o ponto de partida que a tela propõe
// quando alguém pausa o caso; o responsável ajusta caso a caso, porque um consulado que
// respondeu em 40 dias na semana passada não vira média de 30.

export type MotivoEspera =
  | "documento_com_cliente"
  | "consulado"
  | "policia_federal"
  | "traducao_apostilamento"
  | "decisao_proposta"
  | "pagamento"
  | "retomar_depois";

export const MOTIVOS_DE_ESPERA: MotivoEspera[] = [
  "documento_com_cliente",
  "consulado",
  "policia_federal",
  "traducao_apostilamento",
  "decisao_proposta",
  "pagamento",
  "retomar_depois",
];

export const MOTIVO_ESPERA_LABEL: Record<MotivoEspera, string> = {
  documento_com_cliente: "Aguardando documento com o cliente",
  consulado: "Aguardando consulado",
  policia_federal: "Aguardando Polícia Federal",
  traducao_apostilamento: "Aguardando tradução ou apostilamento",
  decisao_proposta: "Aguardando decisão sobre a proposta",
  pagamento: "Aguardando pagamento",
  retomar_depois: "Cliente pediu para retomar depois",
};

/**
 * Dias até o próximo toque, por motivo.
 *
 * `retomar_depois` é `null` de propósito: a data vem da pessoa ("me procura em março"), e
 * inventar uma cadência por cima disso é desrespeitar exatamente o que ela pediu. Nesse
 * caso a tela EXIGE a data em vez de sugerir uma.
 */
export const CADENCIA_DIAS: Record<MotivoEspera, number | null> = {
  documento_com_cliente: 3,
  consulado: 30,
  policia_federal: 30,
  traducao_apostilamento: 15,
  decisao_proposta: 2,
  pagamento: 3,
  retomar_depois: null,
};

/**
 * O TETO DE TOQUES POR MOTIVO DE ESPERA.
 *
 * Follow-up sem fim gera lead zumbi e incomoda quem já decidiu não responder — e quem se
 * incomoda bloqueia e denuncia, que é o que derruba o número do escritório. Depois do
 * terceiro toque sem resposta o caso vai para PERDIDO com motivo "sumiu", e sai uma
 * última mensagem dizendo que o escritório fica à disposição quando ela quiser retomar.
 *
 * O contador é POR MOTIVO: quem esperou o consulado, respondeu, e agora espera pagamento
 * começa do zero. E qualquer resposta da pessoa zera — ela voltou, a conversa é outra.
 */
export const MAX_TOQUES = 3;

/** A data sugerida para o próximo toque. Nula quando quem marca a data é a pessoa. */
export function proximoToqueSugerido(motivo: MotivoEspera, de: Date = new Date()): Date | null {
  const dias = CADENCIA_DIAS[motivo];
  if (dias === null) return null;
  return new Date(de.getTime() + dias * 24 * 3600 * 1000);
}
