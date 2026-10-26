// DOCUMENTO QUE O ATENDENTE MANDA AO CLIENTE — orçamento, proposta, lista de documentos.
//
// A Z-API só envia documento a partir de um LINK que ela mesma baixa. O arquivo precisa
// morar em algum lugar antes: um bucket próprio, PRIVADO, porque orçamento tem nome,
// valor e situação migratória de alguém. O bucket público do site serviria tecnicamente
// e seria o lugar errado — qualquer um com o link leria.
//
// O link que vai para a Z-API e para o histórico é assinado com validade longa: a Z-API
// baixa em segundos, mas o histórico da conversa precisa abrir o arquivo meses depois.

import { createServerClient } from "@/lib/supabase/client";
import { useSupabase } from "@/lib/env";
import type { MediaKind } from "@/lib/domain/types";

export const BUCKET_ENVIADOS = "documentos-enviados";

/**
 * Teto do arquivo. Não é escolha: a Vercel recusa corpo de requisição acima de 4,5 MB
 * antes de a rota rodar, com um erro que a tela não saberia explicar. 4 MB deixa folga
 * para o resto do formulário e vira uma mensagem clara no clique.
 */
export const DOCUMENTO_MAX_BYTES = 4 * 1024 * 1024;

const VALIDADE_DO_LINK_S = 60 * 60 * 24 * 365;

/** O que pode ser enviado, pela extensão — é ela que escolhe o endpoint da Z-API. */
const TIPOS: Record<string, { contentType: string; kind: MediaKind }> = {
  pdf: { contentType: "application/pdf", kind: "document" },
  doc: { contentType: "application/msword", kind: "document" },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
  },
  xls: { contentType: "application/vnd.ms-excel", kind: "document" },
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "document",
  },
  jpg: { contentType: "image/jpeg", kind: "image" },
  jpeg: { contentType: "image/jpeg", kind: "image" },
  png: { contentType: "image/png", kind: "image" },
};

export const EXTENSOES_ACEITAS = Object.keys(TIPOS);

export function extensaoDe(nome: string): string {
  return (nome.split(".").pop() ?? "").toLowerCase();
}

/**
 * O nome que o cliente vê no WhatsApp. Acento e espaço ficam — "Orçamento Maria.pdf" é o
 * que se quer mandar —, só sai o que quebra caminho de arquivo.
 */
export function nomeParaEnvio(nome: string): string {
  const limpo = nome.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return limpo.slice(-120) || `documento.${extensaoDe(nome) || "pdf"}`;
}

export type DocumentoGuardado =
  | { ok: true; url: string; kind: MediaKind; nome: string }
  | { ok: false; erro: string };

export async function guardarDocumentoEnviado(
  conversationId: string,
  nomeOriginal: string,
  bytes: Uint8Array,
): Promise<DocumentoGuardado> {
  const ext = extensaoDe(nomeOriginal);
  const tipo = TIPOS[ext];
  if (!tipo) {
    return { ok: false, erro: `Tipo de arquivo não aceito. Envie ${EXTENSOES_ACEITAS.join(", ")}.` };
  }
  if (bytes.byteLength > DOCUMENTO_MAX_BYTES) {
    return { ok: false, erro: "O arquivo passa de 4 MB. Reduza o PDF ou divida em partes." };
  }
  if (!useSupabase) return { ok: false, erro: "Armazenamento não configurado." };

  const nome = nomeParaEnvio(nomeOriginal);
  // O caminho no bucket não leva o nome do cliente: só a conversa, a hora e a extensão.
  const caminho = `${conversationId}/${Date.now()}.${ext}`;
  try {
    const supabase = createServerClient();
    const { data: bucket } = await supabase.storage.getBucket(BUCKET_ENVIADOS);
    if (!bucket) await supabase.storage.createBucket(BUCKET_ENVIADOS, { public: false });

    const { error } = await supabase.storage
      .from(BUCKET_ENVIADOS)
      .upload(caminho, bytes, { contentType: tipo.contentType, upsert: false });
    if (error) return { ok: false, erro: error.message };

    const { data: assinado, error: erroLink } = await supabase.storage
      .from(BUCKET_ENVIADOS)
      .createSignedUrl(caminho, VALIDADE_DO_LINK_S);
    if (erroLink || !assinado?.signedUrl) {
      return { ok: false, erro: erroLink?.message ?? "Não foi possível gerar o link do arquivo." };
    }
    return { ok: true, url: assinado.signedUrl, kind: tipo.kind, nome };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Falha ao guardar o arquivo." };
  }
}
