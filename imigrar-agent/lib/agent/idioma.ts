// O IDIOMA DO CONTATO, DETECTADO E GUARDADO.
//
// A regra de idioma já existia no prompt: o modelo olha a mensagem e responde na mesma
// língua. Isso resolve o turno — e só o turno. Fora dele há dois buracos que nenhum
// prompt fecha:
//
//   1. O FOLLOW-UP AUTOMÁTICO sai do cron, sem passar pelo modelo e sem ninguém por
//      perto. Ia em português para todo mundo, inclusive para quem escreveu a conversa
//      inteira em espanhol ou crioulo.
//   2. O ATENDENTE HUMANO que assume a conversa no painel precisa saber em que idioma
//      responder antes de escrever a primeira linha.
//
// A detecção aqui é heurística e deliberadamente CONSERVADORA: na dúvida devolve
// `undefined` e o sistema segue com o que já sabia. Um palpite errado é pior do que
// palpite nenhum — ele gruda no contato e passa a mandar o follow-up na língua errada.
//
// Para áudio não se usa nada disto: o Whisper já devolve o idioma detectado, que é um
// sinal muito melhor (ver lib/agent/audio.ts).

import { getRepository } from "@/lib/data";
import { NOME_DO_IDIOMA } from "@/lib/domain/idiomas";

/** Idiomas que este atendimento realmente vê. Não é a lista do mundo, é a da operação. */
export type IdiomaSuportado =
  | "pt" | "es" | "en" | "fr" | "ht" | "ar" | "ru" | "uk" | "zh" | "hi" | "bn";

// Os rótulos moram em lib/domain/idiomas.ts porque o painel também os usa, e este módulo
// importa o repositório — arrastar a camada de dados para o bundle do cliente por causa
// de uma tabela de nomes seria caro. Reexportado para não quebrar quem já importa daqui.
export { NOME_DO_IDIOMA };

/**
 * Escritas não-latinas são decididas pelo alfabeto, que não erra. Cirílico não separa
 * russo de ucraniano sozinho, então o ucraniano é reconhecido pelas letras que só ele tem
 * (і, ї, є, ґ) e o resto do cirílico fica como russo.
 */
const ESCRITAS: { idioma: IdiomaSuportado; re: RegExp }[] = [
  { idioma: "ar", re: /[؀-ۿ]/ },
  { idioma: "uk", re: /[іїєґІЇЄҐ]/ },
  { idioma: "ru", re: /[Ѐ-ӿ]/ },
  { idioma: "zh", re: /[一-鿿]/ },
  { idioma: "hi", re: /[ऀ-ॿ]/ },
  { idioma: "bn", re: /[ঀ-৿]/ },
];

/**
 * Marcadores de escrita latina, com peso.
 *
 * Peso 3 = só existe naquela língua (ç+ão, ñ, ¿). Peso 2 = fortíssimo. Peso 1 = comum,
 * só desempata. O par português/espanhol é o difícil — as duas compartilham quase tudo,
 * então o que decide são as terminações (ção vs ción), os dígrafos (nh/lh) e os poucos
 * pares que divergem de verdade (não/no, você/usted, obrigado/gracias, muito/muy).
 */
const MARCADORES: { idioma: IdiomaSuportado; peso: number; re: RegExp }[] = [
  // ── português
  // "ção"/"ções" NO FIM DA PALAVRA, e não como palavra solta. O antigo `\bções\b` exigia
  // borda antes do "ç" e nunca casava "informações" — a palavra mais comum da mensagem
  // pronta do site.
  { idioma: "pt", peso: 3, re: /ç[ãa]o\b|ções\b|[cç]ão\b/i },
  // "ã" e "õ" não existem em espanhol, francês nem inglês: entre as línguas desta
  // operação, são assinatura do português.
  { idioma: "pt", peso: 3, re: /[ãõ]/i },
  { idioma: "pt", peso: 3, re: /\b(olá|ola|gostaria|estive|informações|informacoes|português|portugues)\b/i },
  { idioma: "pt", peso: 3, re: /\b(não|nao|você|voce|vocês)\b/i },
  { idioma: "pt", peso: 3, re: /\b(obrigad[oa]|estou|sou|então|entao|também|tambem)\b/i },
  { idioma: "pt", peso: 2, re: /\b(preciso|quero|meu|minha|muito|aqui|mas|com|pra|para|fazer|tenho)\b/i },
  { idioma: "pt", peso: 2, re: /(nh|lh)[aeiou]/i },
  { idioma: "pt", peso: 1, re: /\b(que|uma|dos|das|pelo|pela|isso|agora|ainda)\b/i },
  // ── espanhol
  { idioma: "es", peso: 3, re: /[ñ¿¡]/ },
  { idioma: "es", peso: 3, re: /\bci[óo]n\b|ci[óo]n\b/i },
  // Infinitivo com pronome colado — "naturalizarme", "quedarme", "regularizarme". Em
  // português seria "naturalizar-me", com hífen, então o \w+ não casa. É um dos poucos
  // marcadores fortíssimos que aparecem justamente nas frases deste atendimento.
  { idioma: "es", peso: 3, re: /\b\w{3,}(?:arme|erme|irme|arte|arse)\b/i },
  // "buenas", "buenos" — a saudação mais comum no WhatsApp, e inexistente em português.
  { idioma: "es", peso: 2, re: /\b(buenas|buenos)\b/i },
  { idioma: "es", peso: 2, re: /\b(hago|hacer|ayudarme|quisiera|necesitaba|d[óo]nde|alg[úu]n)\b/i },
  { idioma: "es", peso: 3, re: /\b(gracias|usted|ustedes|necesito|quiero|muy|años|anos de|español|espanol)\b/i },
  // "Estoy", "soy" e "hola" não existem em português ("estou", "sou", "olá"). Valiam 2, e
  // "Hola, soy de Colombia y estoy en Bogotá" — espanhol sem dúvida — ficava abaixo do
  // mínimo e era respondida em português.
  { idioma: "es", peso: 3, re: /\b(estoy|soy|hola)\b/i },
  { idioma: "es", peso: 2, re: /\b(dónde|donde está|cómo|qué|también|entonces|aquí|pero|puedo|tengo que)\b/i },
  { idioma: "es", peso: 1, re: /\b(el|los|las|una|con|para|mi|su|hay|ser)\b/i },
  // ── inglês
  { idioma: "en", peso: 3, re: /\b(the|and|you|are|is|was|have|has|been|would|could|should)\b/i },
  { idioma: "en", peso: 2, re: /\b(i|my|me|need|want|can|please|thanks|thank you|hello|how|what|where|visa|documents)\b/i },
  { idioma: "en", peso: 1, re: /\b(to|of|in|for|with|about|from)\b/i },
  // ── francês
  { idioma: "fr", peso: 3, re: /\b(je|j'ai|nous|vous|est-ce|qu'est|bonjour|merci|s'il vous plaît|besoin)\b/i },
  // SEM "mais": em português é "mais" (mais informações) e valia 2 pontos de francês. Junto
  // com o "de", fazia "Olá, estive no site da Imigrar Brasil. Gostaria de mais informações."
  // — a mensagem pronta do botão do site — ser gravada como FRANCÊS, e a conversa inteira
  // seguia em francês com a pessoa pedindo espanhol, inglês e português.
  { idioma: "fr", peso: 2, re: /\b(les|des|une|dans|pour|avec|comment|où|papiers|séjour|demande)\b/i },
  { idioma: "fr", peso: 1, re: /\b(le|la|de|du|et|est|pas|plus)\b/i },
  // ── crioulo haitiano
  { idioma: "ht", peso: 3, re: /\b(mwen|nou|yo|ki|kijan|kisa|tanpri|mèsi|paske|pou mwen|bezwen)\b/i },
  { idioma: "ht", peso: 2, re: /\b(pa|gen|fè|vle|kapab|ayiti|papye|rezidans)\b/i },
];

/**
 * O `\b` DO JAVASCRIPT SÓ CONHECE LETRA ASCII. "\bvocê\b" nunca casava — o "ê" não é
 * letra para ele —, nem "qué", "aquí", "où". Os marcadores mais fortes de cada língua são
 * justamente os acentuados, e o detector desistia de frases óbvias ("você pode me ajudar
 * agora"). Aqui cada `\b` vira a borda de palavra Unicode.
 */
const BORDA = "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";
for (const m of MARCADORES) {
  m.re = new RegExp(m.re.source.replace(/\\b/g, BORDA), m.re.flags.includes("u") ? m.re.flags : `${m.re.flags}u`);
}

/** Mínimos para aceitar um palpite. Abaixo disso, `undefined` — e ninguém se compromete. */
const PONTOS_MINIMOS = 3;
const MARGEM_MINIMA = 2;

/**
 * O idioma da mensagem, ou `undefined` quando não dá para afirmar.
 *
 * Devolve `undefined` de propósito em mensagem curta: "ok", "sim", "visa" e um número de
 * telefone não dizem nada sobre a língua de ninguém, e é justamente aí que um detector
 * ingênuo grava o palpite errado no contato.
 */
export function detectarIdioma(texto: string): string | undefined {
  const t = (texto ?? "").trim();
  if (t.length < 10) return undefined;

  for (const { idioma, re } of ESCRITAS) {
    if (re.test(t)) return idioma;
  }

  const pontos: Record<string, number> = {};
  for (const { idioma, peso, re } of MARCADORES) {
    if (re.test(t)) pontos[idioma] = (pontos[idioma] ?? 0) + peso;
  }

  const ordenado = Object.keys(pontos)
    .map((k) => [k, pontos[k]] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  if (!ordenado.length) return undefined;

  const [melhor, placar] = ordenado[0];
  const segundo = ordenado[1]?.[1] ?? 0;
  if (placar < PONTOS_MINIMOS || placar - segundo < MARGEM_MINIMA) {
    // PORTUNHOL VAI PARA O PORTUGUÊS. Regra da operação: quem mistura português e espanhol
    // sem que um dos dois vença está tentando falar a nossa língua — e é em português que
    // o time consegue continuar o atendimento.
    const pt = pontos.pt ?? 0;
    const es = pontos.es ?? 0;
    if (pt >= 2 && es >= 2 && Math.abs(pt - es) < MARGEM_MINIMA) return "pt";
    return undefined;
  }
  return melhor;
}

/**
 * O IDIOMA QUE A PESSOA PEDIU, com todas as letras.
 *
 * "Habla español?", "Ablas espanhol", "Do you speak English?", "Fala português?",
 * "en français s'il vous plaît". São mensagens curtas, cheias de erro de digitação e que
 * misturam línguas — o detector por marcadores desiste delas, e eram justamente o cliente
 * dizendo, com todas as letras, em que língua quer ser atendido. Foi assim que o Ricardo
 * pediu espanhol, inglês e português e continuou recebendo francês.
 *
 * Exige um verbo ou preposição de pedido antes do nome da língua: "sou espanhol" é
 * nacionalidade, não pedido de idioma.
 */
const NOME_PEDIDO: { idioma: IdiomaSuportado; re: string }[] = [
  { idioma: "es", re: "espa[nñ]h?ol|castellano|castelhano|spanish|espagnol" },
  { idioma: "en", re: "ingl[eêé]s|english|anglais" },
  { idioma: "pt", re: "portugu[eêé]s|portuguese|portugais|portugu[eê]se" },
  { idioma: "fr", re: "franc[eêé]s|french|fran[cç]ais" },
  { idioma: "ht", re: "kr[eé]y[oò]l|crioulo|criollo|creole|cr[eé]ole" },
];
const VERBO_DE_PEDIDO =
  "h?abl[ao]s?|h?ablan|h?ablar|h?able|falas?|falam|falar|fale|speaks?|talk|parlez|parles?|parler|" +
  "em|en|in|prefiro|prefiero|prefer|pode ser|puede ser|can we|podemos|please|por favor";

export function pedidoDeIdioma(texto: string): IdiomaSuportado | undefined {
  const t = (texto ?? "").trim();
  if (!t || t.length > 160) return undefined;
  for (const { idioma, re } of NOME_PEDIDO) {
    const r = new RegExp(
      `(?<![\\p{L}])(?:${VERBO_DE_PEDIDO})(?![\\p{L}])[^\\p{L}]*(?:\\p{L}+[^\\p{L}]+){0,2}?(?:${re})(?![\\p{L}])`,
      "iu",
    );
    if (r.test(t)) return idioma;
  }
  // Só o nome da língua, sozinho ou com interrogação: "Español?", "English please".
  for (const { idioma, re } of NOME_PEDIDO) {
    if (new RegExp(`^[^\\p{L}]*(?:${re})[^\\p{L}]*(?:please|por favor|s'il vous pla[iî]t)?[^\\p{L}]*$`, "iu").test(t)) {
      return idioma;
    }
  }
  return undefined;
}

/**
 * Grava o idioma no contato quando ele MUDA. Nunca lança: errar isto não pode derrubar o
 * atendimento — o pior caso é o follow-up sair na língua anterior.
 */
export async function registrarIdioma(conversationId: string, idioma?: string): Promise<void> {
  if (!idioma) return;
  try {
    const repo = getRepository();
    const conv = await repo.getConversation(conversationId);
    if (!conv) return;
    if (conv.idioma !== idioma) await repo.updateConversation(conversationId, { idioma });

    // O IDIOMA TAMBÉM VAI PARA O LEAD, e não só para a conversa.
    //
    // Quem lê o idioma não é só o follow-up automático: é a FILA. E a fila lê o lead,
    // não a conversa. Sem esta linha o chip de idioma aparecia vazio em toda linha do
    // painel — justo o dado que existe para o time saber, antes de abrir, se consegue
    // atender aquela pessoa. Apareceu na primeira conversa real: `conversations.idioma`
    // gravado como "es", `leads.idioma` null.
    //
    // A SINCRONIA DO LEAD É INDEPENDENTE DA DA CONVERSA, e é isso que estava errado.
    //
    // Antes havia um `return` quando a conversa JÁ tinha aquele idioma, e o lead nem era
    // olhado. Só que a ordem dos acontecimentos, no primeiro turno, é: o idioma é gravado
    // na conversa (ainda não há lead nenhum) e o lead nasce depois, na captura de dados.
    // A partir do segundo turno o atalho disparava — a conversa já tinha "es" — e o lead
    // ficava com `idioma` null PARA SEMPRE. Foi assim que quase todo card do painel ficou
    // mostrando "??" num atendimento em que o idioma é a primeira coisa que se detecta.
    //
    // `upsertLead` cria o lead se ele ainda não existir: uma conversa que só tem idioma
    // detectado já merece uma linha, porque idioma é o dado que diz se dá para atender.
    const lead = await repo.getLeadByConversation(conversationId);
    if (lead?.idioma !== idioma) {
      await repo.upsertLead(conversationId, { idioma });
    }
  } catch (err) {
    console.error("[idioma] não foi possível gravar:", err instanceof Error ? err.message : err);
  }
}

/**
 * O idioma efetivo da conversa: o que a mensagem de agora mostra, com o que já estava
 * gravado como rede. A mensagem de agora vence — quem pediu para trocar de idioma trocou.
 */
export function idiomaEfetivo(textoAtual: string, gravado?: string | null): string | undefined {
  return pedidoDeIdioma(textoAtual) ?? detectarIdioma(textoAtual) ?? gravado ?? undefined;
}

/**
 * O QUE A PESSOA DISSE, sem o que o sistema escreveu em volta.
 *
 * Foto, documento e áudio entram no histórico como "📎 Arquivo recebido…", com a leitura
 * do arquivo e instruções para o modelo — tudo em português. Lido como fala da pessoa,
 * isso virava o idioma da conversa: uma conversa em francês com a foto de um protocolo
 * passava a ser "pt", o contato era gravado em português e o follow-up saía em português.
 * Daqui sai só a legenda que ela escreveu, ou a transcrição do áudio (que é a voz dela).
 */
export function falaDaPessoa(conteudo: string): string {
  const t = conteudo ?? "";
  if (t.startsWith("🎤 Mensagem de voz (transcrita):")) {
    return t.slice("🎤 Mensagem de voz (transcrita):".length).trim();
  }
  if (t.startsWith("📎 Arquivo recebido:")) {
    // A legenda inteira, mesmo com quebra de linha — até o bloco que o sistema acrescenta.
    return t.match(/(?:^|\n)Legenda do cliente: ([\s\S]*?)(?=\n\[|$)/)?.[1]?.trim() ?? "";
  }
  return t;
}

/**
 * O idioma da CONVERSA, e não o da última mensagem.
 *
 * O detector é conservador de propósito e desiste de mensagem curta — o que no WhatsApp é
 * quase toda mensagem. "Soy venezolana" e "como hago para naturalizarme?" pontuavam abaixo
 * do mínimo cada uma sozinha, e uma conversa inteira em espanhol era atendida em
 * português. Somadas, as mesmas frases decidem com folga.
 *
 * A mensagem de AGORA continua tendo a palavra: quem pediu para trocar de idioma trocou, e
 * o acumulado não pode puxar a conversa de volta para a língua anterior.
 */
export function idiomaDaConversa(
  ultimaMensagem: string,
  conversaInteira: string,
  gravado?: string | null,
): string | undefined {
  return (
    pedidoDeIdioma(ultimaMensagem) ??
    detectarIdioma(ultimaMensagem) ??
    pedidoMaisRecente(conversaInteira) ??
    detectarIdioma(conversaInteira) ??
    gravado ??
    undefined
  );
}

/**
 * Um pedido de idioma feito ANTES continua valendo: quem escreveu "fala português?" e
 * depois "ok" segue em português, e o acumulado da conversa (que pode ter frases noutra
 * língua) não pode desfazer o pedido. As falas chegam separadas por dois espaços.
 */
function pedidoMaisRecente(conversaInteira: string): IdiomaSuportado | undefined {
  const falas = (conversaInteira ?? "").split(/ {2,}/);
  for (let i = falas.length - 1; i >= 0; i--) {
    const p = pedidoDeIdioma(falas[i]);
    if (p) return p;
  }
  return undefined;
}

/**
 * Bloco do system prompt. NÃO repete a regra de idioma (ela já é a REGRA ABSOLUTA 1 do
 * DeepSeek): só entrega o fato que o modelo não tem como saber sozinho — que este contato
 * já vinha falando noutra língua antes desta mensagem.
 */
export function buildIdiomaBlock(gravado?: string | null): string {
  if (!gravado || gravado === "pt") return "";
  // O NOME, E NÃO O CÓDIGO. Desde que `lib/agent/idioma-modelo.ts` entrou como última
  // instância, o código gravado pode ser qualquer um do ISO 639-1 — inclusive um que a
  // tabela de rótulos ainda não tenha. Escrever "vem falando sw" no prompt não instrui
  // ninguém: o modelo lê uma sigla e não uma língua. Sem o nome, a frase passa a nomear
  // o que ela é de fato, um código, e aí o modelo sabe o que fazer com ela.
  const conhecido = NOME_DO_IDIOMA[gravado];
  const nome = conhecido ?? `o idioma de código ISO 639-1 "${gravado}"`;
  // Dois slots, e não um: "Continue em ${nome}" só funciona com o nome nu ("em espanhol").
  // Com o rótulo de emergência sairia "Continue em o idioma de código" — e uma frase
  // capenga no system prompt instrui pior do que uma frase a menos.
  const continue_ = conhecido ? `Continue em ${conhecido}` : "Continue nesse mesmo idioma";
  return `\n\n════════ IDIOMA DESTE CONTATO ════════
Esta pessoa vem falando ${nome} nesta conversa. ${continue_}, mesmo que o material oficial que você recebeu esteja em português — traduza o conteúdo, nunca devolva o trecho em português.
Se a mensagem de agora vier em outra língua, siga a língua de agora: ela trocou, e você troca junto. Não comente a troca.
Se ela PEDIR outra língua ("habla español?", "do you speak English?", "fala português?"), passe a escrever nessa língua já nesta resposta, sem pedir confirmação. Se ela misturar português com espanhol (portunhol), responda em português.`;
}
