import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { Card, PageHeader, EmptyState, btnPrimary } from "@/components/dashboard/ui";
import { AbasDoSite } from "@/components/dashboard/abas";
import { podeEditarSite } from "@/lib/site/permissoes";
import { CATEGORIAS_SITE } from "@/lib/site/categorias";
import type { ServicoSite } from "@/lib/site/conteudo";

export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  const sessao = await getSession();
  const itens = (await getRepository().listarConteudoSite("servico")).map((r) => ({ ...r, s: r.dados as ServicoSite }));
  const grupos = CATEGORIAS_SITE.map((c) => ({ c, itens: itens.filter((i) => i.s.categoria === c) }));
  const orfaos = itens.filter((i) => !(CATEGORIAS_SITE as readonly string[]).includes(i.s.categoria));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Site imigrarbrasil.com"
        title="Serviços"
        description="As páginas de serviço do site, por categoria."
        actions={podeEditarSite(sessao?.role) ? <Link href="/dashboard/site/servicos/novo" className={btnPrimary}>Novo serviço</Link> : null}
      />
      <AbasDoSite />
      {itens.length === 0 ? (
        <EmptyState title="Nenhum serviço no painel" text="Importe o conteúdo atual do site na Visão geral." />
      ) : (
        [...grupos, ...(orfaos.length ? [{ c: "Sem categoria conhecida", itens: orfaos }] : [])].map(({ c, itens }) => (
          itens.length ? (
            <Card key={c} className="overflow-hidden">
              <h2 className="border-b border-ib-line bg-ib-papel px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">{c} · {itens.length}</h2>
              <ul className="divide-y divide-ib-line">
                {itens.map(({ slug, publicado, s }) => (
                  <li key={slug} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/dashboard/site/servicos/${slug}`} className="min-w-0 font-semibold text-ib-ink hover:text-ib-mar">{s.title}</Link>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${publicado ? "bg-ib-success/12 text-[#15803D]" : "bg-ib-warn/12 text-[#8a5308]"}`}>{publicado ? "Publicado" : "Rascunho"}</span>
                      {publicado ? <a href={`https://imigrarbrasil.com/servico/${slug}/`} target="_blank" rel="noopener" className="font-semibold text-ib-mar hover:underline">ver no site</a> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null
        ))
      )}
    </div>
  );
}
