import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { podeExportar } from "@/lib/auth/papeis";
import { Card, PageHeader, EmptyState, Icon, btnBarra } from "@/components/dashboard/ui";
import { FORMULARIOS_POR_PAGINA, daNota, nomeDoFormulario, quandoEmBrasilia } from "@/lib/site/formularios";
import { AbasDoSite } from "@/components/dashboard/abas";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";

export const dynamic = "force-dynamic";

/**
 * QUEM PREENCHEU O FORMULÁRIO DO SITE. As regras de leitura (de onde sai "formulário" e
 * "página") estão em lib/site/formularios.ts, compartilhadas com a planilha exportada.
 *
 * PAGINADA NO BANCO, e não cortada em memória: antes a tela mostrava no máximo 300, tirados
 * dos 2000 leads mais recentes do CRM inteiro — num mês de WhatsApp movimentado, formulário
 * antigo sumia daqui sem aviso.
 */

/** As páginas que viram botão: as pontas, a atual e as vizinhas. `null` é a reticência. */
function janela(pagina: number, paginas: number): (number | null)[] {
  const quais = [...new Set([1, 2, pagina - 1, pagina, pagina + 1, paginas - 1, paginas])]
    .filter((p) => p >= 1 && p <= paginas)
    .sort((a, b) => a - b);
  return quais.flatMap((p, i) => (i > 0 && p - quais[i - 1] > 1 ? [null, p] : [p]));
}

const botaoPagina = "min-w-[2.25rem] rounded-lg border border-ib-line px-3 py-1.5 text-center font-mono text-sm tabular-nums text-ib-ink transition hover:bg-ib-papel";
const botaoApagado = "rounded-lg border border-ib-line px-3 py-1.5 text-sm text-ib-ink opacity-40";

export default async function FormulariosPage(props: { searchParams: Promise<{ pagina?: string }> }) {
  const pedida = Math.max(1, Math.floor(Number((await props.searchParams).pagina)) || 1);
  const [sessao, primeira] = await Promise.all([
    getSession(),
    getRepository().listarLeadsPorOrigem("site", { pagina: pedida, porPagina: FORMULARIOS_POR_PAGINA }),
  ]);
  const total = primeira.total;
  const paginas = Math.max(1, Math.ceil(total / FORMULARIOS_POR_PAGINA));
  // Endereço com página além do fim (link antigo, lista que encolheu): mostra a última.
  const pagina = Math.min(pedida, paginas);
  const leads =
    pagina === pedida
      ? primeira.leads
      : (await getRepository().listarLeadsPorOrigem("site", { pagina, porPagina: FORMULARIOS_POR_PAGINA })).leads;
  const exporta = sessao ? podeExportar(sessao.role) : false;
  const href = (p: number) => (p <= 1 ? "/dashboard/site/formularios" : `/dashboard/site/formularios?pagina=${p}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Site imigrarbrasil.com" title="Formulários" description="Quem deixou nome e WhatsApp no site. Cada pessoa já está no CRM, na etapa em que o time a deixou."
        actions={
          exporta && total > 0 ? (
            // <a> e não <Link>: é um download, e o Link tentaria pré-carregar a planilha.
            <a href="/api/exportar/formularios" className={btnBarra} title={`Baixar os ${total} em CSV (abre no Excel)`}>
              <Icon name="doc" className="h-4 w-4 text-ib-slate" />
              Exportar planilha ({total})
            </a>
          ) : null
        }
      />
      <AbasDoSite />
      {total === 0 ? (
        <EmptyState title="Nenhum formulário ainda" text="Quando alguém preencher o formulário do site, a pessoa aparece aqui e na fila do CRM." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-ib-papel text-left text-[11px] uppercase tracking-[0.12em] text-ib-slate">
                <tr>
                  <th className="px-5 py-3 font-semibold">Quando</th>
                  <th className="px-5 py-3 font-semibold">Quem</th>
                  <th className="px-5 py-3 font-semibold">Formulário</th>
                  <th className="px-5 py-3 font-semibold">Página</th>
                  <th className="px-5 py-3 font-semibold">Idioma</th>
                  <th className="px-5 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ib-line">
                {leads.map((l) => {
                  const pagina = daNota(l.notes, "Página");
                  return (
                    <tr key={l.id} className="hover:bg-ib-papel/60">
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-ib-slate">{quandoEmBrasilia(l.createdAt)}</td>
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/conversations/${l.conversationId}`} className="font-semibold text-ib-ink hover:text-ib-mar">{l.contactName || "Sem nome"}</Link>
                        {l.email ? <div className="text-xs text-ib-slate">{l.email}</div> : null}
                      </td>
                      <td className="px-5 py-3 text-ib-ink">{nomeDoFormulario(daNota(l.notes, "Origem"))}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 font-mono text-xs text-ib-slate" title={pagina ?? ""}>{pagina ?? "—"}</td>
                      <td className="px-5 py-3 text-ib-slate">{l.idioma ? nomeDoIdioma(l.idioma) : "—"}</td>
                      <td className="px-5 py-3 text-ib-ink">{l.atendimentoStatus ? ATENDIMENTO_LABEL[l.atendimentoStatus] : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-2 border-t border-ib-line px-5 py-3">
            <span className="font-mono text-xs tabular-nums text-ib-slate">
              {total} {total === 1 ? "registro" : "registros"}
              {paginas > 1 ? ` · pág. ${pagina}/${paginas}` : ""}
            </span>
            {paginas > 1 ? (
              <div className="flex flex-wrap items-center gap-1">
                {pagina > 1 ? <Link href={href(pagina - 1)} className={botaoPagina}>Anterior</Link> : <span className={botaoApagado}>Anterior</span>}
                {janela(pagina, paginas).map((p, i) =>
                  p === null ? (
                    <span key={`r${i}`} className="px-1 text-ib-slate">…</span>
                  ) : p === pagina ? (
                    <span key={p} aria-current="page" className="min-w-[2.25rem] rounded-lg bg-ib-mar px-3 py-1.5 text-center font-mono text-sm tabular-nums text-white">{p}</span>
                  ) : (
                    <Link key={p} href={href(p)} className={botaoPagina}>{p}</Link>
                  ),
                )}
                {pagina < paginas ? <Link href={href(pagina + 1)} className={botaoPagina}>Próxima</Link> : <span className={botaoApagado}>Próxima</span>}
              </div>
            ) : null}
          </nav>
        </Card>
      )}
    </div>
  );
}
