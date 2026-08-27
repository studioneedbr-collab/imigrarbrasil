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
  /\b(ref[úu]gio|refugiad|as[íi]lo|conare|crian[çc]a desacompanhad|menor desacompanhad|apatrid|irregular|indocumentad|sem documento|documento vencido|visto vencido|passei do prazo|overstay|deporta|expuls[ãa]o|indefer|negaram|recurso|notifica[çc][ãa]o|intima[çc][ãa]o|exig[êe]ncia|protocolo|meu processo|prazo|vence|venceu|honor[áa]rio|quanto custa|quanto cobram|voc[êe]s cobram|qual o valor|multa|deportaci[óo]n|expulsi[óo]n|denegad|denegaron|rechazad|rechazaron|notificaci[óo]n|citaci[óo]n|mi proceso|mi caso|plazo|venci[óo]|vencid[oa]|sin documentos|cu[áa]nto (cuesta|cobran|sale)|honorarios|deadline|expired|overstayed|how much (do you charge|is it))/i;

export const PEDIU_HUMANO =
  /\b(falar|conversar|atendimento)\s+com\s+(um[a]?\s+)?(atendente|humano|pessoa|algu[ée]m|respons[áa]vel|consultor|especialista|supervisor|gerente|vendedor|advogad[oa]|doutor[a]?)\b|\bme\s+(transfere|passa para)\b|\bquero\s+(um[a]?\s+)?(atendente|humano|consultor|advogad[oa]|especialista)\b|\bchama[r]?\s+(o|a)\s+(respons[áa]vel|advogad[oa])\b|(^|[^a-zà-ú])rob[ôo](?![a-zà-ú])|\b(hablar|conversar)\s+con\s+(un[a]?\s+)?(abogad[oa]|persona|alguien|humano|asesor|especialista|responsable)\b|\bquiero\s+(un[a]?\s+)?(abogad[oa]|persona|humano|asesor|especialista)\b|\b(speak|talk)\s+(to|with)\s+(a\s+)?(lawyer|attorney|human|person|someone|solicitor)\b/i;

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

// ─── CONFIRMAÇÃO NÃO É "ELA RESPONDEU ALGUMA COISA" ───
//
// O prompt manda avisar, perguntar se a pessoa quer o contato e só transferir depois do
// sim. Isso funcionou até a conversa em que não funcionou: a Ana escreveu "espero tu
// confirmación para pasar el contacto", a pessoa respondeu "me llamo Ana Rodríguez, vivo
// en Boa Vista desde el año pasado", e a Ana respondeu "ya pasé tu caso al equipo
// jurídico".
//
// Ela não confirmou nada — respondeu OUTRA coisa. E o problema não é só o encaminhamento
// (que naquele caso até estava certo, porque havia multa migratória correndo): é a Ana ter
// escrito como se a pessoa tivesse concordado. Quem descobre que foi passado adiante sem
// ter dito sim para de contar o que importa.
//
// Este portão é o lado determinístico da regra. Quando a última mensagem da Ana PEDIU
// confirmação e a resposta da pessoa não é um sim, a tool sai da mesa naquele turno.
//
// A EXCEÇÃO VEM ANTES DE TUDO, como em todo portão deste arquivo: risco à pessoa, prazo
// processual correndo e pedido explícito por um advogado passam sem confirmação nenhuma.
// Nesses casos a Ana não espera — ela avisa que está passando AGORA, e é isso que o
// prompt manda escrever.

/**
 * A Ana pediu confirmação na última mensagem dela?
 *
 * Reconhece as formas em que a pergunta realmente aparece, nos idiomas do atendimento:
 * "posso pedir para eles falarem com você?", "¿puedo pasar tu contacto?", "espero tu
 * confirmación", "may I ask them to get in touch?".
 */
export const PEDIDO_DE_CONFIRMACAO =
  /\b(posso|poderia)\s+(pedir|passar|encaminhar|chamar)\b|\bquer\s+que\s+(eu\s+)?(pe[çc]a|passe|encaminhe|chame)\b|\bvoc[êe]\s+quer\s+que\s+(o|a)\s+(time|equipe)\b|\bconfirma\s+(para|pra)\s+eu\b|\baguardo\s+(a\s+)?sua\s+confirma[çc][ãa]o\b|\bpuedo\s+(pedir|pasar|derivar|pasarte)\b|\bquieres\s+que\s+(les\s+)?(pida|pase|derive)\b|\bespero\s+tu\s+confirmaci[óo]n\b|\bme\s+confirmas\b|\bmay\s+i\s+(ask|pass|have)\b|\bwould\s+you\s+like\s+(me\s+)?to\b|\bshall\s+i\s+(ask|pass)\b|\bpuis-je\s+(demander|transmettre)\b/i;

/**
 * A pessoa disse SIM?
 *
 * Deliberadamente CURTA e ancorada no começo da mensagem. Aceitar "sim" em qualquer lugar
 * do texto reabriria o buraco pela outra ponta: "no sé si sí o no, primero dime cuánto
 * cuesta" contém "sí" e não é confirmação nenhuma. Quem confirma, confirma curto.
 */
const AFIRMATIVAS = new Set([
  "sim", "si", "yes", "yeah", "yep", "oui", "claro", "isso", "exato", "exacto",
  "ok", "okay", "okey", "vale", "dale", "bueno", "beleza", "ta", "pode", "podem",
  "quero", "quiero", "please", "porfa", "manda", "manden", "perfeito", "perfecto",
  "combinado", "acuerdo", "aham", "uhum",
]);

/**
 * O que desmancha um sim aparente. "estou pensando ainda", "sí pero espera", "no sé si
 * sí o no" — todas contêm uma palavra afirmativa e nenhuma é confirmação.
 */
const DESMANCHA = new Set([
  "nao", "no", "nunca", "nada", "ainda", "todavia", "aun", "espera", "esperar",
  "antes", "primeiro", "primero", "pero", "mas", "but", "talvez", "quizas", "quiza",
  "depende", "duvida", "duda",
]);

/**
 * A pessoa disse SIM?
 *
 * A leitura é por PALAVRA e sobre mensagem curta, e as duas coisas são de propósito.
 * Procurar "sim" em qualquer lugar do texto reabriria o buraco pela outra ponta — "no sé
 * si sí o no, primero dime cuánto cuesta" contém "sí" e não confirma nada. Quem confirma,
 * confirma curto: é "sim", "pode", "claro que sí", "sim, por favor".
 */
export function confirmou(mensagem: string): boolean {
  const palavras = (mensagem ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!palavras.length || palavras.length > 5) return false;
  if (palavras.some((p) => DESMANCHA.has(p))) return false;
  return AFIRMATIVAS.has(palavras[0]) || (palavras.length <= 3 && palavras.some((p) => AFIRMATIVAS.has(p)));
}

export interface ConfirmacaoInput {
  /** A última mensagem que a Ana enviou nesta conversa. */
  ultimaRespostaDoAgente: string;
  /** A última mensagem da pessoa — é ela que confirma, ou não. */
  ultimaMensagem: string;
  /** Últimas mensagens da pessoa juntas, para a leitura de urgência. */
  textoRecente: string;
}

export interface ConfirmacaoResult {
  liberado: boolean;
  motivo: string;
  /**
   * Verdadeiro quando existe uma pergunta de confirmação NO AR e a pessoa ainda não
   * respondeu a ela. O prompt do turno usa isto para a Ana repetir a pergunta com leveza
   * em vez de inventar um sim que não houve.
   */
  confirmacaoPendente: boolean;
}

export function avaliarConfirmacao(i: ConfirmacaoInput): ConfirmacaoResult {
  const dela = i.ultimaMensagem ?? "";
  const recente = i.textoRecente ?? "";

  // A pressa vem primeiro. Prazo perdido custa o caso; confirmação custa uma frase.
  if (EMERGENCIA.test(recente)) {
    return { liberado: true, motivo: "risco à pessoa", confirmacaoPendente: false };
  }
  if (PEDIU_HUMANO.test(recente)) {
    return { liberado: true, motivo: "a pessoa pediu um humano", confirmacaoPendente: false };
  }
  if (CASO_JURIDICO.test(recente)) {
    return {
      liberado: true,
      motivo: "caso com prazo ou irregularidade — encaminha sem esperar confirmação",
      confirmacaoPendente: false,
    };
  }

  const pediu = PEDIDO_DE_CONFIRMACAO.test(i.ultimaRespostaDoAgente ?? "");
  if (!pediu) {
    return { liberado: true, motivo: "não há confirmação pendente", confirmacaoPendente: false };
  }
  if (confirmou(dela)) {
    return { liberado: true, motivo: "a pessoa confirmou", confirmacaoPendente: false };
  }
  return {
    liberado: false,
    motivo:
      "você pediu confirmação e a pessoa respondeu outra coisa — resposta que não responde à pergunta não é um sim",
    confirmacaoPendente: true,
  };
}
