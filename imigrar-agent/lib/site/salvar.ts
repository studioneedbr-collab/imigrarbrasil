import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { SCHEMA_POR_TIPO, SLUG_CONFIG, limparHtmlDoSite, type TipoConteudoSite } from "@/lib/site/conteudo";

// Mora aqui, e não no route.ts que o usa: arquivo de rota do Next só pode exportar os
// métodos HTTP, e o `next build` recusa qualquer outra exportação.

/**
 * SALVAR, compartilhado com a rota do item ([tipo]/[slug]).
 *
 * `slugAtual` é o endereço que o item tinha: quando a pessoa muda o slug de um post já
 * publicado, o registro antigo sai e o novo entra — e a resposta avisa, porque o endereço
 * antigo vai dar 404 no site (e no Google) até alguém criar o redirecionamento.
 */
export async function salvarItem(req: NextRequest, tipo: TipoConteudoSite, slugAtual: string | null, por: string) {
  let corpo: { dados?: unknown; publicado?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const p = SCHEMA_POR_TIPO[tipo].safeParse(corpo.dados);
  if (!p.success) {
    const i = p.error.issues[0];
    return NextResponse.json({ error: `${i?.path.join(".") || "dados"}: ${i?.message ?? "inválido"}` }, { status: 400 });
  }
  const dados: Record<string, unknown> = { ...p.data };
  for (const campo of ["html", "paraQuem", "fechamento"]) {
    if (typeof dados[campo] === "string") dados[campo] = limparHtmlDoSite(dados[campo] as string);
  }
  const slug = tipo === "config" ? SLUG_CONFIG : String(dados.slug);
  const repo = getRepository();

  if (!slugAtual || slugAtual !== slug) {
    const existente = await repo.obterConteudoSite(tipo, slug);
    if (existente && tipo !== "config") {
      return NextResponse.json({ error: "Já existe outro item com esse endereço." }, { status: 409 });
    }
  }
  const salvo = await repo.salvarConteudoSite({ tipo, slug, dados, publicado: corpo.publicado ?? true, por });
  const mudouEndereco = !!slugAtual && slugAtual !== slug && tipo !== "config";
  if (mudouEndereco) await repo.excluirConteudoSite(tipo, slugAtual!);
  return NextResponse.json({ item: salvo, mudouEndereco, enderecoAntigo: mudouEndereco ? slugAtual : null });
}
