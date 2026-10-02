import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import { TIPOS_CONTEUDO_SITE, type TipoConteudoSite } from "@/lib/site/conteudo";
import { salvarItem } from "@/lib/site/salvar";

export const dynamic = "force-dynamic";

type Params = { params: { tipo: string; slug: string } };
const tipoValido = (t: string): t is TipoConteudoSite => (TIPOS_CONTEUDO_SITE as readonly string[]).includes(t);

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!tipoValido(params.tipo)) return NextResponse.json({ error: "Tipo desconhecido." }, { status: 404 });
  const item = await getRepository().obterConteudoSite(params.tipo, params.slug);
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Não encontrado." }, { status: 404 });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditarSite(auth.session.role)) return forbidden();
  if (!tipoValido(params.tipo)) return NextResponse.json({ error: "Tipo desconhecido." }, { status: 404 });
  return salvarItem(req, params.tipo, params.slug, auth.session.email);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditarSite(auth.session.role)) return forbidden();
  if (!tipoValido(params.tipo) || params.tipo === "config") return NextResponse.json({ error: "Não dá para apagar isso." }, { status: 400 });
  await getRepository().excluirConteudoSite(params.tipo, params.slug);
  return NextResponse.json({ ok: true });
}
