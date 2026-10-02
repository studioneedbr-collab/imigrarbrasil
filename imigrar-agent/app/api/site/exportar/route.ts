import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { conferirTokenDeExportacao } from "@/lib/auth/token-de-captura";
import { SLUG_CONFIG, minutosDeLeitura, type PostSite, type ServicoSite } from "@/lib/site/conteudo";

export const dynamic = "force-dynamic";

/**
 * O CONTEÚDO DO SITE, PARA O BUILD.
 *
 * Quem chama é o GitHub Actions (.github/workflows/publicar-site.yml), antes de gerar o
 * site: o que sai daqui vira site/src/data/*.json. Só o que está PUBLICADO — rascunho
 * fica no painel. Autenticada por SITE_EXPORT_TOKEN, fail-closed.
 *
 * `vazio: true` quando nada foi importado ainda: o build então mantém o JSON que já está
 * no repositório, em vez de publicar um site sem posts.
 */
export async function GET(req: NextRequest) {
  const recusa = conferirTokenDeExportacao(req);
  if (recusa) return recusa;

  const repo = getRepository();
  const [posts, servicos, config] = await Promise.all([
    repo.listarConteudoSite("post"),
    repo.listarConteudoSite("servico"),
    repo.obterConteudoSite("config", SLUG_CONFIG),
  ]);

  const postsPublicados = posts
    .filter((r) => r.publicado)
    .map((r) => {
      const p = r.dados as PostSite;
      return { ...p, seoTitle: p.seoTitle || p.title, readingMinutes: minutosDeLeitura(p.html) };
    })
    .sort((a, b) => b.published.localeCompare(a.published));
  const servicosPublicados = servicos
    .filter((r) => r.publicado)
    .map((r) => {
      const s = r.dados as ServicoSite;
      return { ...s, seoTitle: s.seoTitle || s.title };
    });

  return NextResponse.json({
    vazio: posts.length === 0 && servicos.length === 0 && !config,
    geradoEm: new Date().toISOString(),
    posts: postsPublicados,
    servicos: servicosPublicados,
    config: config?.dados ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}
