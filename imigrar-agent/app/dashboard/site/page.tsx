import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { Card, PageHeader, StatStrip, Kpi } from "@/components/dashboard/ui";
import { AbasDoSite } from "@/components/dashboard/abas";
import Publicar from "@/components/site/publicar";
import Importar from "@/components/site/importar";
import { podeEditarSite } from "@/lib/site/permissoes";
import { githubConfigurado } from "@/lib/site/github";
import { resumirSite, rotuloDoAlvo, type ContagemSite } from "@/lib/site/resumo";
import { DISPOSITIVO_LABEL, type DispositivoSite } from "@/lib/site/conteudo";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90] as const;
const nomeDoPais = (iso: string) => { try { return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(iso) ?? iso; } catch { return iso; } };
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR");

/** Lista com barra proporcional — o ranking lê mais rápido do que uma tabela. */
function Ranking({ titulo, itens, rotulo = (c: string) => c, vazio }: { titulo: string; itens: ContagemSite[]; rotulo?: (c: string) => string; vazio: string }) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  return (
    <Card className="p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">{titulo}</h3>
      {itens.length ? (
        <ul className="mt-3 space-y-2.5">
          {itens.map((i) => (
            <li key={i.chave}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ib-ink" title={i.chave}>{rotulo(i.chave)}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ib-slate">{num(i.n)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-ib-papel">
                <div className="h-1.5 rounded-full bg-ib-selo" style={{ width: `${(i.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ib-slate">{vazio}</p>
      )}
    </Card>
  );
}

/** Visitas (barra) e contatos (barra escura por cima) de cada dia. SVG puro, sem biblioteca. */
function GraficoPorDia({ dias }: { dias: { dia: string; visitas: number; contatos: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.visitas));
  const L = 100 / dias.length;
  return (
    <div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Visitas e contatos por dia">
        {dias.map((d, i) => {
          const hv = (d.visitas / max) * 38, hc = (d.contatos / max) * 38;
          return (
            <g key={d.dia}>
              <title>{`${d.dia.split("-").reverse().join("/")}: ${d.visitas} visitas, ${d.contatos} contatos`}</title>
              <rect x={i * L + L * 0.15} width={L * 0.7} y={40 - hv} height={hv} rx={0.4} className="fill-ib-bruma" />
              <rect x={i * L + L * 0.15} width={L * 0.7} y={40 - hc} height={hc} rx={0.4} className="fill-ib-mar" />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-ib-slate">
        <span>{dias[0]?.dia.split("-").reverse().slice(0, 2).join("/")}</span>
        <span className="flex gap-4 font-sans">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ib-bruma ring-1 ring-ib-line" />visitas</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ib-mar" />contatos</span>
        </span>
        <span>{dias.at(-1)?.dia.split("-").reverse().slice(0, 2).join("/")}</span>
      </div>
    </div>
  );
}

export default async function SitePage({ searchParams }: { searchParams: { dias?: string } }) {
  const dias = PERIODOS.includes(Number(searchParams.dias) as 7) ? Number(searchParams.dias) : 30;
  const sessao = await getSession();
  const repo = getRepository();
  const [eventos, posts, servicos] = await Promise.all([
    repo.listarEventosSite(new Date(Date.now() - dias * 86_400_000)),
    repo.listarConteudoSite("post"),
    repo.listarConteudoSite("servico"),
  ]);
  const r = resumirSite(eventos, dias);
  const vazio = posts.length === 0 && servicos.length === 0;

  // O que falta para o circuito inteiro funcionar. Cada item diz o que fazer, não só o que falta.
  const pendencias = [
    !env.siteExportToken && "SITE_EXPORT_TOKEN não está configurado no painel: o build não consegue buscar o conteúdo.",
    !githubConfigurado() && "GITHUB_TOKEN não está configurado no painel: o botão Publicar fica desligado.",
    env.siteOrigins.length === 0 && "SITE_CAPTURE_ORIGINS está vazio: os cliques mandados pelo site podem ser bloqueados pelo navegador (CORS).",
    vazio && "O conteúdo do site ainda não foi importado para o painel.",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Site imigrarbrasil.com"
        title="Visão geral"
        description="Quem visita, o que clica e quantos viram conversa. Os números são anônimos: nenhum cookie, nenhum dado pessoal."
        actions={
          <div className="inline-flex rounded-xl bg-ib-papel p-1 ring-1 ring-inset ring-ib-line">
            {PERIODOS.map((p) => (
              <Link key={p} href={`/dashboard/site?dias=${p}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${p === dias ? "bg-white text-ib-ink shadow-sm" : "text-ib-slate hover:text-ib-ink"}`}>
                {p} dias
              </Link>
            ))}
          </div>
        }
      />
      <AbasDoSite />

      {pendencias.length ? (
        <Card className="border-ib-warn/40 p-5">
          <h2 className="font-display text-base font-semibold text-ib-ink">Para ligar tudo</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ib-slate">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
        </Card>
      ) : null}

      {vazio && sessao?.role === "admin" ? <Importar temGithub={githubConfigurado()} /> : null}

      <StatStrip>
        <Kpi label="Visitas" value={num(r.visitas)} spark={r.porDia.map((d) => d.visitas)} />
        <Kpi label="Contatos (WhatsApp + formulário)" value={num(r.porDia.reduce((s, d) => s + d.contatos, 0))} spark={r.porDia.map((d) => d.contatos)} sparkStroke="#009687" sparkFill="rgba(0,150,135,0.10)" />
        <Kpi label="Formulários enviados" value={num(r.formularios)} />
        <Kpi label="Conversão" value={pct(r.conversao)} />
      </StatStrip>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold text-ib-ink">Por dia</h2>
        <div className="mt-4"><GraficoPorDia dias={r.porDia} /></div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Ranking titulo="O que mais clicam" itens={r.alvos} rotulo={rotuloDoAlvo} vazio="Nenhum clique no período." />
        <Ranking titulo="Páginas mais vistas" itens={r.paginas} vazio="Nenhuma visita no período." />
        <Ranking titulo="De onde vêm" itens={r.origens} rotulo={(c) => (c === "direto" ? "Direto / sem origem" : c)} vazio="—" />
        <Ranking titulo="Países" itens={r.paises} rotulo={nomeDoPais} vazio="—" />
        <Ranking titulo="Aparelho" itens={r.dispositivos} rotulo={(c) => DISPOSITIVO_LABEL[c as DispositivoSite] ?? c} vazio="—" />
        <Ranking titulo="Idioma em que leram" itens={r.idiomas} rotulo={(c) => c.toUpperCase()} vazio="—" />
      </div>

      <Card className="p-5">
        <Publicar podeEditar={podeEditarSite(sessao?.role)} />
      </Card>
    </div>
  );
}
