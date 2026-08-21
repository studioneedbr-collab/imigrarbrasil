"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRL, Card, Icon, Pagination } from "@/components/dashboard/ui";
import type { LeadStage } from "@/lib/domain/types";
import { STAGES, serviceBadgeClass, stageMeta, urgencyMeta, leadName, type ScoredLead } from "./types";
import { digitsOf, scoreTone, timeAgo } from "./utils";

type SortKey = "score" | "lastActivityAt";
type SortDir = "asc" | "desc";

export function LeadsTable({
  leads,
  onMove,
  onOpen,
}: {
  leads: ScoredLead[];
  onMove: (l: ScoredLead, s: LeadStage) => void;
  onOpen: (l: ScoredLead) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const list = [...leads];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "score") cmp = a.score - b.score;
      else {
        const av = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const bv = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [leads, sortKey, sortDir]);

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) {
    const active = sortKey === sortKeyName;
    return (
      <th className="px-4 py-3 font-semibold">
        <button
          type="button"
          onClick={() => toggleSort(sortKeyName)}
          className={`inline-flex items-center gap-1 transition ${active ? "text-ib-mar" : "hover:text-ib-ink"}`}
        >
          {label}
          <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
        </button>
      </th>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-ib-line bg-ib-papel/60 text-xs uppercase tracking-wide text-ib-slate">
              <th className="px-4 py-3 font-semibold">Nome / Empresa</th>
              <th className="px-4 py-3 font-semibold">Serviço</th>
              <SortHeader label="Score" sortKeyName="score" />
              <th className="px-4 py-3 font-semibold">Urgência</th>
              <th className="px-4 py-3 font-semibold">Estimativa</th>
              <SortHeader label="Último contato" sortKeyName="lastActivityAt" />
              <th className="px-4 py-3 font-semibold">Stage</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((lead) => {
              const tone = scoreTone(lead.score);
              const stage = stageMeta(lead.stage);
              const title = leadName(lead);
              const isNoName = !lead.contactName && !lead.companyName;
              const service = lead.servicesInterested?.[0];
              const urgency = urgencyMeta(lead.urgency ?? undefined);
              const waDigits = digitsOf(lead.whatsappNumber);
              return (
                <tr key={lead.id} className="border-b border-ib-line last:border-0 hover:bg-ib-papel/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(lead)}
                      className={`text-left font-semibold hover:text-ib-mar ${isNoName ? "text-ib-slate" : "text-ib-ink"}`}
                    >
                      {title}
                    </button>
                    {lead.companyName && lead.contactName ? (
                      <p className="mt-0.5 truncate text-xs text-ib-slate">{lead.companyName}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ib-ink">
                    {service ? (
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${serviceBadgeClass(service)}`}>
                        {service}
                        {lead.employeesNeeded ? ` · ${lead.employeesNeeded}` : ""}
                      </span>
                    ) : (
                      <span className="text-ib-slate">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone.chip}`}
                      title={tone.label}
                    >
                      {lead.score}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {urgency ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ib-slate">
                        <span className={`h-2 w-2 rounded-full ${urgency.dot}`} />
                        {urgency.label}
                      </span>
                    ) : (
                      <span className="text-ib-slate">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-ib-ink">
                    {lead.estimatedValue ? BRL(lead.estimatedValue) : "—"}
                  </td>
                  <td className="px-4 py-3 text-ib-slate">{timeAgo(lead.lastActivityAt) || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                      <span className={`text-xs font-semibold ${stage.head}`}>{stage.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/dashboard/conversations/${lead.conversationId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-ib-line px-1.5 py-1 text-[11px] font-medium text-ib-ink hover:border-ib-mar/40 hover:bg-ib-bruma"
                        title="Ver conversa"
                      >
                        <Icon name="chat" className="h-3.5 w-3.5" />
                      </Link>
                      {waDigits ? (
                        <a
                          href={`https://wa.me/${waDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-ib-line px-1.5 py-1 text-[11px] font-medium text-ib-success hover:border-ib-success/40 hover:bg-ib-success/10"
                          title="Abrir WhatsApp"
                        >
                          <Icon name="external" className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-ib-line px-1.5 py-1 text-[11px] font-medium text-ib-slate/50"
                          title="WhatsApp indisponível"
                        >
                          <Icon name="external" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <select
                        value={lead.stage}
                        onChange={(e) => onMove(lead, e.target.value as LeadStage)}
                        aria-label="Mudar stage"
                        className="max-w-[8.5rem] rounded-md border border-ib-line bg-white px-1.5 py-1 text-[11px] font-medium text-ib-ink outline-none focus:border-ib-mar"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ib-line">
        <Pagination page={current} pageCount={pageCount} onPage={setPage} total={sorted.length} />
      </div>
    </Card>
  );
}
