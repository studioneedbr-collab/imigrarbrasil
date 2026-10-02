import { NextResponse } from "next/server";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { githubConfigurado, dispararPublicacao, ultimasPublicacoes } from "@/lib/site/github";

export const dynamic = "force-dynamic";

/** As últimas publicações (execuções do workflow), para a tela mostrar o andamento. */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!githubConfigurado()) return NextResponse.json({ configurado: false, publicacoes: [] });
  try {
    return NextResponse.json({ configurado: true, publicacoes: await ultimasPublicacoes() });
  } catch (err) {
    return NextResponse.json({ configurado: true, publicacoes: [], erro: err instanceof Error ? err.message : "falhou" });
  }
}

/** O botão Publicar. */
export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditarSite(auth.session.role)) return forbidden();
  if (!githubConfigurado()) {
    return NextResponse.json({ error: "Publicação automática não configurada: falta GITHUB_TOKEN no painel." }, { status: 503 });
  }
  try {
    await dispararPublicacao(auth.session.email);
  } catch (err) {
    console.error("[site/publicar]", err);
    return NextResponse.json({ error: "O GitHub recusou o pedido de publicação. Confira o GITHUB_TOKEN." }, { status: 502 });
  }
  await registrarAcesso(auth.session, "site_publicar", { tipo: "site" });
  return NextResponse.json({ ok: true });
}
