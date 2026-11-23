import type { MediaKind } from "@/lib/domain/types";
import { registrarChamada, tokensDe, type UsoDeTokens } from "@/lib/custos/registro";
import { chamarChat, llmsDisponiveis, type Llm } from "@/lib/agent/llm";

// LEITURA DE DOCUMENTOS recebidos no WhatsApp (foto de passaporte, protocolo, certidão).
//
// QUEM LÊ É O MESMO MODELO QUE RESPONDE, quando ele enxerga. O ChatGPT (gpt-4.1, 4o, 5)
// lê imagem e PDF; o DeepSeek da API é só texto e só lê se DEEPSEEK_VISION_MODEL apontar
// um modelo de visão. A ordem é a do painel: o escolhido primeiro, a reserva depois. Antes
// a leitura era presa ao DeepSeek e, sem a variável, ficava desligada — com o ChatGPT
// escolhido, a agente respondia com um modelo que enxerga e continuava cega para a foto
// do documento.
//
// Sem nenhum modelo que enxergue, o anexo continua GUARDADO, exibido no painel e
// baixável; a agente apenas não sabe o que está escrito e pergunta à pessoa.

const DEEPSEEK_VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL ?? "";

/** O modelo que vai ler, e com qual nome de modelo. `null` quando ninguém enxerga. */
export function leitorDeDocumento(llms: Llm[]): Llm | null {
  for (const llm of llms) {
    if (!llm.configurado) continue;
    if (llm.provedor === "openai") return llm;
    if (llm.provedor === "deepseek" && DEEPSEEK_VISION_MODEL) return { ...llm, modelo: DEEPSEEK_VISION_MODEL };
  }
  return null;
}

/** Quanto a leitura pode levar: ela acontece antes da resposta, dentro do mesmo webhook. */
const LIMITE_DA_LEITURA_MS = 20_000;

// Extração curta e objetiva: a saída vai para uma conversa de WhatsApp, não é um laudo.
const MAX_TOKENS = 1024;

const PROMPT = `Você trabalha no atendimento da Imigrar Brasil (assessoria jurídica de imigração) e recebeu este arquivo pelo WhatsApp de alguém que está sendo atendido.

Descreva o que é o documento e TRANSCREVA as informações relevantes que der para ler: nomes, nacionalidade, número de passaporte/RNM/protocolo, tipo de visto, datas de entrada e validade, órgão emissor, carimbos, o que estiver escrito.

Documentos migratórios costumam estar em outro idioma e em alfabeto não latino. Transcreva o que estiver escrito como está e, se souber, diga em que idioma está.

Formato da resposta:
Tipo: <o que é o documento em poucas palavras>
Conteúdo: <as informações lidas, em texto corrido curto>

Se a imagem estiver ilegível ou não for um documento, diga isso claramente. Não invente nada que não esteja no arquivo. Responda em português do Brasil, no máximo 10 linhas.`;

/**
 * O tipo deduzido pela extensão, quando o provedor não manda o mime (ou manda
 * `application/octet-stream`, que é o mesmo que não mandar).
 *
 * OS ÁUDIOS ESTÃO AQUI POR UM MOTIVO ESPECÍFICO. A Z-API entrega o áudio gravado na hora
 * pelos campos `audio`/`ptt`, com mime, e esse caminho sempre funcionou. Mas o mesmo
 * arquivo pode chegar pelo campo `document` — é o que acontece quando alguém ENCAMINHA um
 * áudio ou anexa um arquivo de som —, e aí o mime às vezes não vem. Sem a extensão
 * mapeada, ele era classificado como documento e NUNCA passava por transcrição: o que a
 * pessoa disse virava "arquivo recebido" e ninguém lia.
 */
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
  wav: "audio/wav", amr: "audio/amr", webm: "audio/webm",
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

/**
 * O anexo no formato do chat/completions. Imagem vai como `image_url` (os dois
 * provedores). PDF só na OpenAI, como `file` — o DeepSeek não tem entrada de arquivo.
 */
export function parteDoAnexo(leitor: Pick<Llm, "provedor">, mime: string, nome: string, buf: Buffer): Record<string, unknown> | null {
  const base64 = buf.toString("base64");
  if (IMAGE_MIMES.has(mime)) return { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } };
  if (mime === "application/pdf" && leitor.provedor === "openai") {
    return { type: "file", file: { filename: nome || "documento.pdf", file_data: `data:application/pdf;base64,${base64}` } };
  }
  return null;
}

interface ChatChoice {
  message?: { content?: string | null };
}

/**
 * Baixa o anexo e devolve o conteúdo lido em texto. Retorna null (sem lançar) quando
 * não dá para ler — que é o caminho PADRÃO enquanto não houver um modelo de visão
 * configurado. O atendimento nunca pode parar por causa da leitura de um anexo.
 */
export async function readDocument(input: {
  url: string;
  name: string;
  /** De qual atendimento veio. Sem isto o custo da leitura não entra no custo da conversa. */
  conversationId?: string | null;
}): Promise<string | null> {
  const leitor = leitorDeDocumento(await llmsDisponiveis());
  if (!leitor) return null;
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
    const anexo = parteDoAnexo(leitor, mime, input.name, buf);
    if (!anexo) return null; // áudio e afins têm o próprio caminho

    const inicio = Date.now();
    const resp = await chamarChat(leitor, {
      maxTokens: MAX_TOKENS,
      temperature: 0.2,
      timeoutMs: LIMITE_DA_LEITURA_MS,
      messages: [{ role: "user", content: [anexo, { type: "text", text: PROMPT }] }],
    });
    if (!resp.ok) {
      // Sem o corpo no log: ele pode ecoar trecho do documento (LGPD).
      console.error("[vision] leitura falhou:", resp.status);
      await registrarChamada({
        provedor: leitor.provedor, modelo: leitor.modelo, tipo: "extracao",
        conversationId: input.conversationId, duracaoMs: Date.now() - inicio,
        ok: false, erro: `HTTP ${resp.status}`,
      });
      return null;
    }
    const json = (await resp.json()) as { choices?: ChatChoice[]; usage?: UsoDeTokens };
    const { entrada, saida } = tokensDe(json.usage);
    // Imagem consome MUITO token de entrada. É a chamada mais cara por unidade deste
    // sistema, e a que menos parece cara — some numa linha do atendimento como qualquer
    // outra. Medida à parte (tipo `extracao`), ela aparece na quebra por tipo de chamada.
    await registrarChamada({
      provedor: leitor.provedor, modelo: leitor.modelo, tipo: "extracao",
      conversationId: input.conversationId, tokensEntrada: entrada, tokensSaida: saida,
      duracaoMs: Date.now() - inicio, ok: true,
    });
    const texto = (json.choices?.[0]?.message?.content ?? "").trim();
    return texto || null;
  } catch (err) {
    console.error("[vision] falha ao ler documento:", err instanceof Error ? err.message : err);
    return null;
  }
}
