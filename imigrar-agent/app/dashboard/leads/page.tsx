"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/dashboard/ui";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import type { LeadStage, LeadSetor } from "@/lib/domain/types";

const SETORES: { key: LeadSetor; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "operacional", label: "Operacional" },
  { key: "rh", label: "RH" },
  { key: "departamento_pessoal", label: "Depto. Pessoal" },
  { key: "suprimentos", label: "Suprimentos" },
  { key: "diretoria", label: "Diretoria" },
];
import { EMPTY_FILTERS, FilterBar, hasActiveFilters, type Filters } from "./_components/FilterBar";
import { KanbanBoard } from "./_components/KanbanBoard";
import { LeadDrawer } from "./_components/LeadDrawer";
import { LeadsTable } from "./_components/LeadsTable";
import { SERVICE_CATEGORIES, type ScoredLead, type ViewMode } from "./_components/types";

export default function LeadsPage() {
  const [leads, setLeads] = useState<ScoredLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [activeLead, setActiveLead] = useState<ScoredLead | null>(null);
  const [setor, setSetor] = useState<LeadSetor>("comercial");
  const [me, setMe] = useState<{ role: string; setor: LeadSetor | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScoredLead | null>(null);

  // Controle de acesso por setor: usuário não-admin fica restrito à pipeline do seu setor.
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role: string; setor: LeadSetor | null } | null) => {
        setMe(d);
        if (d && d.role !== "admin" && d.setor) setSetor(d.setor);
      })
      .catch(() => setMe(null));
  }, []);
  const restrito = !!(me && me.role !== "admin" && me.setor);
  const setoresVisiveis = restrito ? SETORES.filter((s) => s.key === me!.setor) : SETORES;
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    const l = pendingDelete;
    if (!l) return;
    setDeleting(true);
    const snapshot = leads;
    setLeads((prev) => (prev ? prev.filter((x) => x.id !== l.id) : prev));
    if (activeLead?.id === l.id) setActiveLead(null);
    try {
      const res = await fetch(`/api/leads?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPendingDelete(null);
    } catch {
      setLeads(snapshot);
      setError("Não foi possível excluir o lead.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setLeads((await res.json()).leads ?? []);
      setError(null);
    } catch {
      setLeads([]);
      setError("Não foi possível carregar os leads.");
    }
  }

  // Atualização silenciosa (interval) — não limpa a lista se falhar.
  async function refresh() {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (res.ok) setLeads((await res.json()).leads ?? []);
    } catch {
      /* mantém os dados atuais */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20000);
    return () => clearInterval(t);
  }, []);

  async function move(lead: ScoredLead, stage: LeadStage) {
    setLeads((prev) => (prev ? prev.map((l) => (l.id === lead.id ? { ...l, stage } : l)) : prev));
    setActiveLead((prev) => (prev && prev.id === lead.id ? { ...prev, stage } : prev));
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: lead.conversationId, stage }),
    }).catch(() => load());
  }

  const filtered = useMemo(() => {
    const list = leads ?? [];
    const q = filters.query.trim().toLowerCase();
    return list.filter((l) => {
      // Pipeline por setor: leads sem setor caem no Comercial (padrão).
      if ((l.setor || "comercial") !== setor) return false;
      if (q) {
        const haystack = [
          l.contactName,
          l.companyName,
          l.region,
          l.whatsappNumber,
          l.email,
          ...(l.servicesInterested ?? []),
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        if (!haystack.some((v) => v.includes(q))) return false;
      }

      if (filters.stages.length > 0 && !filters.stages.includes(l.stage)) return false;

      if (filters.service) {
        const cat = SERVICE_CATEGORIES.find((c) => c.key === filters.service);
        const services = (l.servicesInterested ?? []).map((s) => s.toLowerCase());
        const matches = cat ? services.some((s) => cat.match.some((m) => s.includes(m))) : false;
        if (!matches) return false;
      }

      if (filters.urgency && l.urgency !== filters.urgency) return false;

      if (filters.dateStart || filters.dateEnd) {
        const created = new Date(l.createdAt).getTime();
        if (filters.dateStart && created < filters.dateStart.getTime()) return false;
        if (filters.dateEnd && created > filters.dateEnd.getTime()) return false;
      }

      return true;
    });
  }, [leads, filters, setor]);

  // Contagem por setor (para os badges das abas de pipeline).
  const countBySetor = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads ?? []) {
      const s = l.setor || "comercial";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [leads]);

  const sortedByScore = useMemo(() => [...filtered].sort((a, b) => b.score - a.score), [filtered]);

  const total = leads?.length ?? 0;
  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline comercial"
        title="Leads"
        description={`${total} lead${total === 1 ? "" : "s"} no total. Filtre, acompanhe o pipeline e mova de etapa em um clique.`}
        actions={
          <div className="relative inline-flex rounded-lg border border-ib-line bg-white p-0.5">
            {/* pílula deslizante */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0.5 left-0.5 w-[86px] rounded-md bg-ib-casa shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ transform: view === "kanban" ? "translateX(0)" : "translateX(86px)" }}
            />
            <button
              type="button"
              onClick={() => setView("kanban")}
              aria-pressed={view === "kanban"}
              className={`relative z-10 w-[86px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                view === "kanban" ? "text-white" : "text-ib-slate hover:text-ib-ink"
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setView("lista")}
              aria-pressed={view === "lista"}
              className={`relative z-10 w-[86px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                view === "lista" ? "text-white" : "text-ib-slate hover:text-ib-ink"
              }`}
            >
              Lista
            </button>
          </div>
        }
      />

      {/* Pipelines por setor — cada setor tem seu próprio CRM */}
      <div className="flex flex-wrap gap-2">
        {setoresVisiveis.map((s) => {
          const activeTab = setor === s.key;
          const n = countBySetor[s.key] ?? 0;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSetor(s.key)}
              aria-pressed={activeTab}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                activeTab
                  ? "border-ib-casa bg-ib-casa text-white shadow-sm"
                  : "border-ib-line bg-white text-ib-slate hover:border-ib-mar/30 hover:text-ib-ink"
              }`}
            >
              {s.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  activeTab ? "bg-white/20 text-white" : "bg-ib-papel text-ib-slate"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {leads === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title={error ?? "Nenhum lead ainda"}
            text={
              error
                ? "Recarregue a página para tentar novamente."
                : "Assim que o agente qualificar um contato, ele aparece aqui no pipeline."
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="Nenhum lead encontrado"
            text={active ? "Ajuste ou limpe os filtros para ver outros leads." : "Ajuste a busca para ver outros leads."}
            action={
              active ? (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="inline-flex items-center gap-2 rounded-xl bg-ib-mar px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ib-carimbo"
                >
                  Limpar filtros
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "lista" ? (
        <LeadsTable leads={sortedByScore} onMove={move} onOpen={setActiveLead} />
      ) : (
        <KanbanBoard leads={filtered} onMove={move} onOpen={setActiveLead} onDelete={setPendingDelete} />
      )}

      <LeadDrawer lead={activeLead} onClose={() => setActiveLead(null)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        loading={deleting}
        title="Excluir lead"
        message={
          pendingDelete ? (
            <>
              O lead de{" "}
              <span className="font-semibold">
                {pendingDelete.contactName || pendingDelete.companyName || pendingDelete.whatsappNumber}
              </span>{" "}
              sai do CRM. A conversa no WhatsApp não é apagada. Esta ação não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir lead"
        onConfirm={doDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
