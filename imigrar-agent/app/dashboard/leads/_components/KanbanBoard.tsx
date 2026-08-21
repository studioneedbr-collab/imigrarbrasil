"use client";

import { useRef, useState } from "react";
import { BRL, Icon } from "@/components/dashboard/ui";
import type { LeadStage } from "@/lib/domain/types";
import { STAGES, serviceBadgeClass, urgencyMeta, leadName, type ScoredLead } from "./types";
import { scoreTone, timeAgo } from "./utils";

const COLUMN_LIMIT = 20;

export function KanbanBoard({
  leads,
  onMove,
  onOpen,
  onDelete,
}: {
  leads: ScoredLead[];
  onMove: (l: ScoredLead, s: LeadStage) => void;
  onOpen: (l: ScoredLead) => void;
  onDelete?: (l: ScoredLead) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);

  const byStage: Record<LeadStage, ScoredLead[]> = {
    novo: [], qualificado: [], orcado: [], transferido: [], ganho: [], perdido: [], desqualificado: [],
  };
  for (const l of leads) (byStage[l.stage] ?? byStage.novo).push(l);
  for (const k of Object.keys(byStage) as LeadStage[]) byStage[k].sort((a, b) => b.score - a.score);

  function handleDrop(e: React.DragEvent<HTMLElement>, stage: LeadStage) {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (lead && lead.stage !== stage) onMove(lead, stage);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {STAGES.map((col) => {
        const items = byStage[col.key];
        const sum = items.reduce((acc, l) => acc + (l.estimatedValue ?? 0), 0);
        const isOpen = expanded[col.key];
        const shown = isOpen ? items : items.slice(0, COLUMN_LIMIT);
        const isDragOver = dragOverStage === col.key;
        return (
          <section
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggingId) setDragOverStage(col.key);
            }}
            onDragLeave={() => setDragOverStage((prev) => (prev === col.key ? null : prev))}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`flex w-[300px] shrink-0 flex-col rounded-xl bg-ib-papel/60 ring-1 ring-inset ring-ib-line transition ${
              isDragOver ? "ring-2 ring-ib-mar/40 bg-ib-bruma/40" : ""
            }`}
          >
            <header className="px-3.5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <span className="text-sm font-semibold text-ib-ink">{col.label}</span>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ib-slate ring-1 ring-inset ring-ib-line">
                  {items.length}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-ib-slate">
                {sum > 0 ? BRL(sum) : "—"}
              </p>
            </header>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-3" style={{ maxHeight: "68vh" }}>
              {items.length === 0 ? (
                <div className="px-1 py-4">
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-ib-line bg-white/60 py-6 text-center">
                    <Icon name="users" className="h-5 w-5 text-ib-slate/60" />
                    <p className="text-xs text-ib-slate">Nenhum lead nesta etapa</p>
                  </div>
                </div>
              ) : (
                shown.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onMove={onMove}
                    onOpen={onOpen}
                    onDelete={onDelete}
                    isDragging={draggingId === lead.id}
                    onDragStart={(id) => setDraggingId(id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStage(null);
                    }}
                  />
                ))
              )}
              {!isOpen && items.length > COLUMN_LIMIT && (
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [col.key]: true }))}
                  className="w-full rounded-lg border border-dashed border-ib-line py-2 text-xs font-medium text-ib-mar hover:bg-white"
                >
                  Ver mais {items.length - COLUMN_LIMIT}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LeadCard({
  lead,
  onMove,
  onOpen,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead: ScoredLead;
  onMove: (l: ScoredLead, s: LeadStage) => void;
  onOpen: (l: ScoredLead) => void;
  onDelete?: (l: ScoredLead) => void;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const tone = scoreTone(lead.score);
  const title = leadName(lead);
  const isNoName = !lead.contactName && !lead.companyName;
  const service = lead.servicesInterested?.[0];
  const urgency = urgencyMeta(lead.urgency ?? undefined);
  const didDragRef = useRef(false);

  return (
    <article
      draggable
      onDragStart={(e) => {
        didDragRef.current = true;
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead.id);
      }}
      onDragEnd={() => {
        onDragEnd();
        // allow the click handler (fired right after dragend in some browsers) to see the flag
        setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      }}
      className={`rounded-lg border border-ib-line bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (didDragRef.current) return;
          onOpen(lead);
        }}
        className="block w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${isNoName ? "text-ib-slate" : "text-ib-ink"}`}>
            {title}
          </span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone.chip}`}
            title={
              lead.scoreBreakdown
                ? `Engajamento ${lead.scoreBreakdown.engajamento} · Responsividade ${lead.scoreBreakdown.responsividade} · Velocidade ${lead.scoreBreakdown.velocidade} · Interesse ${lead.scoreBreakdown.interesse}`
                : `Lead score ${lead.score}`
            }
          >
            {lead.score}
          </span>
        </div>

        {lead.companyName && lead.contactName ? (
          <p className="mt-0.5 truncate text-xs text-ib-slate">{lead.companyName}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {service ? (
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${serviceBadgeClass(service)}`}>
              {service}
              {lead.employeesNeeded ? ` · ${lead.employeesNeeded}` : ""}
            </span>
          ) : null}
          {urgency ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-ib-slate" title={urgency.label}>
              <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
              {urgency.label}
            </span>
          ) : null}
        </div>
      </button>

      <div className="mt-2.5 flex items-center justify-between border-t border-ib-line pt-2">
        <span className="flex items-center gap-2 text-[11px] text-ib-slate">
          <span className="inline-flex items-center gap-1">
            <Icon name="chat" className="h-3.5 w-3.5" />
            {lead.messageCount ?? 0}
          </span>
          {lead.lastActivityAt ? <span>· {timeAgo(lead.lastActivityAt)}</span> : null}
        </span>
        <div className="flex items-center gap-1.5">
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(lead);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Excluir lead"
              title="Excluir lead"
              className="inline-flex items-center justify-center rounded-md border border-ib-line bg-white p-1 text-ib-slate transition hover:border-ib-danger/30 hover:bg-ib-danger/5 hover:text-ib-danger"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <select
            value={lead.stage}
            onChange={(e) => onMove(lead, e.target.value as LeadStage)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
            draggable={false}
            aria-label="Mover etapa"
            className="max-w-[7.5rem] rounded-md border border-ib-line bg-white px-1.5 py-1 text-[11px] font-medium text-ib-ink outline-none focus:border-ib-mar"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}
