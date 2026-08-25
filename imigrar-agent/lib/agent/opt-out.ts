// PEDIDO DE PARAR — a proteção nº 1 contra banimento no WhatsApp.
//
// O que derruba um número não é volume: é TAXA DE BLOQUEIO E DENÚNCIA. E o caminho mais
// curto para uma denúncia é a pessoa pedir para parar e continuar recebendo mensagem.
// Antes disto, quem escrevia "para de me mandar mensagem" recebia resposta da Shayene na
// hora e ainda levava o follow-up automático 24h depois.
//
// A detecção é DETERMINÍSTICA de propósito. Depender do modelo perceber o pedido é
// exatamente o tipo de coisa que ele erra num dia ruim, e aqui o erro custa o número.
//
// A régua é conservadora: exige a frase inteira, nunca uma palavra solta. Os dois erros
// possíveis têm custos muito diferentes — deixar passar custa uma denúncia, silenciar sem
// o cliente pedir custa uma venda. "Quero cancelar o contrato", "o funcionário vai sair
// às 18h" e "parar o serviço em janeiro" são assunto de NEGÓCIO e têm que passar.

/**
 * `bloquear`: pediu explicitamente para parar. A Shayene se despede uma última vez e
 * nunca mais fala com esse número sozinha.
 * `sem_followup`: disse que não tem interesse. Segue conversando normalmente (ele pode
 * mudar de ideia na mesma conversa), mas nenhuma mensagem automática o persegue depois.
 */
export type OptOut = "bloquear" | "sem_followup";

// ── Pedido explícito de parar ───────────────────────────────────────────────
const BLOQUEAR: RegExp[] = [
  // "para de me mandar mensagem" / "pare de mandar" / "parem de me enviar"
  /\b(par[ae]|parem|parar)\s+de\s+(me\s+)?(mandar|manda|enviar|envia|encher|escrever)/,
  // "não me manda mais nada" / "não me mande mais mensagem"
  /\bn[ãa]o\s+me\s+(mand|envi|escrev)\w*\s+mais\b/,
  // "não quero (mais) receber" / "não quero receber nada"
  /\bn[ãa]o\s+quero\s+(mais\s+)?receber\b/,
  // "me tira dessa lista" / "quero ser removido da lista" / "excluir da lista"
  /\b(tir[ae]r?|tirem|remov\w+|retir\w+|exclu\w+)\b[^.!?]{0,30}\blista\b/,
  /descadastr/,
  // "me deixa em paz"
  /\bdeix\w*\s+(me\s+|eu\s+)?em\s+paz\b/,
  // Só a forma imperativa: "desculpa te perturbar" é gentileza, não pedido de parar.
  /\b(par[ae]|parem|parar)\s+de\s+(me\s+)?perturbar\b/,
  /\bn[ãa]o\s+(me\s+)?perturb/,
  // Ameaça de bloqueio/denúncia — é o aviso final antes do estrago de verdade.
  /\bvou\s+(te\s+|os\s+|o\s+|vos\s+)?(bloquear|denunciar|reportar)\b/,
  // "spam" só na forma de reclamação. "vê se não caiu no spam" é sobre o e-mail da
  // proposta e não pode silenciar ninguém.
  /\b(isso|isto|voc[êe]s?|vcs)\s+(é|e|s[ãa]o|t[áa]|fazem|mandam)\s+\w*\s*spam\b/,
  /\b(par[ae]|parem|parar)\s+de\s+(mandar\s+)?spam\b/,
  /^\s*spam\s*[.!]*$/,
  // Convenção universal de opt-out, e só quando é a mensagem inteira.
  /^\s*stop\s*[.!]*$/,
];

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
export const MENSAGEM_DESPEDIDA =
  "Entendido, não te mando mais mensagem por aqui. Se um dia precisar da Imigrar Brasil, é só chamar neste mesmo número. 🙏\nEntendido, no te escribo más por aquí. Si algún día necesitas a Imigrar Brasil, solo escribe a este mismo número.";

export function detectarOptOut(texto: string): OptOut | null {
  const t = (texto || "").toLowerCase().trim();
  if (!t) return null;
  // O pedido de parar vence: "não tenho interesse, para de me mandar mensagem" é silêncio.
  if (BLOQUEAR.some((re) => re.test(t))) return "bloquear";
  if (SEM_FOLLOWUP.some((re) => re.test(t))) return "sem_followup";
  return null;
}
