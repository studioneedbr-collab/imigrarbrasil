import { env } from "@/lib/env";
import type { MediaKind } from "@/lib/domain/types";

// LEITURA DE DOCUMENTOS recebidos no WhatsApp (foto do ponto, contracheque, currículo).
//
// O provedor do agente é o DeepSeek. Os modelos da API dele (deepseek-chat /
// deepseek-reasoner) são SÓ TEXTO: não enxergam imagem nem PDF. Por isso a leitura
// fica DESLIGADA por padrão — é preciso apontar DEEPSEEK_VISION_MODEL para um modelo
// de visão no endpoint compatível (a chamada segue o formato OpenAI, o mesmo de
// lib/agent/deepseek.ts, então basta a variável quando houver um modelo disponível).
//
// Com a leitura desligada o anexo continua sendo GUARDADO, exibido no painel e
// baixável; a Shayene apenas não sabe o que está escrito e pergunta à pessoa.

const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL ?? "";

// Extração curta e objetiva: a saída vai para uma conversa de WhatsApp, não é um laudo.
const MAX_TOKENS = 1024;

const PROMPT = `Você trabalha no atendimento da Shine Rio (terceirização de mão de obra) e recebeu este arquivo pelo WhatsApp de um cliente, colaborador ou candidato.

Descreva o que é o documento e TRANSCREVA as informações relevantes que der para ler: nomes, CPF, matrícula, empresa/condomínio, cargo, datas, horários, valores, números de protocolo, o que estiver escrito.

Formato da resposta:
Tipo: <o que é o documento em poucas palavras>
Conteúdo: <as informações lidas, em texto corrido curto>

Se a imagem estiver ilegível ou não for um documento, diga isso claramente. Não invente nada que não esteja no arquivo. Responda em português do Brasil, no máximo 10 linhas.`;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
};

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// Limite defensivo: um anexo gigante estoura a requisição e o tempo do webhook.
const MAX_BYTES = 8 * 1024 * 1024;

/** Deduz o mime pelo header do download ou, na falta dele, pela extensão do nome/URL. */
function guessMime(headerMime: string | null, name: string, url: string): string {
  const clean = (headerMime ?? "").split(";")[0].trim().toLowerCase();
  if (clean && clean !== "application/octet-stream") return clean;
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? url.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Classifica o anexo para exibição no painel (imagem tem preview inline; o resto vira link). */
export function mediaKindFor(mime: string, name: string): MediaKind {
  const m = guessMime(mime, name, "");
  if (IMAGE_MIMES.has(m)) return "image";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

interface ChatChoice {
  message?: { content?: string | null };
}

/**
 * Baixa o anexo e devolve o conteúdo lido em texto. Retorna null (sem lançar) quando
 * não dá para ler — que é o caminho PADRÃO enquanto não houver um modelo de visão
 * configurado. O atendimento nunca pode parar por causa da leitura de um anexo.
 */
export async function readDocument(input: { url: string; name: string }): Promise<string | null> {
  if (!VISION_MODEL || !env.deepseekKey) return null;
  // Só https: uma URL forjada (file:, host interno) não deve ser buscada pelo servidor.
  if (!/^https:\/\//i.test(input.url)) return null;

  try {
    const res = await fetch(input.url);
    if (!res.ok) {
      console.error("[vision] download falhou:", res.status);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      console.error("[vision] arquivo grande demais:", buf.byteLength);
      return null;
    }

    const mime = guessMime(res.headers.get("content-type"), input.name, input.url);
    if (!IMAGE_MIMES.has(mime)) return null; // PDF, áudio e afins não passam por visão

    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const resp = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.deepseekKey}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error("[vision] leitura falhou:", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const json = (await resp.json()) as { choices?: ChatChoice[] };
    const texto = (json.choices?.[0]?.message?.content ?? "").trim();
    return texto || null;
  } catch (err) {
    console.error("[vision] falha ao ler documento:", err instanceof Error ? err.message : err);
    return null;
  }
}
