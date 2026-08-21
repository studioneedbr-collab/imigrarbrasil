"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { BRL, Icon, btnGhost, btnPrimary, fmtDate } from "@/components/dashboard/ui";
import type { Proposal, Urgency } from "@/lib/domain/types";
import { serviceBadgeClass, stageMeta, urgencyMeta, URGENCIES, leadName, type ScoredLead } from "./types";
import { digitsOf, formatWhatsapp, scoreTone, timeAgo } from "./utils";

export function LeadDrawer({ lead, onClose }: { lead: ScoredLead | null; onClose: () => void }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [currentLead, setCurrentLead] = useState<ScoredLead | null>(lead);

  useEffect(() => {
    setCurrentLead(lead);
  }, [lead]);

  useEffect(() => {
    if (!lead) {
      setProposals(null);
      return;
    }
    let cancelled = false;
    setProposals(null);
    fetch("/api/proposals", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { proposals: [] }))
      .then((data) => {
        if (cancelled) return;
        const all: Proposal[] = data.proposals ?? [];
        setProposals(all.filter((p) => p.conversationId === lead.conversationId));
      })
      .catch(() => !cancelled && setProposals([]));
    return () => {
      cancelled = true;
    };
  }, [lead]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (lead) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [lead, onClose]);

  const open = lead !== null;

  return (
    <div
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ib-ink/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhe do lead"
        className={`absolute right-0 top-0 h-full w-full max-w-md transform overflow-y-auto bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {currentLead ? (
          <DrawerContent
            lead={currentLead}
            proposals={proposals}
            onClose={onClose}
            onUpdated={setCurrentLead}
          />
        ) : null}
      </aside>
    </div>
  );
}

interface EditForm {
  contactName: string;
  companyName: string;
  email: string;
  servicesInterested: string;
  employeesNeeded: string;
  region: string;
  schedule: string;
  urgency: Urgency | "";
  estimatedValue: string;
  notes: string;
}

function leadToForm(lead: ScoredLead): EditForm {
  return {
    contactName: lead.contactName ?? "",
    companyName: lead.companyName ?? "",
    email: lead.email ?? "",
    servicesInterested: lead.servicesInterested?.length ? lead.servicesInterested.join(", ") : "",
    employeesNeeded: lead.employeesNeeded != null ? String(lead.employeesNeeded) : "",
    region: lead.region ?? "",
    schedule: lead.schedule ?? "",
    urgency: lead.urgency ?? "",
    estimatedValue: lead.estimatedValue != null ? String(lead.estimatedValue) : "",
    notes: lead.notes ?? "",
  };
}

function DrawerContent({
  lead,
  proposals,
  onClose,
  onUpdated,
}: {
  lead: ScoredLead;
  proposals: Proposal[] | null;
  onClose: () => void;
  onUpdated: (lead: ScoredLead) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => leadToForm(lead));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setForm(leadToForm(lead));
  }, [lead, editing]);

  const tone = scoreTone(lead.score);
  const stage = stageMeta(lead.stage);
  const urgency = urgencyMeta(lead.urgency ?? undefined);
  const title = leadName(lead);
  const waDigits = digitsOf(lead.whatsappNumber);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        conversationId: lead.conversationId,
        contactName: form.contactName.trim(),
        companyName: form.companyName.trim(),
        email: form.email.trim(),
        servicesInterested: form.servicesInterested
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        region: form.region.trim(),
        schedule: form.schedule.trim(),
        notes: form.notes.trim(),
      };
      if (form.urgency) body.urgency = form.urgency;
      if (form.employeesNeeded.trim()) {
        const n = Number(form.employeesNeeded);
        if (!Number.isNaN(n)) body.employeesNeeded = n;
      }
      if (form.estimatedValue.trim()) {
        const n = Number(form.estimatedValue);
        if (!Number.isNaN(n)) body.estimatedValue = n;
      }

      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save_failed");
      const data = await res.json();
      onUpdated({ ...lead, ...data.lead });
      setEditing(false);
    } catch {
      setSaveError("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function changeSetor(setor: string) {
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: lead.conversationId, setor }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdated({ ...lead, ...data.lead });
      }
    } catch {
      /* ignora */
    }
  }

  const timeline = [
    { label: "Lead criado", at: lead.createdAt },
    { label: "Última atividade", at: lead.lastActivityAt },
    { label: `Etapa atual: ${stage.label}`, at: lead.updatedAt },
  ].filter((t) => Boolean(t.at)) as { label: string; at: string }[];
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-ib-line px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ib-selo">Lead</p>
          <h2 className="mt-1 truncate text-lg font-semibold text-ib-ink">{title}</h2>
          {lead.companyName && lead.contactName ? (
            <p className="mt-0.5 truncate text-sm text-ib-slate">{lead.companyName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded-lg border border-ib-line p-1.5 text-ib-slate transition hover:border-ib-mar/40 hover:text-ib-mar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="flex-1 space-y-6 px-5 py-5">
        {/* Score + stage */}
        <section className="flex items-center gap-3">
          <span className={`rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums ${tone.chip}`}>
            {lead.score} · {tone.label}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-ib-papel px-2.5 py-1.5 text-sm font-semibold">
            <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
            <span className={stage.head}>{stage.label}</span>
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ib-slate">
            Pipeline:
            <select
              value={lead.setor ?? "comercial"}
              onChange={(e) => changeSetor(e.target.value)}
              className="rounded-lg border border-ib-line bg-white px-2 py-1 text-xs font-medium text-ib-ink outline-none focus:border-ib-mar"
              title="Mover o lead para outra pipeline"
            >
              <option value="comercial">Comercial</option>
              <option value="operacional">Operacional</option>
              <option value="rh">RH</option>
              <option value="departamento_pessoal">Depto. Pessoal</option>
              <option value="suprimentos">Suprimentos</option>
              <option value="diretoria">Diretoria</option>
            </select>
          </label>
        </section>

        {lead.scoreBreakdown ? (
          <section className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ["Engajamento", lead.scoreBreakdown.engajamento],
                ["Responsividade", lead.scoreBreakdown.responsividade],
                ["Velocidade", lead.scoreBreakdown.velocidade],
                ["Interesse", lead.scoreBreakdown.interesse],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-ib-papel px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ib-slate">{label}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ib-ink">{value}</p>
              </div>
            ))}
          </section>
        ) : null}

        {/* Dados do lead */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Dados do lead</SectionLabel>
            {!editing ? (
              <button
                type="button"
                onClick={() => {
                  setForm(leadToForm(lead));
                  setSaveError(null);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ib-mar hover:underline"
              >
                <Icon name="doc" className="h-3.5 w-3.5" />
                Editar
              </button>
            ) : null}
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="mt-2 space-y-2.5">
              <EditField label="Nome do contato">
                <input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Empresa">
                <input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="E-mail">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Serviços de interesse (separados por vírgula)">
                <input
                  value={form.servicesInterested}
                  onChange={(e) => setForm({ ...form, servicesInterested: e.target.value })}
                  placeholder="Ex.: Portaria, Limpeza"
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Funcionários necessários">
                <input
                  type="number"
                  min={0}
                  value={form.employeesNeeded}
                  onChange={(e) => setForm({ ...form, employeesNeeded: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Região">
                <input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Escala">
                <input
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Urgência">
                <select
                  value={form.urgency}
                  onChange={(e) => setForm({ ...form, urgency: e.target.value as Urgency | "" })}
                  className={editInputCls}
                >
                  <option value="">—</option>
                  {URGENCIES.map((u) => (
                    <option key={u.key} value={u.key}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </EditField>
              <EditField label="Estimativa (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.estimatedValue}
                  onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
                  className={editInputCls}
                />
              </EditField>
              <EditField label="Notas">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className={editInputCls}
                />
              </EditField>

              {saveError ? <p className="text-xs text-ib-danger">{saveError}</p> : null}

              <div className="flex items-center gap-2 pt-1">
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={saving}
                  onClick={() => {
                    setForm(leadToForm(lead));
                    setSaveError(null);
                    setEditing(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
              <Field label="Telefone / WhatsApp" value={formatWhatsapp(lead.whatsappNumber)} />
              <Field label="Email" value={lead.email ?? undefined} />
              <Field
                label="Serviços de interesse"
                value={lead.servicesInterested?.length ? lead.servicesInterested.join(", ") : undefined}
                badge={lead.servicesInterested?.[0] ? serviceBadgeClass(lead.servicesInterested[0]) : undefined}
              />
              <Field label="Funcionários necessários" value={lead.employeesNeeded ? String(lead.employeesNeeded) : undefined} />
              <Field label="Região" value={lead.region ?? undefined} />
              <Field label="Escala" value={lead.schedule ?? undefined} />
              <Field
                label="Urgência"
                value={urgency?.label}
                dot={urgency?.dot}
              />
              <Field label="Estimativa" value={lead.estimatedValue ? BRL(lead.estimatedValue) : undefined} />
              <Field label="Notas" value={lead.notes ?? undefined} />
            </dl>
          )}
        </section>

        {/* Histórico de mensagens (resumo) */}
        <section>
          <SectionLabel>Conversa</SectionLabel>
          <div className="mt-2 flex items-center gap-4 rounded-lg bg-ib-papel px-3 py-2.5 text-sm text-ib-ink">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="chat" className="h-4 w-4 text-ib-slate" />
              {lead.messageCount ?? 0} mensagens
            </span>
            {lead.lastActivityAt ? (
              <span className="text-ib-slate">última em {timeAgo(lead.lastActivityAt)}</span>
            ) : null}
          </div>
        </section>

        {/* Timeline */}
        <section>
          <SectionLabel>Linha do tempo</SectionLabel>
          <ol className="mt-2 space-y-3 border-l border-ib-line pl-4">
            {timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.11rem] top-1 h-2 w-2 rounded-full bg-ib-mar" />
                <p className="text-sm font-medium text-ib-ink">{t.label}</p>
                <p className="text-xs text-ib-slate">{fmtDate(t.at)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Propostas */}
        <section>
          <SectionLabel>Propostas enviadas</SectionLabel>
          {proposals === null ? (
            <p className="mt-2 text-sm text-ib-slate">Carregando…</p>
          ) : proposals.length === 0 ? (
            <p className="mt-2 text-sm text-ib-slate">Nenhuma proposta enviada para este lead.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {proposals.map((p) => (
                <li key={p.id} className="rounded-lg border border-ib-line px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ib-ink">
                      {p.services.map((s) => s.name).join(", ") || "Proposta"}
                    </p>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ib-ink">
                      {BRL(p.totalValue)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ib-slate">{fmtDate(p.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="space-y-2 border-t border-ib-line px-5 py-4">
        <Link
          href={`/dashboard/conversations/${lead.conversationId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-ib-mar px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo"
        >
          <Icon name="chat" className="h-4 w-4" />
          Ver conversa completa
        </Link>
        {waDigits ? (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-ib-line px-4 py-2.5 text-sm font-semibold text-ib-ink transition hover:border-ib-success/40 hover:bg-ib-success/10"
          >
            <Icon name="external" className="h-4 w-4" />
            Abrir WhatsApp
          </a>
        ) : null}
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">{children}</p>
  );
}

function Field({
  label,
  value,
  dot,
  badge,
}: {
  label: string;
  value?: string;
  dot?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ib-line/70 pb-1.5 last:border-0">
      <dt className="text-xs text-ib-slate">{label}</dt>
      <dd className="text-right text-sm text-ib-ink">
        {value ? (
          badge ? (
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${badge}`}>{value}</span>
          ) : dot ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {value}
            </span>
          ) : (
            value
          )
        ) : (
          <span className="text-ib-slate">—</span>
        )}
      </dd>
    </div>
  );
}

const editInputCls =
  "mt-1 w-full rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10";

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ib-slate">{label}</span>
      {children}
    </label>
  );
}
