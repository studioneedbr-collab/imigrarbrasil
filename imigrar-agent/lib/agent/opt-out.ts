// PEDIDO DE PARAR — a proteção nº 1 contra banimento no WhatsApp.
//
// O que derruba um número não é volume: é TAXA DE BLOQUEIO E DENÚNCIA. E o caminho mais
// curto para uma denúncia é a pessoa pedir para parar e continuar recebendo mensagem.
// Antes disto, quem escrevia "para de me mandar mensagem" recebia resposta na hora e
// ainda levava o follow-up automático 24h depois.
//
// A detecção é DETERMINÍSTICA de propósito. Depender do modelo perceber o pedido é
// exatamente o tipo de coisa que ele erra num dia ruim, e aqui o erro custa o número.
//
// A régua é conservadora: exige a frase inteira, nunca uma palavra solta. Os dois erros
// possíveis têm custos muito diferentes — deixar passar custa uma denúncia, silenciar sem
// a pessoa pedir custa um atendimento que ela precisava. "Meu prazo parou", "quero parar
// o processo" e "cancelar o pedido" são assunto do CASO dela e têm que passar.

/**
 * `bloquear`: pediu explicitamente para parar. A Ana se despede uma última vez e nunca
 * mais fala com esse número sozinha.
 * `sem_followup`: disse que não tem interesse. Segue conversando normalmente (a pessoa
 * pode mudar de ideia na mesma conversa), mas nenhuma mensagem automática vai atrás dela.
 */
export type OptOut = "bloquear" | "sem_followup";

// ── Pedido explícito de parar ───────────────────────────────────────────────
const BLOQUEAR: RegExp[] = [
  // "para de me mandar mensagem" / "pare de mandar" / "parem de me enviar"
  /\b(par[ae]|parem|parar)\s+de\s+(me\s+)?(mandar|manda|enviar|envia|encher|escrever)/,
  // "não me manda mais nada" / "não me mande mais mensagem"
  /\bn[ãa]o\s+me\s+(mand|envi|escrev)\w*\s+mais\b/,
  // "não quero (mais) receber" / "não quero receber nada"
  // O que ela não quer receber tem que ser mensagem. "Não quero receber outra multa da
  // PF" é o caso dela, não um pedido de parar.
  /\bn[ãa]o\s+quero\s+(mais\s+)?receber\s*(mais\s+)?(mensage|nada|isso|contato|liga|spam|[.!]*$)/,
  // "me tira dessa lista" / "quero ser removido da lista" / "excluir da lista"
  // A lista tem que ser a de envio. "Tirar meu nome da lista de impedidos" é caso.
  /\b(tir[ae]r?|tirem|remov\w+|retir\w+|exclu\w+)\b[^.!?]{0,30}\b(dessa|desta|nessa|nesta|da\s+sua|de\s+voc[êe]s)\s+lista\b/,
  // A lista tem de ser dita como lista de envio, ou a mensagem inteira ser o pedido. "Como
  // faço pra tirar meu nome da lista?" é sobre lista de impedidos, protocolo, restrição.
  /\b(tir[ae]r?|tirem|remov\w+|retir\w+|exclu\w+)\b[^.!?]{0,30}\blista\s+de\s+(contatos?|envio|transmiss[ãa]o|mensagens|voc[êe]s)\b/,
  /^\s*(me\s+)?(tir[ae]|tirem|remov[ae]m?|exclu[ae]m?)\s+(me\s+)?d[aeo]s?\s+(sua\s+)?lista\s*[.!]*$/,
  /\b(quero\s+ser|me)\s+(removid|retirad|exclu[íi]d|tirad)\w*\s+d[ao]s?\s+(sua\s+|essa\s+|dessa\s+)?lista\s*[.!]*$/,
  /descadastr/,
  // "me deixa em paz"
  // Como pedido, e não como relato: "ela não me deixa em paz" é alguém contando o que
  // sofre — e é justamente quem precisa de atendimento.
  /(?<!n[ãa]o\s+(me\s+)?)\bdeix\w*\s+(me\s+|eu\s+)?em\s+paz\b/,
  // Só a forma imperativa: "desculpa te perturbar" é gentileza, não pedido de parar.
  /\b(par[ae]|parem|parar)\s+de\s+(me\s+)?perturbar\b/,
  // "Não me perturbe" como ordem — no começo da frase, ou com "mais". "Espero não
  // perturbar, preciso de ajuda" é gentileza de quem precisa de atendimento.
  /(^|[.!?]\s*)n[ãa]o\s+me\s+perturb[ae]/,
  /\bn[ãa]o\s+(me\s+)?perturb\w*\s+mais\b/,
  // Ameaça de bloqueio/denúncia — é o aviso final antes do estrago de verdade.
  // Só quando o alvo somos nós. "Vou denunciar meu patrão, ele pegou meu passaporte"
  // pode ser exploração de trabalho — silenciar essa pessoa é o pior erro possível.
  /\bvou\s+(te|os|vos)\s+(bloquear|denunciar|reportar)\b/,
  /\bvou\s+(bloquear|denunciar|reportar)\s+(voc[êe]s?|vcs|esse\s+n[úu]mero|este\s+n[úu]mero|esse\s+contato|isso)\b/,
  // Sozinho, só como a mensagem inteira. No fim de uma frase ("meu patrão ficou com meu
  // passaporte e eu vou denunciar") é exatamente o caso que não pode ser silenciado.
  /^\s*(eu\s+)?vou\s+(te\s+)?(bloquear|denunciar|reportar)\s*[.!]*$/,
  // "spam" só na forma de reclamação. "vê se não caiu no spam" é sobre o e-mail da
  // proposta e não pode silenciar ninguém.
  /\b(isso|isto|voc[êe]s?|vcs)\s+(é|e|s[ãa]o|t[áa]|fazem|mandam)\s+\w*\s*spam\b/,
  /\b(par[ae]|parem|parar)\s+de\s+(mandar\s+)?spam\b/,
  /^\s*spam\s*[.!]*$/,
  // Convenção universal de opt-out, e só quando é a mensagem inteira.
  /^\s*stop\s*[.!]*$/,
];

/**
 * ESPANHOL, INGLÊS, FRANCÊS — ANCORADOS NO COMEÇO DA MENSAGEM. Sem eles, quem pedia para
 * parar em outra língua continuava recebendo follow-up. Soltos no meio do texto, porém,
 * eles calavam quem pedia ajuda: "I told my employer stop texting me, but he keeps my
 * passport", "mi jefe no me deja en paz y no quiero recibir más mensajes de él". O pedido
 * de parar é a mensagem; o relato é outra coisa.
 */
const BLOQUEAR_OUTRAS_LINGUAS: RegExp[] = [
  /^\s*(por\s+favor,?\s*)?(dejen|deja|dejar)\s+de\s+(enviar|mandar|escribir)(me)?\b/,
  /^\s*(por\s+favor,?\s*)?no\s+me\s+(env[íi]en|manden|escriban|contacten)\s+m[áa]s\b/,
  /^\s*no\s+quiero\s+recibir\s+(m[áa]s\s+)?mensajes\s*[.!]*$/,
  /^\s*(please\s+)?stop\s+(messaging|texting|sending|contacting|writing\s+to)\s+me\b/,
  /^\s*(please\s+)?(don'?t|do\s+not)\s+(message|text|contact|write\s+to)\s+me\s+(anymore|any\s+more|again)\b/,
  /^\s*(please\s+)?(don'?t|do\s+not)\s+(message|text|contact)\s+me\s*[.!]*$/,
  /^\s*(please\s+)?unsubscribe\s*[.!]*$/,
  /^\s*(please\s+)?remove\s+me\s+from\s+(your|the|this)\s+list\b/,
  /^\s*(s['’]il\s+vous\s+pla[iî]t,?\s*)?arr[êe]te[zr]?\s+de\s+m['’]?\s*(envoyer|[ée]crire|contacter)\b/,
  /^\s*ne\s+m['’]?\s*(envoyez|[ée]crivez|contactez)\s+plus\b/,
  /^\s*d[ée]sinscri\w*(-moi)?\s*[.!]*$/,
];

/** Quanto texto um pedido de parar costuma ter. Um relato longo não é um pedido. */
const PEDIDO_CURTO = 120;

// ── Desinteresse ────────────────────────────────────────────────────────────
const SEM_FOLLOWUP: RegExp[] = [
  /\bn[ãa]o\s+(tenho|temos|h[áa])\s+interesse\b/,
  /\bsem\s+interesse\b/,
  /\bj[áa]\s+(contratei|contratamos|fechei|fechamos|resolvi|resolvemos)\b/,
  // "não quero mais" só quando é o FIM da frase. "não quero mais de 3 postos" e
  // "não quero mais o serviço de portaria, quero limpeza" são pedidos, não recusas.
  /\bn[ãa]o\s+quero\s+mais\s*[.!]*$/,
  /\bn[ãa]o\s+quero\s+mais\s+(nada|contato|falar|conversar|isso)\b/,
];

/** Despedida única antes do silêncio. Não promete retorno de ninguém — seria o oposto do pedido. */
const DESPEDIDA_POR_IDIOMA: Record<"pt" | "es" | "en", string> = {
  pt: "Entendido, não enviaremos mais mensagens por aqui. Se um dia precisar da Imigrar Brasil, é só escrever para este mesmo número.",
  es: "Entendido, no le enviaremos más mensajes por aquí. Si algún día necesita a Imigrar Brasil, solo escriba a este mismo número.",
  en: "Understood, we will not send you any more messages here. If you ever need Imigrar Brasil, just write to this same number.",
};

/**
 * A despedida sai NO IDIOMA DA PESSOA. Era um texto fixo em português e espanhol juntos:
 * quem pediu para parar em português recebia duas despedidas, uma numa língua que não
 * falou — e em inglês não recebia nenhuma que entendesse.
 */
export function despedidaDoOptOut(idioma?: string | null): string {
  return idioma === "es" || idioma === "en" ? DESPEDIDA_POR_IDIOMA[idioma] : DESPEDIDA_POR_IDIOMA.pt;
}

/** A versão em português, para quem não tem o idioma à mão. */
export const MENSAGEM_DESPEDIDA = DESPEDIDA_POR_IDIOMA.pt;

export function detectarOptOut(texto: string): OptOut | null {
  const t = (texto || "").toLowerCase().trim();
  if (!t) return null;
  // Um áudio transcrito ou um texto longo é quase sempre a história da pessoa. Lá, uma
  // frase como "parem de me mandar mensagem" costuma ser o que ELA disse a outra pessoa
  // (o patrão, o ex) — e calar quem está contando isso é o pior erro deste detector.
  if (t.length > PEDIDO_CURTO * 3) return null;
  // O pedido de parar vence: "não tenho interesse, para de me mandar mensagem" é silêncio.
  if (BLOQUEAR.some((re) => re.test(t))) return "bloquear";
  if (t.length <= PEDIDO_CURTO && BLOQUEAR_OUTRAS_LINGUAS.some((re) => re.test(t))) return "bloquear";
  if (SEM_FOLLOWUP.some((re) => re.test(t))) return "sem_followup";
  return null;
}
