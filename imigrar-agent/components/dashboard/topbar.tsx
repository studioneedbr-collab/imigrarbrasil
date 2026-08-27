"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BuscaGlobal from "@/components/dashboard/busca-global";

interface Transfer {
  id: string;
  conversationId: string;
  reason: string;
  nome: string | null;
  createdAt: string;
}
interface TopbarData {
  transfers: Transfer[];
  unseen: number;
  whatsapp: { connected: boolean; provider: string | null };
}

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const reasonLabel: Record<string, string> = {
  trabalhista: "Trabalhista",
  contratos: "Contratos",
  financeiro: "Financeiro",
  juridico: "Jurídico/LGPD",
  consultor_comercial: "Falar com consultor",
  supervisor_operacional: "Supervisor operacional",
};

export default function Topbar() {
  const [data, setData] = useState<TopbarData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/topbar", { cache: "no-store" });
        if (res.ok && active) setData(await res.json());
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unseen = data?.unseen ?? 0;
  const transfers = data?.transfers ?? [];

  return (
    // Barra de verdade, não dois chips soltos no canto: fundo, traço e a faixa de
    // identificação à esquerda dão base para o status e o sino ficarem em pé.
    // O lugar mais valioso da tela passa a servir para alguma coisa: era o motivo de
    // passaporte, decorativo, e virou busca. O motivo continua na sidebar, pequeno, onde
    // marca é marca e não ocupa espaço de ferramenta.
    <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-ib-line bg-white/70 px-4 py-2.5 backdrop-blur-sm">
      <BuscaGlobal />

      <div className="flex shrink-0 items-center gap-3">
      {/* O status do WhatsApp saiu daqui. Era um chip cinza no canto para um problema que
          para o negócio inteiro — alarme vestido de enfeite. Agora é a faixa vermelha do
          topo (components/operacao/faixa-alerta.tsx) mais a linha permanente na sidebar. */}

      {/* Sino de transferências */}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Transferências para humano"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-ib-line bg-white text-ib-slate transition hover:text-ib-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {unseen > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ib-danger px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unseen}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-ib-line bg-white shadow-xl">
            <div className="border-b border-ib-line px-4 py-2.5">
              <p className="text-sm font-semibold text-ib-ink">Transferências para humano</p>
              <p className="text-xs text-ib-slate">Últimas solicitações que exigem atendimento.</p>
            </div>
            {transfers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ib-slate">Nenhuma transferência ainda.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-ib-line overflow-y-auto">
                {transfers.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/dashboard/conversations/${t.conversationId}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-ib-papel"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ib-danger/10 text-ib-danger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 11h-6" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ib-ink">
                          {t.nome ?? "Lead sem nome"}
                        </p>
                        <p className="text-xs text-ib-slate">
                          {reasonLabel[t.reason] ?? t.reason} · {timeAgo(t.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
