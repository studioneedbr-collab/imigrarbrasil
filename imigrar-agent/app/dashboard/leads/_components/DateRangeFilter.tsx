"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/ui";
import {
  endOfDay,
  formatDDMMYYYY,
  isSameDay,
  maskDateInput,
  parseDDMMYYYY,
  startOfDay,
} from "./utils";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface DateRange {
  start: Date | null;
  end: Date | null;
}

export function DateRangeFilter({
  start,
  end,
  onApply,
}: {
  start: Date | null;
  end: Date | null;
  onApply: (start: Date | null, end: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startText, setStartText] = useState(start ? formatDDMMYYYY(start) : "");
  const [endText, setEndText] = useState(end ? formatDDMMYYYY(end) : "");
  const [picking, setPicking] = useState<DateRange>({ start, end });
  const [viewMonth, setViewMonth] = useState<Date>(start ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStartText(start ? formatDDMMYYYY(start) : "");
    setEndText(end ? formatDDMMYYYY(end) : "");
    setPicking({ start, end });
  }, [start, end]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  function commitText(which: "start" | "end", raw: string) {
    const masked = maskDateInput(raw);
    if (which === "start") setStartText(masked);
    else setEndText(masked);
    if (masked.length === 10) {
      const d = parseDDMMYYYY(masked);
      if (d) {
        if (which === "start") onApply(startOfDay(d), end);
        else onApply(start, endOfDay(d));
      }
    }
  }

  function pickDay(day: Date) {
    setPicking((prev) => {
      if (!prev.start || (prev.start && prev.end)) {
        return { start: day, end: null };
      }
      if (day < prev.start) return { start: day, end: prev.start };
      return { start: prev.start, end: day };
    });
  }

  function applyPicking() {
    onApply(picking.start ? startOfDay(picking.start) : null, picking.end ? endOfDay(picking.end) : null);
    setOpen(false);
  }

  function quick(range: "hoje" | "semana" | "mes" | "30dias") {
    const now = new Date();
    let s: Date;
    const e = endOfDay(now);
    if (range === "hoje") s = startOfDay(now);
    else if (range === "semana") {
      s = new Date(now);
      s.setDate(now.getDate() - now.getDay());
      s = startOfDay(s);
    } else if (range === "mes") {
      s = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    } else {
      s = startOfDay(new Date(now));
      s.setDate(s.getDate() - 29);
    }
    setPicking({ start: s, end: e });
    onApply(s, e);
    setViewMonth(s);
    setOpen(false);
  }

  function clear() {
    setPicking({ start: null, end: null });
    onApply(null, null);
  }

  const daysGrid = buildMonthGrid(viewMonth);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <input
        value={startText}
        onChange={(e) => commitText("start", e.target.value)}
        placeholder="DD/MM/AAAA"
        inputMode="numeric"
        aria-label="Data inicial"
        className="w-[7.5rem] rounded-lg border border-ib-line bg-white px-2.5 py-2 text-sm outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10"
      />
      <span className="text-ib-slate">–</span>
      <input
        value={endText}
        onChange={(e) => commitText("end", e.target.value)}
        placeholder="DD/MM/AAAA"
        inputMode="numeric"
        aria-label="Data final"
        className="w-[7.5rem] rounded-lg border border-ib-line bg-white px-2.5 py-2 text-sm outline-none transition focus:border-ib-mar focus:ring-4 focus:ring-ib-mar/10"
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filtrar por data de entrada do lead"
        aria-expanded={open}
        className={`rounded-lg border p-2 transition ${
          open ? "border-ib-mar bg-ib-bruma text-ib-mar" : "border-ib-line bg-white text-ib-slate hover:text-ib-ink"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[19.5rem] rounded-xl border border-ib-line bg-white p-3 shadow-lg">
          {/* O que este filtro corta precisa estar escrito. Ele olha a data de ENTRADA do
              lead, não a última movimentação — e a coluna de tempo da tabela ao lado é
              "Último contato". Sem este rótulo, clicar em "Hoje" num dia em que ninguém
              novo entrou devolve lista vazia com a tabela mostrando contato de horas atrás,
              e o painel parece quebrado. É a mesma confusão que zerava a Visão geral. */}
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
            Entrada do lead
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[
              { key: "hoje" as const, label: "Hoje" },
              { key: "semana" as const, label: "Esta semana" },
              { key: "mes" as const, label: "Este mês" },
              { key: "30dias" as const, label: "Últimos 30 dias" },
            ].map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => quick(q.key)}
                className="rounded-md bg-ib-papel px-2 py-1 text-[11px] font-medium text-ib-ink hover:bg-ib-bruma hover:text-ib-mar"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-0.5 py-1">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-md p-1 text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
            >
              <Icon name="arrow" className="h-4 w-4 rotate-180" />
            </button>
            <p className="text-xs font-semibold text-ib-ink">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </p>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-md p-1 text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
            >
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 px-0.5 pt-1 text-center text-[10px] font-semibold uppercase text-ib-slate">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-0.5">
            {daysGrid.map((day, i) => {
              if (!day) return <span key={i} />;
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isStart = picking.start && isSameDay(day, picking.start);
              const isEnd = picking.end && isSameDay(day, picking.end);
              const inRange =
                picking.start && picking.end && day > picking.start && day < picking.end;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                    isStart || isEnd
                      ? "bg-ib-mar font-semibold text-white"
                      : inRange
                        ? "bg-ib-bruma text-ib-mar"
                        : inMonth
                          ? "text-ib-ink hover:bg-ib-papel"
                          : "text-ib-slate/40 hover:bg-ib-papel"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-ib-line pt-2">
            <button type="button" onClick={clear} className="text-xs font-medium text-ib-slate hover:text-ib-ink">
              Limpar
            </button>
            <button
              type="button"
              onClick={applyPicking}
              className="rounded-md bg-ib-mar px-3 py-1.5 text-xs font-semibold text-white hover:bg-ib-carimbo"
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildMonthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
