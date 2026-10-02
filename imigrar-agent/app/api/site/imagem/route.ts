import { NextRequest, NextResponse } from "next/server";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import { useSupabase } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

/**
 * ENVIO DE IMAGEM DE POST OU SERVIÇO → bucket público `site` (migration 035).
 *
 * Devolve a URL pública. No build, o site baixa a imagem para dentro dele mesmo, então
 * esta URL do Supabase nunca é o que o visitante carrega.
 */
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditarSite(auth.session.role)) return forbidden();
  if (!useSupabase) {
    return NextResponse.json({ error: "Envio de imagem precisa do Supabase configurado. Cole o endereço de uma imagem já publicada." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  const ext = TIPOS[arquivo.type];
  if (!ext) return NextResponse.json({ error: "Use JPG, PNG ou WebP." }, { status: 400 });
  if (arquivo.size > MAX) return NextResponse.json({ error: "A imagem passa de 5 MB. Reduza antes de enviar." }, { status: 400 });

  const base = (String(form?.get("nome") ?? "imagem").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "imagem").slice(0, 60);
  const agora = new Date();
  const caminho = `uploads/${agora.getUTCFullYear()}/${String(agora.getUTCMonth() + 1).padStart(2, "0")}/${base}-${agora.getTime().toString(36)}.${ext}`;

  const db = createServerClient();
  const { error } = await db.storage.from("site").upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: arquivo.type, upsert: false });
  if (error) {
    console.error("[site/imagem]", error.message);
    return NextResponse.json({ error: "O envio falhou. Confira se a migration 035 (bucket `site`) foi aplicada." }, { status: 502 });
  }
  return NextResponse.json({ url: db.storage.from("site").getPublicUrl(caminho).data.publicUrl });
}
