// TRANSCRIÇÃO DO ÁUDIO DO WHATSAPP.
//
// Quem manda áudio é justamente o público desta operação: pessoa que não escreve bem em
// português, que está com pressa, que está com medo, ou que simplesmente é de uma cultura
// onde áudio é o padrão. Antes deste módulo o áudio era descartado no webhook — a mensagem
// não tinha texto nem entrava como mídia, e o atendimento simplesmente não acontecia.
//
// O provedor do agente (DeepSeek) não transcreve. Usa-se a OpenAI, que já é a dependência
// do embedding do RAG — uma chave a mais, não duas.
//
// DEGRADAÇÃO: sem OPENAI_API_KEY a transcrição devolve null e o webhook trata o áudio
// como um anexo que chegou mas não pôde ser lido — a Ana avisa que recebeu e pede para a
// pessoa escrever. Nunca lança para dentro do fluxo da conversa.

import { env } from "@/lib/env";
import { registrarChamada } from "@/lib/custos/registro";

const MODELO = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

// Teto da API é 25 MB. Um áudio de WhatsApp passa longe disso (opus ~1 MB/min), então
// estourar aqui significa que veio outra coisa — melhor recusar do que gastar a chamada.
const MAX_BYTES = 25 * 1024 * 1024;

export interface Transcricao {
  texto: string;
  /** Código ISO-639-1 detectado pelo modelo ("pt", "es", "en", "ht"…), quando vier. */
  idioma?: string;
  /** Duração em segundos, quando vier. */
  duracao?: number;
}

/**
 * Sem acento, sem pontuação, sem caixa — para comparar com a lista.
 *
 * A pontuação SAI de propósito: o resíduo aparece ora como "Obrigado", ora como
 * "Obrigado.", ora como "obrigado!", e manter o ponto obrigaria a lista a ter uma entrada
 * por variação de pontuação. É o tipo de lista que fica desatualizada na primeira semana.
 */
function semEnfeite(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O QUE O MODELO ESCREVE QUANDO NÃO ENTENDEU NADA.
 *
 * O Whisper não devolve "não consegui". Diante de silêncio, chiado, um trecho curto ou um
 * arquivo que não é fala, ele escreve com a mesma confiança de sempre — e o que sai é
 * resíduo do material em que foi treinado: legenda de vídeo, agradecimento de youtuber,
 * frase solta de conversa em inglês.
 *
 * Isso é PIOR do que falhar. Uma falha vai para a tela de Falhas de transcrição e alguém
 * do time ouve o áudio. Uma frase inventada entra na conversa como o que a pessoa DISSE,
 * a Ana responde a ela, e o dossiê do caso passa a conter uma afirmação que ninguém fez.
 *
 * Aconteceu: um áudio em que a pessoa dizia "ah, desculpa, liguei errado" virou
 * "That's cool, but yeah" no painel.
 */
const RESIDUOS_DE_TREINO = [
  // inglês — os mais reportados, quase todos resíduo de legenda de vídeo
  "thank you", "thanks for watching", "thank you for watching", "please subscribe",
  "subscribe to my channel", "bye", "you", "the end", "music", "applause",
  // português e espanhol
  "obrigado", "obrigada", "tchau", "legendas pela comunidade amaraorg",
  "inscreva se no canal", "gracias", "gracias por ver el video",
  "subtitulos realizados por la comunidad de amaraorg",
].map(semEnfeite);

/** Texto curto o bastante para não ter substância — o tamanho do resíduo típico. */
const CURTO = 80;


/**
 * A TRANSCRIÇÃO MERECE CONFIANÇA? Devolve o motivo da desconfiança, ou `null`.
 *
 * Duas regras, e a segunda é a que pega o caso real:
 *
 * 1. O texto é um resíduo conhecido, inteiro. Comparação exata depois de normalizar —
 *    "Obrigado." sozinho é resíduo; "obrigado, eu preciso renovar meu visto" é fala.
 *
 * 2. O IDIOMA NÃO BATE COM O DA CONVERSA, e o texto é curto. Esta operação é multilíngue
 *    de propósito, então trocar de idioma no meio é legítimo — mas quem troca de idioma
 *    de verdade costuma dizer alguma coisa. Um trecho curto que sai numa língua que a
 *    conversa nunca usou é a assinatura exata da alucinação, e foi o que aconteceu: uma
 *    conversa inteira em português, um áudio de poucos segundos, e uma frase em inglês.
 *
 * NÃO se recusa por ser curto, só por curto E inesperado. "sim", "não sei", "pode ser"
 * são áudios reais e curtíssimos, e recusá-los seria jogar fora a resposta da pessoa.
 */
export function motivoDeDesconfianca(t: {
  texto: string;
  idiomaDetectado?: string;
  idiomaDaConversa?: string | null;
}): string | null {
  const limpo = semEnfeite(t.texto);
  if (!limpo) return "a transcrição veio vazia";
  if (RESIDUOS_DE_TREINO.includes(limpo)) {
    return `a transcrição saiu como "${t.texto.trim()}", que é resíduo de treino do modelo, não fala`;
  }
  const daConversa = (t.idiomaDaConversa ?? "").trim().toLowerCase();
  const detectado = (t.idiomaDetectado ?? "").trim().toLowerCase();
  if (daConversa && detectado && daConversa !== detectado && t.texto.trim().length <= CURTO) {
    return `a transcrição saiu em "${detectado}" numa conversa em "${daConversa}", e é curta demais para ser uma troca de idioma de verdade`;
  }
  return null;
}

export function transcricaoConfigurada(): boolean {
  return Boolean(env.openaiKey);
}

/** Extensão que a API aceita, deduzida do mime. O nome do arquivo importa para ela. */
function nomeDoArquivo(mime: string): string {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  const ext =
    m === "audio/mpeg" ? "mp3"
    : m === "audio/mp4" || m === "audio/m4a" || m === "audio/x-m4a" ? "m4a"
    : m === "audio/wav" || m === "audio/x-wav" ? "wav"
    : m === "audio/webm" ? "webm"
    : m === "audio/flac" ? "flac"
    // O áudio de WhatsApp é ogg/opus, e é o caso esmagadoramente mais comum.
    : "ogg";
  return `audio.${ext}`;
}

/**
 * Baixa o áudio e devolve a transcrição. Retorna null (sem lançar) em qualquer falha:
 * sem chave, download ruim, arquivo grande demais, API fora.
 */
export async function transcreverAudio(input: {
  url: string;
  mime?: string;
  /** De qual atendimento veio. Sem isto o custo da transcrição não entra no da conversa. */
  conversationId?: string | null;
  /**
   * O idioma que a conversa já vinha usando (ISO-639-1), quando se sabe.
   *
   * NÃO é passado ao modelo como imposição, de propósito: metade das conversas desta
   * operação troca de idioma no meio, e forçar "pt" num áudio em espanhol produziria uma
   * transcrição errada com cara de certa. Serve para DESCONFIAR do resultado depois —
   * ver `motivoDeDesconfianca`.
   */
  idiomaDaConversa?: string | null;
  /** Preenchido com o motivo quando a transcrição é recusada por desconfiança. */
  aoDesconfiar?: (motivo: string) => void;
}): Promise<Transcricao | null> {
  if (!env.openaiKey) return null;
  // Só https: uma URL forjada (file:, host interno) não deve ser buscada pelo servidor.
  if (!/^https:\/\//i.test(input.url)) return null;

  try {
    const res = await fetch(input.url, { cache: "no-store" });
    if (!res.ok) {
      console.error("[audio] download falhou:", res.status);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.byteLength) return null;
    if (buf.byteLength > MAX_BYTES) {
      console.error("[audio] arquivo grande demais:", buf.byteLength);
      return null;
    }

    const mime = (input.mime || res.headers.get("content-type") || "audio/ogg").split(";")[0].trim();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), nomeDoArquivo(mime));
    form.append("model", MODELO);
    // verbose_json traz o idioma detectado junto — é o que alimenta a regra de idioma do
    // atendimento sem precisar de uma segunda chamada só para detectar.
    form.append("response_format", "verbose_json");

    const inicio = Date.now();
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.openaiKey}` },
      body: form,
      cache: "no-store",
    });
    if (!resp.ok) {
      console.error("[audio] transcrição falhou:", resp.status, await resp.text().catch(() => ""));
      await registrarChamada({
        provedor: "openai", modelo: MODELO, tipo: "transcricao",
        conversationId: input.conversationId, duracaoMs: Date.now() - inicio,
        ok: false, erro: `HTTP ${resp.status}`,
      });
      return null;
    }
    const json = (await resp.json()) as { text?: string; language?: string; duration?: number };
    const texto = (json.text ?? "").trim();
    // Cobrado por tempo de áudio, e é por isso que `verbose_json` importa aqui além do
    // idioma: sem a duração, o custo da transcrição não pode ser calculado — e entraria
    // na conta como zero, que é a mentira que este módulo existe para não contar.
    await registrarChamada({
      provedor: "openai", modelo: MODELO, tipo: "transcricao",
      conversationId: input.conversationId, segundos: json.duration ?? null,
      duracaoMs: Date.now() - inicio, ok: Boolean(texto),
      erro: texto ? null : "transcrição vazia",
    });
    if (!texto) return null;

    const idioma = normalizarIdioma(json.language);
    const desconfianca = motivoDeDesconfianca({
      texto,
      idiomaDetectado: idioma,
      idiomaDaConversa: input.idiomaDaConversa,
    });
    if (desconfianca) {
      // Trata-se como falha, e é a decisão certa: o áudio vai para a tela de Falhas de
      // transcrição, alguém do time OUVE, e a Ana pede à pessoa que escreva. O caro é o
      // outro caminho — a frase inventada entrando na conversa como fala de alguém.
      console.error("[audio] transcrição recusada:", desconfianca);
      input.aoDesconfiar?.(desconfianca);
      return null;
    }
    return { texto, idioma, duracao: json.duration };
  } catch (err) {
    console.error("[audio] indisponível:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * O Whisper devolve o idioma por extenso e em inglês ("portuguese", "spanish"). O resto
 * do sistema trabalha com ISO-639-1, que é o que o `idioma` do contato guarda.
 */
export function normalizarIdioma(bruto?: string): string | undefined {
  if (!bruto) return undefined;
  const b = bruto.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(b)) return b;
  const MAPA: Record<string, string> = {
    portuguese: "pt", spanish: "es", english: "en", french: "fr", haitian: "ht",
    "haitian creole": "ht", arabic: "ar", russian: "ru", ukrainian: "uk",
    chinese: "zh", mandarin: "zh", italian: "it", german: "de", dutch: "nl",
    japanese: "ja", korean: "ko", hindi: "hi", bengali: "bn", urdu: "ur",
    turkish: "tr", persian: "fa", wolof: "wo", lingala: "ln", swahili: "sw",
    romanian: "ro", polish: "pl", catalan: "ca", galician: "gl",
  };
  return MAPA[b];
}
