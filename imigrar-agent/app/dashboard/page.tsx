import Link from "next/link";
import { getRepository } from "@/lib/data";
import {
  BRL,
  fmtDateShort,
  fmtTime,
  Card,
  SectionTitle,
  StatStrip,
  Kpi,
  StatusBadge,
  ScoreBar,
  AgentStatus,
  EmptyState,
  PageHeader,
  Icon,
  btnPrimary,
  btnGhost,
} from "@/components/dashboard/ui";
import AutoRefresh from "@/components/dashboard/auto-refresh";
import {
  atividadeDaConversa,
  movimentacaoDoLead,
  bucketsPorDia,
  inicioDaJanela,
} from "@/lib/dashboard/periodo";
import type { LeadStage } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

// O recorte de tempo e a definição de "atendimento" vivem em lib/dashboard/periodo, com
// teste: dia de calendário de BRASÍLIA (não o relógio UTC da Vercel) e ATIVIDADE (não data
// de criação). Foi por medir criação que o painel mostrava "0 conversas" num dia de 45
// mensagens — as conversas do dia eram de clientes que voltaram.

function momentum(buckets: number[]): number {
  const half = Math.floor(buckets.length / 2);
  const recent = buckets.slice(half).reduce((a, b) => a + b, 0);
  const prior = buckets.slice(0, half).reduce((a, b) => a + b, 0);
  return recent - prior;
}

function QuickAction({
  href,
  icon,
  children,
  primary,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={primary ? btnPrimary : btnGhost}>
      <Icon name={icon} className="h-4 w-4" />
      {children}
    </Link>
  );
}

const STAGE_META: { key: LeadStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo", color: "#5B6B7F" },
  { key: "qualificado", label: "Qualificado", color: "#1D6FE0" },
  { key: "orcado", label: "Orçado", color: "#23B5D3" },
  { key: "transferido", label: "Transferido", color: "#7C5CFF" },
  { key: "ganho", label: "Ganho", color: "#16A34A" },
  { key: "perdido", label: "Perdido", color: "#DC2626" },
];

/* ── Gráfico de área com 2 séries (SVG estático, rótulos diretos) ── */
function TrendChart({
  a,
  b,
}: {
  a: { label: string; color: string; values: number[] };
  b: { label: string; color: string; values: number[] };
}) {
  const W = 720;
  const H = 200;
  const pad = { t: 16, r: 16, b: 22, l: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = a.values.length;
  const max = Math.max(1, ...a.values, ...b.values);
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = (vals: number[]) => `${line(vals)} L${x(n - 1).toFixed(1)} ${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)} ${(pad.t + ih).toFixed(1)} Z`;
  const grid = [0, 0.5, 1];

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        {[a, b].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-ib-slate">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${a.label} e ${b.label} nos últimos ${n} dias`}>
        {grid.map((g) => {
          const gy = pad.t + ih - g * ih;
          return (
            <g key={g}>
              <line x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} stroke="#E4EBF3" strokeWidth="1" />
              <text x={pad.l - 6} y={gy + 3} textAnchor="end" className="fill-ib-slate" style={{ fontSize: 9 }}>
                {Math.round(g * max)}
              </text>
            </g>
          );
        })}
        <path d={area(a.values)} fill={a.color} opacity="0.08" />
        <path d={area(b.values)} fill={b.color} opacity="0.08" />
        <path d={line(a.values)} fill="none" stroke={a.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line(b.values)} fill="none" stroke={b.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(a.values[n - 1])} r="3" fill={a.color} />
        <circle cx={x(n - 1)} cy={y(b.values[n - 1])} r="3" fill={b.color} />
      </svg>
    </div>
  );
}

/* ── Filtro de período (segmented control) ── */
const PERIODO_OPTIONS: { key: "hoje" | "7d" | "30d"; label: string; days: number }[] = [
  { key: "hoje", label: "Hoje", days: 1 },
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
];

function PeriodoFilter({ active }: { active: "hoje" | "7d" | "30d" }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-ib-line bg-white p-1">
      {PERIODO_OPTIONS.map((o) => (
        <Link
          key={o.key}
          href={`/dashboard?periodo=${o.key}`}
          aria-current={o.key === active ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            o.key === active
              ? "bg-ib-mar text-white"
              : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/* ── Tempo médio de resposta: gap médio entre msg do usuário e a resposta do agente ── */
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

/* ── Barras horizontais (funil / demanda) ── */
function BarList({
  rows,
  emptyLabel,
}: {
  rows: { label: string; count: number; color: string }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const hasData = rows.some((r) => r.count > 0);
  if (!hasData) {
    return <p className="px-5 py-8 text-center text-sm text-ib-slate">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3 p-5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ib-ink">{r.label}</span>
            <span className="font-mono text-xs tabular-nums text-ib-slate">{r.count}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ib-papel">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.count > 0 ? Math.max(4, (r.count / max) * 100) : 0}%`, background: r.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const periodoKey: "hoje" | "7d" | "30d" =
    searchParams?.periodo === "hoje" || searchParams?.periodo === "7d" ? searchParams.periodo : "30d";
  const periodo = PERIODO_OPTIONS.find((o) => o.key === periodoKey) ?? PERIODO_OPTIONS[2];
  const windowDays = periodo.days;

  const repo = getRepository();
  const [allConversations, allLeads, allProposals] = await Promise.all([
    repo.listConversations(),
    repo.listLeads(),
    repo.listProposals(),
  ]);

  const isEmpty = allConversations.length === 0 && allLeads.length === 0 && allProposals.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Central de atendimento"
          title="Visão geral"
          description="O painel de comando do agente da Imigrar Brasil."
        />
        <AgentStatus variant="hero" />
        <EmptyState
          title="Seu console ainda não recebeu conversas"
          text="Assim que o agente atender a primeira conversa, os indicadores e a atividade ao vivo aparecem aqui. Rode uma conversa de teste no simulador para ver o console ganhar vida."
          variant="grid"
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/simulate" className={btnPrimary}>
                <Icon name="external" className="h-4 w-4" />
                Abrir simulador
              </Link>
              <Link href="/dashboard/treinar" className={btnGhost}>
                <Icon name="gear" className="h-4 w-4" />
                Treinar o agente
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  // Conjunto completo (funil, serviços, atividade recente) permanece de todo o histórico;
  // KPIs e gráfico de tendência respeitam o filtro de período selecionado.
  const conversations = allConversations;
  const leads = allLeads;
  const proposals = allProposals;

  const agora = new Date();
  const inicio = inicioDaJanela(agora, windowDays).getTime();
  const desde = (iso: string) => new Date(iso).getTime() >= inicio;

  // ATENDIMENTO = atividade. Conversa e lead entram no período pela última movimentação,
  // não pela data de nascimento: cliente que voltou hoje foi atendido hoje.
  const conversationsInWindow = conversations.filter((c) => desde(atividadeDaConversa(c)));
  const leadsInWindow = leads.filter((l) => desde(movimentacaoDoLead(l)));
  // Proposta é diferente: ela não "se movimenta", ela nasce. Aqui a criação é o certo.
  const proposalsInWindow = proposals.filter((p) => desde(p.createdAt));

  const convBuckets = bucketsPorDia(
    conversationsInWindow.map((c) => ({ quando: atividadeDaConversa(c) })),
    windowDays,
    agora,
  );
  const leadBuckets = bucketsPorDia(
    leadsInWindow.map((l) => ({ quando: movimentacaoDoLead(l) })),
    windowDays,
    agora,
  );
  const pipelineBuckets = bucketsPorDia(
    proposalsInWindow.map((p) => ({ quando: p.createdAt, peso: p.totalValue ?? 0 })),
    windowDays,
    agora,
  );

  const pipeline = proposalsInWindow.reduce((sum, p) => sum + (p.totalValue ?? 0), 0);

  // Funil por etapa (novo → … → ganho/perdido).
  const funnel = STAGE_META.map((s) => ({
    label: s.label,
    color: s.color,
    count: leads.filter((l) => l.stage === s.key).length,
  }));

  // Serviços mais procurados (demanda real vinda dos leads).
  const serviceCount = new Map<string, number>();
  for (const l of leads) for (const s of l.servicesInterested ?? []) serviceCount.set(s, (serviceCount.get(s) ?? 0) + 1);
  const services = Array.from(serviceCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count, color: "#1D6FE0" }));

  // Taxa de qualificação (no período): conversas atendidas que avançaram além de "aguardando".
  // Usa o STATUS DA CONVERSA, a mesma definição de /api/agent/status — antes esta linha
  // dividia leads por conversas, e o mesmo indicador aparecia como 30% no topo da página e
  // 0% aqui embaixo, sem ninguém saber qual dos dois era o certo.
  const qualifiedInWindow = conversationsInWindow.filter(
    (c) => c.status === "negotiating" || c.status === "transferred" || c.status === "finished",
  ).length;
  const qualRate = conversationsInWindow.length
    ? Math.round((qualifiedInWindow / conversationsInWindow.length) * 100)
    : 0;

  // Leads quentes: score alto que ainda não têm proposta gerada.
  const proposedConversationIds = new Set(proposals.map((p) => p.conversationId).filter(Boolean));
  const hotLeads = leads
    .filter((l) => l.score >= 70 && !proposedConversationIds.has(l.conversationId))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Tempo médio de resposta do agente: gap médio entre uma mensagem do usuário
  // e a próxima resposta do agente, calculado nas conversas mais recentes.
  const recentForResponseTime = [...conversations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);
  const responseGaps: number[] = [];
  // Uma ida ao banco para as 30 conversas. Era um listMessages por conversa dentro
  // deste for — 30 idas em sequência, ~1,8s, com o painel parado depois do login.
  const msgsByConversation = await repo.listMessagesForConversations(
    recentForResponseTime.map((c) => c.id),
  );
  for (const c of recentForResponseTime) {
    const msgs = msgsByConversation.get(c.id) ?? [];
    const sorted = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.role === "user" && next.role === "assistant") {
        const gap = (new Date(next.createdAt).getTime() - new Date(cur.createdAt).getTime()) / 1000;
        if (gap >= 0) responseGaps.push(gap);
      }
    }
  }
  const avgResponseSeconds = responseGaps.length
    ? responseGaps.reduce((a, b) => a + b, 0) / responseGaps.length
    : null;

  // "Atividade recente" ordenava por criação: a lista congelava no dia da última conversa
  // NOVA, escondendo quem tinha acabado de responder. Agora ordena pela última mensagem.
  const recent = [...conversations]
    .sort(
      (a, b) =>
        new Date(atividadeDaConversa(b)).getTime() - new Date(atividadeDaConversa(a)).getTime(),
    )
    .slice(0, 7);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={20} />
      <PageHeader
        eyebrow="Central de atendimento"
        title="Visão geral"
        description="Panorama ao vivo do atendimento conduzido pelo agente."
        actions={
          <>
            <PeriodoFilter active={periodoKey} />
            <QuickAction href="/dashboard/orcamento" icon="calc" primary>
              Novo orçamento
            </QuickAction>
            <QuickAction href="/dashboard/leads" icon="users">
              Pipeline
            </QuickAction>
            <QuickAction href="/dashboard/treinar" icon="gear">
              Treinar
            </QuickAction>
          </>
        }
      />

      <AgentStatus variant="hero" />

      <StatStrip>
        <Kpi label="Conversas atendidas" value={String(conversationsInWindow.length)} spark={convBuckets} delta={momentum(convBuckets)} sparkStroke="#1D6FE0" sparkFill="rgba(29,111,224,0.10)" />
        <Kpi label="Leads movimentados" value={String(leadsInWindow.length)} spark={leadBuckets} delta={momentum(leadBuckets)} sparkStroke="#7C5CFF" sparkFill="rgba(124,92,255,0.12)" />
        <Kpi label="Taxa de qualificação" value={`${qualRate}%`} spark={leadBuckets} sparkStroke="#23B5D3" sparkFill="rgba(35,181,211,0.12)" />
        <Kpi label="Pipeline" value={BRL(pipeline)} spark={pipelineBuckets} sparkStroke="#16A34A" sparkFill="rgba(22,163,74,0.12)" />
        <Kpi
          label="Resp. média"
          value={avgResponseSeconds === null ? "—" : fmtDuration(avgResponseSeconds)}
        />
      </StatStrip>

      <Card className="border-ib-mar/20">
        <SectionTitle
          right={
            <span className="font-mono text-xs tabular-nums text-ib-slate">
              {hotLeads.length} {hotLeads.length === 1 ? "lead" : "leads"}
            </span>
          }
        >
          Leads quentes sem proposta
        </SectionTitle>
        {hotLeads.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ib-slate">
            Nenhum lead quente aguardando orçamento no momento.
          </p>
        ) : (
          <ul className="divide-y divide-ib-line">
            {hotLeads.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/dashboard/conversations/${l.conversationId}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-ib-bruma/50"
                >
                  <span className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-ib-success/12 px-1.5 font-mono text-xs font-semibold tabular-nums text-[#15803D]">
                    {l.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ib-ink">
                      {l.contactName ?? l.companyName ?? "Lead sem nome"}
                    </p>
                    <p className="truncate text-xs text-ib-slate">
                      {(l.servicesInterested && l.servicesInterested.length > 0
                        ? l.servicesInterested.join(", ")
                        : "Serviço não informado")}
                    </p>
                  </div>
                  <span className="hidden font-mono text-xs tabular-nums text-ib-slate sm:block">
                    {fmtDateShort(l.createdAt)}
                  </span>
                  <Icon name="arrow" className="h-4 w-4 shrink-0 text-ib-mar" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle right={<span className="text-xs text-ib-slate">últimos {windowDays} dias</span>}>
          Volume de atendimento
        </SectionTitle>
        <div className="p-5">
          <TrendChart
            a={{ label: "Conversas", color: "#1D6FE0", values: convBuckets }}
            b={{ label: "Leads", color: "#7C5CFF", values: leadBuckets }}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            right={<span className="font-mono text-xs tabular-nums text-ib-slate">{leads.length}</span>}
          >
            Funil do pipeline
          </SectionTitle>
          <BarList rows={funnel} emptyLabel="Sem leads no funil ainda." />
        </Card>

        <Card>
          <SectionTitle
            right={
              <Link href="/dashboard/orcamento" className="text-xs font-semibold text-ib-mar hover:underline">
                Orçar
              </Link>
            }
          >
            Serviços mais procurados
          </SectionTitle>
          <BarList rows={services} emptyLabel="Nenhum serviço registrado ainda." />
        </Card>
      </div>

      <Card>
        <SectionTitle
          right={
            <Link
              href="/dashboard/conversations"
              className="inline-flex items-center gap-1 text-xs font-semibold text-ib-mar hover:underline"
            >
              Ver todas <Icon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          Atividade recente
        </SectionTitle>
        <ul className="divide-y divide-ib-line">
          {recent.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/conversations/${c.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-ib-bruma/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ib-bruma text-ib-mar">
                  <Icon name="chat" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ib-ink">
                    {c.contactName ?? c.whatsappNumber}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-ib-slate">
                    {fmtDateShort(atividadeDaConversa(c))} · {fmtTime(atividadeDaConversa(c))}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <ScoreBar score={c.leadScore} />
                </div>
                <StatusBadge kind="conversation" status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
