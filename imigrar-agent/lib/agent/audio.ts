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
    return { texto, idioma: normalizarIdioma(json.language), duracao: json.duration };
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
