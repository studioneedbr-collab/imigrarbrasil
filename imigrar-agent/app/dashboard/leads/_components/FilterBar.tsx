"use client";

import type { ReactNode } from "react";
import type { LeadStage } from "@/lib/domain/types";
import { Icon } from "@/components/dashboard/ui";
import { DateRangeFilter } from "./DateRangeFilter";
import { SERVICE_CATEGORIES, STAGES, URGENCIES, type UrgencyMeta } from "./types";

export interface Filters {
  query: string;
  stages: LeadStage[];
  service: string | null; // SERVICE_CATEGORIES key, or null = todos
  urgency: UrgencyMeta["key"] | null;
  dateStart: Date | null;
  dateEnd: Date | null;
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  stages: [],
  service: null,
  urgency: null,
  dateStart: null,
  dateEnd: null,
};

export function hasActiveFilters(f: Filters): boolean {
  return (
    f.query.trim() !== "" ||
    f.stages.length > 0 ||
    f.service !== null ||
    f.urgency !== null ||
    f.dateStart !== null ||
    f.dateEnd !== null
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-ib-casa text-white shadow-sm"
          : "bg-ib-papel text-ib-slate hover:bg-ib-bruma hover:text-ib-mar"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  function toggleStage(stage: LeadStage) {
    const has = filters.stages.includes(stage);
    onChange({
      ...filters,
      stages: has ? filters.stages.filter((s) => s !== stage) : [...filters.stages, stage],
    });
  }

  return (
    <div className="rounded-2xl border border-ib-line bg-white p-3.5 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ib-slate"
            />
            <input
              value={filters.query}
              onChange={(e) => onChange({ ...filters, query: e.target.value })}
              placeholder="Buscar por nome, empresa, serviço, telefone…"
              className="w-full rounded-lg border border-ib-line bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10"
            />
          </div>

          <DateRangeFilter
            start={filters.dateStart}
            end={filters.dateEnd}
            onApply={(dateStart, dateEnd) => onChange({ ...filters, dateStart, dateEnd })}
          />

          {hasActiveFilters(filters) ? (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ib-line px-2.5 py-2 text-xs font-semibold text-ib-slate transition hover:border-ib-danger/40 hover:text-ib-danger"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate/80">Etapa</span>
            {STAGES.map((s) => (
              <Chip key={s.key} active={filters.stages.includes(s.key)} onClick={() => toggleStage(s.key)}>
                {s.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate/80">Serviço</span>
            <Chip active={filters.service === null} onClick={() => onChange({ ...filters, service: null })}>
              Todos
            </Chip>
            {SERVICE_CATEGORIES.map((c) => (
              <Chip
                key={c.key}
                active={filters.service === c.key}
                onClick={() => onChange({ ...filters, service: filters.service === c.key ? null : c.key })}
              >
                {c.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate/80">Urgência</span>
            {URGENCIES.map((u) => (
              <Chip
                key={u.key}
                active={filters.urgency === u.key}
                onClick={() => onChange({ ...filters, urgency: filters.urgency === u.key ? null : u.key })}
              >
                {u.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
