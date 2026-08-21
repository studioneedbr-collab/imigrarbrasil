// FREIO DE ENCAMINHAMENTO.
//
// O prompt manda ela entender o caso antes de encaminhar, mas isso é pedido — e o
// modelo, quando a mensagem toca em "contrato", "férias" ou "reclamação", dispara a
// tool na primeira frase. Aqui a regra deixa de ser pedido e vira condição: enquanto
// ela não tiver o mínimo de um atendimento (saber com quem está falando e ter trocado
// pelo menos uma pergunta), a tool transferir_para_humano nem é oferecida ao modelo.
//
// Duas exceções que passam sempre, desde a primeira mensagem: emergência de verdade e
// pedido explícito para falar com uma pessoa. Segurar qualquer uma das duas seria pior
// do que encaminhar cedo demais.

export const EMERGENCIA =
  /\b(acidente|incend|inc[êe]ndio|fogo|amea[çc]|viol[êe]nc|agress|assalt|roub|emerg[êe]nc|socorro|ambul[âa]nc|passando mal|desmai|hospital|pol[íi]cia|bombeir|vazamento de g[áa]s)/i;

export const PEDIU_HUMANO =
  /\b(falar|conversar|atendimento)\s+com\s+(um[a]?\s+)?(atendente|humano|pessoa|algu[ée]m|respons[áa]vel|consultor|especialista|supervisor|gerente|vendedor)\b|\bme\s+(transfere|passa para)\b|\bquero\s+(um[a]?\s+)?(atendente|humano|consultor|supervisor|gerente)\b|\bchama[r]?\s+(o|a)\s+(respons[áa]vel|gerente|supervisor)\b|(^|[^a-zà-ú])rob[ôo](?![a-zà-ú])/i;

export interface TransferGateInput {
  /** Quantas mensagens o cliente já mandou nesta conversa. */
  userTurns: number;
  /** Já se sabe o nome de quem está falando (registrado no lead)? */
  temNome: boolean;
  /** Última mensagem do cliente. */
  ultimaMensagem: string;
}

export interface TransferGateResult {
  liberado: boolean;
  /** Por que foi liberado ou segurado — vai para o log, ajuda a auditar o atendimento. */
  motivo: string;
}

export function avaliarTransferencia(i: TransferGateInput): TransferGateResult {
  const texto = i.ultimaMensagem ?? "";
  if (EMERGENCIA.test(texto)) return { liberado: true, motivo: "emergência" };
  if (PEDIU_HUMANO.test(texto)) return { liberado: true, motivo: "cliente pediu uma pessoa" };
  if (i.userTurns < 2) {
    return { liberado: false, motivo: "primeira mensagem — ainda não houve atendimento nenhum" };
  }
  if (!i.temNome) {
    return { liberado: false, motivo: "ainda não sabe com quem está falando" };
  }
  return { liberado: true, motivo: "atendimento mínimo feito" };
}

// ─── O COMERCIAL SÓ ENTRA DEPOIS DO PDF ───
//
// Decisão do Eduardo (17/08/2026): a Shayene faz o atendimento comercial inteiro sozinha
// e MANDA A PROPOSTA EM PDF. O comercial humano entra em 1% dos casos, e só depois do
// orçamento — nunca antes. O que acontecia era o contrário: no primeiro tropeço ela
// mandava "já chamei aqui uma pessoa do nosso comercial para fechar isso com você com os
// valores exatos", e um lead que só queria uma cotação virava fila de espera.
//
// Três coisas continuam furando essa trava, porque segurar seria pior:
//   1. o cliente pediu para falar com uma pessoa (ou é emergência);
//   2. o assunto não é cotação — é contrato, financeiro, jurídico, reclamação;
//   3. a triagem está COMPLETA e mesmo assim não dá para cotar (praça sem CCT cadastrada,
//      evento por diária). Esse é o 1%.

export interface EncaminhamentoComercialInput {
  /** Esta conversa já recebeu proposta em PDF? */
  jaTemProposta: boolean;
  /** A triagem comercial (serviço, postos, região, nome, empresa, CNPJ, e-mail) está completa? */
  dossieCompleto: boolean;
  /** Últimas mensagens do cliente — é nelas que se vê pedido de humano e assunto grave. */
  textoRecente: string;
  /** O assunto casa com uma regra de transferência (contrato, jurídico, financeiro…)? */
  assuntoExigePessoa: boolean;
}

export interface EncaminhamentoComercialResult {
  liberado: boolean;
  motivo: string;
}

export function avaliarEncaminhamentoComercial(
  i: EncaminhamentoComercialInput,
): EncaminhamentoComercialResult {
  if (i.jaTemProposta) return { liberado: true, motivo: "a proposta já foi enviada" };
  const texto = i.textoRecente ?? "";
  if (EMERGENCIA.test(texto)) return { liberado: true, motivo: "emergência" };
  if (PEDIU_HUMANO.test(texto)) return { liberado: true, motivo: "cliente pediu uma pessoa" };
  if (i.assuntoExigePessoa) return { liberado: true, motivo: "assunto que exige decisão humana" };
  if (i.dossieCompleto) {
    return { liberado: true, motivo: "triagem completa e ainda assim não dá para cotar" };
  }
  return {
    liberado: false,
    motivo: "cotação em andamento — a proposta em PDF sai antes de envolver o comercial",
  };
}
