// DE ONDE A MENSAGEM VEIO — e por que só uma dessas origens vira atendimento.
//
// O primeiro card do quadro era `12036343001452 6326-g...`. Não é telefone de ninguém: é
// o JID de um GRUPO do WhatsApp. Quer dizer que mensagem de grupo estava abrindo lead, e
// que a Ana estava respondendo DENTRO de grupos — para todo mundo ver.
//
// Isso precisa parar antes de qualquer automação de follow-up. Um follow-up automático
// disparado num grupo é o pior caso possível deste sistema: mensagem não solicitada, para
// dezenas de pessoas de uma vez, saindo do único número do escritório. É assim que um
// número é denunciado e derrubado — e com ele a captação inteira.
//
// A REGRA É FAIL-CLOSED. Na dúvida sobre o que é o remetente, NÃO é conversa individual.
// Os dois erros têm custos muito diferentes: recusar uma mensagem legítima custa um lead
// que volta a escrever; aceitar um grupo custa o número.
//
// Como a Z-API varia o payload conforme a versão e o tipo de chat, a detecção olha três
// coisas independentes — os sinalizadores booleanos, o sufixo do JID e a FORMA do número
// — e basta uma delas acusar.

/** O que produziu esta mensagem. Só `individual` vira conversa, lead e resposta. */
export type OrigemDaMensagem =
  | "individual"
  | "grupo"
  | "transmissao"
  | "status"
  | "canal"
  | "desconhecida";

/**
 * O maior telefone possível no mundo tem 15 dígitos (E.164). Um JID de grupo tem 18 ou
 * mais (`120363430014526326`), e é justamente por passar desse teto que ele se denuncia
 * mesmo quando a Z-API manda o campo sem o sufixo `@g.us`.
 */
const MAX_DIGITOS_E164 = 15;

/** Menos que isto não é telefone discável — nem com o menor DDI do mundo. */
const MIN_DIGITOS_E164 = 8;

const SUFIXOS: Array<{ re: RegExp; origem: OrigemDaMensagem }> = [
  { re: /@g\.us$/i, origem: "grupo" },
  { re: /@broadcast$/i, origem: "transmissao" },
  { re: /@newsletter$/i, origem: "canal" },
];

/**
 * O payload da Z-API, na parte que diz de onde a mensagem veio. Tudo opcional de
 * propósito: os campos mudam entre versões e entre tipos de chat, e um campo ausente não
 * pode ser lido como "é conversa individual".
 */
export interface RemetenteDoPayload {
  phone?: string | null;
  chatName?: string | null;
  isGroup?: boolean | null;
  isNewsletter?: boolean | null;
  isStatusReply?: boolean | null;
  broadcast?: boolean | null;
  /** Presente só em grupo: o telefone de QUEM falou dentro dele. */
  participantPhone?: string | null;
  participantLid?: string | null;
}

/**
 * É JID de grupo, transmissão, status ou canal — qualquer coisa que não seja uma pessoa.
 *
 * `desconhecida` NÃO conta aqui, e a diferença é deliberada: esta função esconde cards do
 * painel, e esconder o caso de alguém por causa de um número mal gravado é o erro caro
 * deste lado. No webhook a régua é a oposta (`ehConversaIndividual`), porque lá o erro
 * caro é responder a um grupo.
 */
export function eConversaDeGrupo(numero?: string | null): boolean {
  const origem = classificarNumero(numero);
  return origem !== "individual" && origem !== "desconhecida";
}

/**
 * A origem lida SÓ pelo número. Existe separada porque conserta o passado junto: os leads
 * de grupo que já estão no banco somem da fila e do quadro sem ninguém precisar rodar
 * UPDATE em produção — a mesma escolha que `ehEnsaio` fez para as conversas de ensaio.
 */
export function classificarNumero(numero?: string | null): OrigemDaMensagem {
  const bruto = (numero ?? "").trim();
  if (!bruto) return "desconhecida";

  // Conversa de ensaio/simulador (`sim:`, `fb:`) não é telefone e também não é grupo.
  // Quem cuida dela é lib/domain/ambiente.ts — aqui ela passa como individual para não
  // ganhar dois donos.
  if (bruto.includes(":")) return "individual";

  if (/^status@/i.test(bruto)) return "status";
  for (const { re, origem } of SUFIXOS) if (re.test(bruto)) return origem;

  // O JID de grupo antigo é `<criador>-<timestamp>` — dois números colados. Não há regra
  // de hífen aqui de propósito: um telefone digitado à mão ("+55 33 99940-2577") também
  // tem hífen, e o que denuncia o grupo é o TAMANHO, que nenhum telefone alcança.
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return "desconhecida";
  if (digitos.length > MAX_DIGITOS_E164) return "grupo";
  if (digitos.length < MIN_DIGITOS_E164) return "desconhecida";
  return "individual";
}

/** A origem lida do payload inteiro: sinalizadores primeiro, depois o número. */
export function origemDaMensagem(body: RemetenteDoPayload): OrigemDaMensagem {
  if (body.isGroup === true || body.participantPhone || body.participantLid) return "grupo";
  if (body.isNewsletter === true) return "canal";
  if (body.broadcast === true) return "transmissao";
  if (body.isStatusReply === true) return "status";
  return classificarNumero(body.phone);
}

/** A única origem que abre conversa, cria lead e recebe resposta. */
export function ehConversaIndividual(body: RemetenteDoPayload): boolean {
  return origemDaMensagem(body) === "individual";
}
