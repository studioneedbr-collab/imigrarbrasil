import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { Card, PageHeader, EmptyState, btnPrimary } from "@/components/dashboard/ui";
import { AbasDoSite } from "@/components/dashboard/abas";
import { podeEditarSite } from "@/lib/site/permissoes";
import type { PostSite } from "@/lib/site/conteudo";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const sessao = await getSession();
  const itens = (await getRepository().listarConteudoSite("post"))
    .map((r) => ({ ...r, p: r.dados as PostSite }))
    .sort((a, b) => b.p.published.localeCompare(a.p.published));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Site imigrarbrasil.com"
        title="Blog"
        description="Os artigos do site. O que estiver como rascunho não vai para o ar na próxima publicação."
        actions={podeEditarSite(sessao?.role) ? <Link href="/dashboard/site/blog/novo" className={btnPrimary}>Novo artigo</Link> : null}
      />
      <AbasDoSite />
      {itens.length === 0 ? (
        <EmptyState title="Nenhum artigo no painel" text="Importe o conteúdo atual do site na Visão geral, ou escreva o primeiro artigo." />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ib-line">
            {itens.map(({ slug, publicado, p, atualizadoEm, atualizadoPor }) => (
              <li key={slug} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/dashboard/site/blog/${slug}`} className="font-semibold text-ib-ink hover:text-ib-mar">{p.title}</Link>
                  <p className="mt-0.5 truncate font-mono text-xs text-ib-slate">/{slug}/</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-ib-slate">
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ${publicado ? "bg-ib-success/12 text-[#15803D]" : "bg-ib-warn/12 text-[#8a5308]"}`}>{publicado ? "Publicado" : "Rascunho"}</span>
                  <span title={`Editado por ${atualizadoPor ?? "—"}`}>{new Date(p.published).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                  {publicado ? <a href={`https://imigrarbrasil.com/${slug}/`} target="_blank" rel="noopener" className="font-semibold text-ib-mar hover:underline">ver no site</a> : null}
                  <span className="hidden lg:inline">editado {new Date(atualizadoEm).toLocaleDateString("pt-BR")}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
