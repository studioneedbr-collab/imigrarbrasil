import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { podeEditarSite } from "@/lib/site/permissoes";
import { TIPOS_CONTEUDO_SITE, type TipoConteudoSite } from "@/lib/site/conteudo";
import { salvarItem } from "@/lib/site/salvar";

export const dynamic = "force-dynamic";

const tipoValido = (t: string): t is TipoConteudoSite => (TIPOS_CONTEUDO_SITE as readonly string[]).includes(t);

/** Lista posts, serviços ou a configuração. Ler é para todo o painel. */
export async function GET(_req: NextRequest, { params }: { params: { tipo: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!tipoValido(params.tipo)) return NextResponse.json({ error: "Tipo desconhecido." }, { status: 404 });
  return NextResponse.json({ itens: await getRepository().listarConteudoSite(params.tipo) });
}

/** Cria (ou substitui) um item. O slug vem no corpo, junto com os dados. */
export async function POST(req: NextRequest, { params }: { params: { tipo: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditarSite(auth.session.role)) return forbidden();
  if (!tipoValido(params.tipo)) return NextResponse.json({ error: "Tipo desconhecido." }, { status: 404 });
  return salvarItem(req, params.tipo, null, auth.session.email);
}
