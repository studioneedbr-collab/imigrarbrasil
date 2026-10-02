import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { postSchema, servicoSchema, configSchema, SLUG_CONFIG, limparHtmlDoSite } from "@/lib/site/conteudo";
import { githubConfigurado, lerArquivoDoRepo } from "@/lib/site/github";

export const dynamic = "force-dynamic";

/**
 * TRAZ PARA O PAINEL O CONTEÚDO QUE JÁ ESTÁ NO SITE.
 *
 * Antes do painel, posts e serviços moravam em site/src/data/*.json, no repositório. Esta
 * rota copia esses arquivos para o banco uma vez — depois disso, o banco é a fonte e o
 * build passa a buscar dele.
 *
 * NÃO SOBRESCREVE o que já foi editado no painel, a menos que `sobrescrever: true`: rodar
 * a importação de novo por engano não pode desfazer o trabalho de ninguém.
 *
 * O conteúdo vem do GitHub quando há GITHUB_TOKEN; sem ele, a tela pode mandar os
 * arquivos no corpo ({ posts, servicos, config }).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  // Fora do `if`: dentro de `guardar` (função interna) o TypeScript não lembra que a
  // sessão existe.
  const sessao = auth.session;

  let corpo: { sobrescrever?: boolean; posts?: unknown[]; servicos?: unknown[]; config?: unknown } = {};
  try { corpo = await req.json(); } catch { /* corpo vazio: busca no GitHub */ }

  let posts = corpo.posts, servicos = corpo.servicos, config = corpo.config;
  if (!posts && !servicos && !config) {
    if (!githubConfigurado()) {
      return NextResponse.json({ error: "Sem GITHUB_TOKEN: envie os arquivos posts.json, servicos.json e site.json pela tela." }, { status: 400 });
    }
    try {
      const ler = async (f: string) => { const t = await lerArquivoDoRepo(`site/src/data/${f}`); return t ? JSON.parse(t) : undefined; };
      [posts, servicos, config] = await Promise.all([ler("posts.json"), ler("servicos.json"), ler("site.json")]);
    } catch (err) {
      console.error("[site/importar]", err);
      return NextResponse.json({ error: "Não consegui ler os arquivos do repositório no GitHub." }, { status: 502 });
    }
  }

  const repo = getRepository();
  const sobrescrever = corpo.sobrescrever === true;
  const resultado = { importados: 0, mantidos: 0, recusados: [] as string[] };

  async function guardar(tipo: "post" | "servico" | "config", bruto: unknown, schema: typeof postSchema | typeof servicoSchema | typeof configSchema) {
    const p = schema.safeParse(bruto);
    const nome = (bruto as { slug?: string })?.slug ?? tipo;
    if (!p.success) {
      const i = p.error.issues[0];
      resultado.recusados.push(`${nome}: ${i?.path.join(".")} — ${i?.message}`);
      return;
    }
    const dados: Record<string, unknown> = { ...p.data };
    for (const c of ["html", "paraQuem", "fechamento"]) if (typeof dados[c] === "string") dados[c] = limparHtmlDoSite(dados[c] as string);
    const slug = tipo === "config" ? SLUG_CONFIG : String(dados.slug);
    if (!sobrescrever && (await repo.obterConteudoSite(tipo, slug))) { resultado.mantidos++; return; }
    await repo.salvarConteudoSite({ tipo, slug, dados, publicado: true, por: `importação (${sessao.email})` });
    resultado.importados++;
  }

  for (const p of Array.isArray(posts) ? posts : []) await guardar("post", p, postSchema);
  for (const s of Array.isArray(servicos) ? servicos : []) await guardar("servico", s, servicoSchema);
  if (config) await guardar("config", config, configSchema);

  await registrarAcesso(sessao, "site_importar", { tipo: "site", detalhe: `${resultado.importados} importados` });
  return NextResponse.json(resultado);
}
