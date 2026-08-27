// FREIO DE ENCAMINHAMENTO.
//
// Num atendimento comercial este portão existia para EVITAR o encaminhamento precoce.
// Aqui ele é bem mais frouxo, e de propósito: numa assessoria de imigração, encaminhar
// cedo é o desenho do serviço, e segurar quem está com um prazo correndo ou com medo é
// que seria o erro. O que sobrou de freio é só contra o reflexo de despachar quem mandou
// um "oi": a primeira mensagem, sozinha e sem nenhum sinal, não vira transbordo.
//
// Passa sempre, desde a primeira mensagem: risco à pessoa, pedido explícito por um
// humano/advogado, e qualquer sinal do domínio (situação irregular, processo em
// andamento, refúgio, prazo, honorários). Note que NÃO se exige saber o nome — quem está
// assustado pede ajuda antes de se apresentar.

export const EMERGENCIA =
  /\b(acidente|incend|inc[êe]ndio|fogo|amea[çc]|viol[êe]nc|agress|assalt|roub|emerg[êe]nc|socorro|ambul[âa]nc|passando mal|desmai|hospital|pol[íi]cia|bombeir|vazamento de g[áa]s|persegui[çc][ãa]o|risco de vida|tr[áa]fico de pessoas)/i;

/**
 * Sinais de que a conversa já é um CASO, e não uma dúvida geral. Qualquer um deles
 * libera o encaminhamento na hora, mesmo na primeira mensagem: são exatamente as
 * situações que o prompt manda levar ao time jurídico sem intermediar.
 */
export const CASO_JURIDICO =
  /\b(ref[úu]gio|refugiad|as[íi]lo|conare|crian[çc]a desacompanhad|menor desacompanhad|apatrid|irregular|indocumentad|sem documento|documento vencido|visto vencido|passei do prazo|overstay|deporta|expuls[ãa]o|indefer|negaram|recurso|notifica[çc][ãa]o|intima[çc][ãa]o|exig[êe]ncia|protocolo|meu processo|prazo|vence|venceu|honor[áa]rio|quanto custa|quanto cobram|voc[êe]s cobram|qual o valor)/i;

export const PEDIU_HUMANO =
  /\b(falar|conversar|atendimento)\s+com\s+(um[a]?\s+)?(atendente|humano|pessoa|algu[ée]m|respons[áa]vel|consultor|especialista|supervisor|gerente|vendedor|advogad[oa]|doutor[a]?)\b|\bme\s+(transfere|passa para)\b|\bquero\s+(um[a]?\s+)?(atendente|humano|consultor|advogad[oa]|especialista)\b|\bchama[r]?\s+(o|a)\s+(respons[áa]vel|advogad[oa])\b|(^|[^a-zà-ú])rob[ôo](?![a-zà-ú])/i;

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
  if (EMERGENCIA.test(texto)) return { liberado: true, motivo: "risco à pessoa" };
  if (PEDIU_HUMANO.test(texto)) return { liberado: true, motivo: "a pessoa pediu um humano" };
  if (CASO_JURIDICO.test(texto)) return { liberado: true, motivo: "caso que exige advogado" };
  if (i.userTurns < 2) {
    return { liberado: false, motivo: "primeira mensagem, sem nenhum sinal de caso concreto" };
  }
  // Saber o nome NÃO é condição aqui. Numa assessoria de imigração, exigir apresentação
  // antes de levar o caso a um advogado atrasa justamente quem tem mais pressa.
  return { liberado: true, motivo: "atendimento em andamento" };
}

// ─── O PORTÃO DA TOOL DE ENCAMINHAMENTO ───
//
// Este portão existe porque o prompt sozinho não segura o modelo: a mesma função é chamada
// pelo motor determinístico e pela rede anti-repetição. O que mudou com o domínio foi o
// SENTIDO dele.
//
// Na base comercial, ele segurava o encaminhamento até a proposta sair. Numa assessoria de
// imigração isso seria o avesso do serviço: quem descreve um caso concreto TEM que chegar
// ao advogado, e rápido. Então aqui ele libera por padrão e segura um caso só — a conversa
// que ainda não tem nada: nenhum sinal de caso, nenhum pedido por uma pessoa e nenhuma
// qualificação. É o freio contra despachar quem acabou de mandar "oi".
//
// A FICHA MÍNIMA ENTRA POR `dossieCompleto`. Quem define o que é "completo" é
// `qualificacaoFaltando`, e desde a v3 ela exige nome, nacionalidade, onde a pessoa está,
// o que ela quer, alguma noção do relógio do caso e a resposta ao teste de intenção. Foi
// exatamente uma ficha vazia — sem o nome, sem saber quando começavam as aulas, sem
// ninguém ter perguntado se a pessoa queria contratar — que motivou este freio.
//
// A EXCEÇÃO CONTINUA VALENDO E VEM ANTES: prazo correndo, situação irregular, refúgio,
// pedido explícito por um advogado ou risco à pessoa passam com a ficha pela metade. Ficha
// incompleta custa uma pergunta a mais; prazo perdido custa o caso.

export interface EncaminhamentoComercialInput {
  /** A ficha mínima (nome, nacionalidade, onde está, objetivo, relógio, intenção) está completa? */
  dossieCompleto: boolean;
  /** Últimas mensagens da pessoa — é nelas que se vê o caso concreto e o pedido de humano. */
  textoRecente: string;
  /** O assunto casa com uma regra de transbordo (processo, irregularidade, refúgio…)? */
  assuntoExigePessoa: boolean;
}

export interface EncaminhamentoComercialResult {
  liberado: boolean;
  motivo: string;
}

export function avaliarEncaminhamentoComercial(
  i: EncaminhamentoComercialInput,
): EncaminhamentoComercialResult {
  const texto = i.textoRecente ?? "";
  if (EMERGENCIA.test(texto)) return { liberado: true, motivo: "risco à pessoa" };
  if (PEDIU_HUMANO.test(texto)) return { liberado: true, motivo: "a pessoa pediu um humano" };
  if (CASO_JURIDICO.test(texto)) return { liberado: true, motivo: "caso que exige advogado" };
  if (i.assuntoExigePessoa) return { liberado: true, motivo: "assunto que exige análise jurídica" };
  if (i.dossieCompleto) return { liberado: true, motivo: "ficha mínima completa" };
  return {
    liberado: false,
    motivo:
      "não há nada urgente aqui e a ficha ainda está pela metade — continue a entrevista antes de encaminhar",
  };
}
