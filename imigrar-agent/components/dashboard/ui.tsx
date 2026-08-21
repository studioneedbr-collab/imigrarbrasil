import type { ReactNode } from "react";
import type {
  ConversationStatus,
  LeadStatus,
  ProposalStatus,
  Urgency,
} from "@/lib/domain/types";

export { AgentStatus } from "./agent-status";
export type { AgentStatusData } from "./agent-status";

/* ------------------------------------------------------------------ */
/* Formatters                                                          */
/* ------------------------------------------------------------------ */

export const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/* ------------------------------------------------------------------ */
/* PT-BR label maps                                                    */
/* ------------------------------------------------------------------ */

export const conversationStatusLabel: Record<ConversationStatus, string> = {
  active: "Aberta",
  waiting: "Aguardando",
  negotiating: "Em negociação",
  transferred: "Transferida",
  finished: "Finalizada",
  inactive: "Inativa",
};

export const leadStatusLabel: Record<LeadStatus, string> = {
  new: "Novo",
  contacted: "Contatado",
  proposal_sent: "Proposta enviada",
  negotiating: "Negociando",
  won: "Ganho",
  lost: "Perdido",
};

export const proposalStatusLabel: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  viewed: "Visualizada",
  accepted: "Aceita",
  rejected: "Rejeitada",
};

export const urgencyLabel: Record<Urgency, string> = {
  immediate: "Imediata",
  short: "Curta",
  medium: "Média",
  long: "Longa",
};

export const CONVERSATION_STATUSES: ConversationStatus[] = [
  "active",
  "waiting",
  "negotiating",
  "transferred",
  "finished",
  "inactive",
];
export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
];
export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
];

/* ------------------------------------------------------------------ */
/* Status color mapping                                                */
/* ------------------------------------------------------------------ */

type Tone = "blue" | "azure" | "amber" | "slate" | "violet" | "green" | "red";

const tonePill: Record<Tone, string> = {
  blue: "bg-ib-mar/10 text-ib-mar",
  azure: "bg-ib-selo/15 text-[#0B7285]",
  amber: "bg-ib-warn/12 text-[#9A6212]",
  slate: "bg-slate-100 text-ib-slate",
  violet: "bg-ib-violeta/12 text-[#5B44CC]",
  green: "bg-ib-success/12 text-[#15803D]",
  red: "bg-ib-danger/10 text-ib-danger",
};

const toneDot: Record<Tone, string> = {
  blue: "bg-ib-mar",
  azure: "bg-ib-selo",
  amber: "bg-ib-warn",
  slate: "bg-slate-400",
  violet: "bg-ib-violeta",
  green: "bg-ib-success",
  red: "bg-ib-danger",
};

const toneBar: Record<Tone, string> = toneDot;

export const conversationTone: Record<ConversationStatus, Tone> = {
  active: "green",
  waiting: "amber",
  negotiating: "blue",
  transferred: "violet",
  finished: "slate",
  inactive: "red",
};

export const leadTone: Record<LeadStatus, Tone> = {
  new: "slate",
  contacted: "blue",
  proposal_sent: "azure",
  negotiating: "amber",
  won: "green",
  lost: "red",
};

export const proposalTone: Record<ProposalStatus, Tone> = {
  draft: "slate",
  sent: "blue",
  viewed: "azure",
  accepted: "green",
  rejected: "red",
};

export function toneForStatus(
  kind: "conversation" | "lead" | "proposal",
  status: string,
): Tone {
  if (kind === "conversation")
    return conversationTone[status as ConversationStatus] ?? "slate";
  if (kind === "lead") return leadTone[status as LeadStatus] ?? "slate";
  return proposalTone[status as ProposalStatus] ?? "slate";
}

export function barColorForStatus(
  kind: "conversation" | "lead" | "proposal",
  status: string,
): string {
  return toneBar[toneForStatus(kind, status)];
}

export function dotColorForStatus(
  kind: "conversation" | "lead" | "proposal",
  status: string,
): string {
  return toneDot[toneForStatus(kind, status)];
}

function labelForStatus(kind: "conversation" | "lead" | "proposal", status: string): string {
  if (kind === "conversation")
    return conversationStatusLabel[status as ConversationStatus] ?? status;
  if (kind === "lead") return leadStatusLabel[status as LeadStatus] ?? status;
  return proposalStatusLabel[status as ProposalStatus] ?? status;
}

/* ------------------------------------------------------------------ */
/* Structure: PageHeader (recurring eyebrow + title device)            */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ib-selo">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-ib-ink sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ib-slate">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ib-line bg-white shadow-[0_1px_2px_rgba(11,18,32,0.04),0_8px_24px_-16px_rgba(11,18,32,0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ib-line px-5 py-4">
      <p className="text-sm font-semibold text-ib-ink">{children}</p>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StatusBadge — refined dot pill                                      */
/* ------------------------------------------------------------------ */

export function StatusBadge({
  kind,
  status,
}: {
  kind: "conversation" | "lead" | "proposal";
  status: string;
}) {
  const tone = toneForStatus(kind, status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tonePill[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} />
      {labelForStatus(kind, status)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — inline SVG, no deps                                     */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  className = "h-9 w-full",
  stroke = "#1D6FE0",
  fill = "rgba(29,111,224,0.10)",
}: {
  data: number[];
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  const W = 100;
  const H = 32;
  const pts = data.length > 0 ? data : [0, 0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const step = pts.length > 1 ? W / (pts.length - 1) : W;
  const coords = pts.map((v, i) => {
    const x = i * step;
    const y = H - 3 - ((v - min) / span) * (H - 6);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path d={area} fill={fill} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.2} fill={stroke} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* StatStrip + Kpi — connected KPI row with sparklines and deltas      */
/* ------------------------------------------------------------------ */

export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-y-0 sm:[&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0">
        {children}
      </div>
    </Card>
  );
}

export function Kpi({
  label,
  value,
  spark,
  delta,
  sparkStroke = "#1D6FE0",
  sparkFill = "rgba(29,111,224,0.10)",
}: {
  label: string;
  value: string;
  spark?: number[];
  delta?: number;
  sparkStroke?: string;
  sparkFill?: string;
}) {
  const up = typeof delta === "number" && delta > 0;
  const down = typeof delta === "number" && delta < 0;
  return (
    <div className="border-ib-line p-5 [&:not(:first-child)]:sm:border-l">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">
          {label}
        </p>
        {typeof delta === "number" ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
              up
                ? "bg-ib-success/12 text-[#15803D]"
                : down
                  ? "bg-ib-danger/10 text-ib-danger"
                  : "bg-slate-100 text-ib-slate"
            }`}
          >
            {up ? "▲" : down ? "▼" : "•"} {Math.abs(delta)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-mono text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ib-ink">
        {value}
      </p>
      {spark ? (
        <div className="mt-3">
          <Sparkline data={spark} stroke={sparkStroke} fill={sparkFill} className="h-8 w-full" />
        </div>
      ) : null}
    </div>
  );
}

/* Small horizontal score meter (0..100) */
export function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const tone = pct >= 70 ? "bg-ib-success" : pct >= 40 ? "bg-ib-selo" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ib-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-ib-slate">{pct}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton — subtle shimmer placeholders while data settles           */
/* ------------------------------------------------------------------ */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded bg-ib-line/60 ${className}`}
    />
  );
}

/* Table-shaped skeleton: a header bar plus `rows` × `cols` cells.
   Drop inside <Card className="overflow-hidden">. */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = ["flex-[1.6]", "flex-1", "flex-1", "flex-[0.8]", "flex-1", "flex-[0.9]"];
  return (
    <div role="status" aria-label="Carregando" className="overflow-hidden">
      <div className="flex gap-4 border-b border-ib-line bg-ib-papel/70 px-5 py-3.5">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={`h-3 ${widths[c % widths.length]}`} />
        ))}
      </div>
      <div className="divide-y divide-ib-line/70">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-5 py-[1.15rem]">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-3.5 ${widths[c % widths.length]}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Generic card skeleton: a title line and a few body lines. */
export function SkeletonCard({
  className = "",
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  const bodyWidths = ["w-full", "w-11/12", "w-4/5", "w-3/5", "w-2/3"];
  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${bodyWidths[i % bodyWidths.length]}`} />
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState — purposeful onboarding, never a lonely circle           */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  text,
  action,
  variant = "rows",
}: {
  title: string;
  text: string;
  action?: ReactNode;
  variant?: "rows" | "grid";
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_minmax(0,320px)] sm:p-8">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ib-selo">
            Pronto para começar
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-ib-ink">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ib-slate">{text}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
        {/* Brand-built illustrative element: a skeleton preview of the data to come */}
        <div className="relative hidden sm:block" aria-hidden="true">
          {variant === "grid" ? (
            <div className="grid h-full grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-dashed border-ib-line bg-ib-papel/60 p-3"
                >
                  <div className="h-2 w-10 rounded-full bg-ib-line" />
                  <div className="mt-2 h-3 w-16 rounded-full bg-ib-bruma" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[0.9, 0.7, 0.55].map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-ib-line bg-ib-papel/60 px-3 py-2.5"
                >
                  <div className="h-6 w-6 shrink-0 rounded-full bg-ib-bruma" />
                  <div className="h-2 rounded-full bg-ib-line" style={{ width: `${w * 100}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-ib-mar px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-ib-line bg-white px-4 py-2.5 text-sm font-semibold text-ib-ink transition hover:border-ib-mar/40 hover:bg-ib-bruma focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar";

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total?: number;
}) {
  if (pageCount <= 1) {
    return total !== undefined ? (
      <div className="flex items-center px-5 py-3">
        <span className="font-mono text-xs tabular-nums text-ib-slate">
          {total} {total === 1 ? "registro" : "registros"}
        </span>
      </div>
    ) : null;
  }
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      {total !== undefined ? (
        <span className="font-mono text-xs tabular-nums text-ib-slate">
          {total} registros · pág. {page}/{pageCount}
        </span>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-ib-line px-3 py-1.5 text-sm text-ib-ink transition hover:bg-ib-papel disabled:cursor-not-allowed disabled:opacity-40"
        >
          Anterior
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`min-w-[2.25rem] rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums transition ${
              p === page
                ? "bg-ib-mar text-white"
                : "border border-ib-line text-ib-ink hover:bg-ib-papel"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="rounded-lg border border-ib-line px-3 py-1.5 text-sm text-ib-ink transition hover:bg-ib-papel disabled:cursor-not-allowed disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline SVG icons                                                    */
/* ------------------------------------------------------------------ */

export type IconName =
  | "home"
  | "chat"
  | "users"
  | "doc"
  | "calc"
  | "gear"
  | "external"
  | "pulse"
  | "agent"
  | "activity"
  | "book"
  | "search"
  | "plus"
  | "trash"
  | "check"
  | "bolt"
  | "arrow"
  | "mail"
  | "shield"
  | "logout"
  | "plug";

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" />
          <circle cx="10" cy="8" r="3.2" />
          <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
          <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case "calc":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4" />
        </svg>
      );
    case "gear":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      );
    case "external":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14 4h6v6" />
          <path d="M20 4 10 14" />
          <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case "agent":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3v3" />
          <rect x="4" y="6" width="16" height="12" rx="3" />
          <circle cx="9" cy="12" r="1.3" />
          <circle cx="15" cy="12" r="1.3" />
          <path d="M2 11v3M22 11v3" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 12h3.5l2-7 4 15 2.5-8H21" />
        </svg>
      );
    case "book":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
          <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" />
          <path d="M9 8h7M9 11h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        </svg>
      );
    case "check":
      return (
        <svg {...common} aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6Z" />
          <path d="m9.5 12 1.8 1.8 3.4-3.6" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l-5-5 5-5" />
          <path d="M15 12H5" />
        </svg>
      );
    case "plug":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 22v-5" />
          <path d="M9 8V2M15 8V2" />
          <path d="M18 8H6v3a6 6 0 0 0 12 0Z" />
        </svg>
      );
    default:
      return null;
  }
}
