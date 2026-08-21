"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";

type InboxItem = {
  id: string;
  name: string;
  lastText: string;
  lastAt: string;
  unanswered: boolean;
  status: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Chat flutuante (canto inferior direito): badge de não respondidas, som ao chegar
// mensagem nova e lista rápida para abrir a conversa.
export default function FloatingChat() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPingRef = useRef<number>(0); // maior lastAt (de não respondidas) já visto

  // Prepara o áudio no primeiro gesto do usuário (navegadores bloqueiam autoplay).
  function primeAudio() {
    if (audioCtxRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    } catch {
      /* sem áudio */
    }
  }

  function beep() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* ignora */
    }
  }

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number; items: InboxItem[] };
        if (!active) return;
        setItems(data.items);
        setCount(data.count);
        // Toca o som se chegou mensagem nova de cliente (maior lastAt de não respondida avançou).
        const newestUnanswered = data.items
          .filter((i) => i.unanswered)
          .reduce((max, i) => Math.max(max, new Date(i.lastAt).getTime()), 0);
        if (lastPingRef.current === 0) {
          lastPingRef.current = newestUnanswered; // primeira carga: não apita
        } else if (newestUnanswered > lastPingRef.current) {
          lastPingRef.current = newestUnanswered;
          beep();
        }
      } catch {
        /* silencioso */
      }
    }
    poll();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 12000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 print:hidden">
      {/* Painel */}
      {open ? (
        <div className="w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-ib-line bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-ib-line bg-ib-casa px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Icon name="chat" className="h-4 w-4" />
              <span className="text-sm font-semibold">Conversas</span>
              {count > 0 ? (
                <span className="rounded-full bg-ib-danger px-1.5 py-0.5 text-[11px] font-bold">{count}</span>
              ) : null}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-white/70 hover:text-white">
              ✕
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-5 text-center text-sm text-ib-slate">Nenhuma conversa ainda.</p>
            ) : (
              items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    router.push(`/dashboard/conversations/${c.id}`);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 border-b border-ib-line/70 px-4 py-3 text-left transition last:border-0 hover:bg-ib-bruma/40"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      c.unanswered ? "bg-ib-danger/10 text-ib-danger" : "bg-ib-bruma text-ib-casa"
                    }`}
                  >
                    {(c.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ib-ink">{c.name}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ib-slate">{timeAgo(c.lastAt)}</span>
                    </div>
                    <p className={`truncate text-xs ${c.unanswered ? "font-medium text-ib-ink" : "text-ib-slate"}`}>
                      {c.lastText || "—"}
                    </p>
                  </div>
                  {c.unanswered ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ib-danger" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => {
          primeAudio();
          setOpen((v) => !v);
        }}
        aria-label="Abrir conversas"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-ib-casa text-white shadow-xl transition hover:bg-ib-carimbo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar"
      >
        <Icon name="chat" className="h-6 w-6" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-white bg-ib-danger px-1 text-xs font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
