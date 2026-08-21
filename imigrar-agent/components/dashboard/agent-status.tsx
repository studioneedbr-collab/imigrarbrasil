"use client";

import { useEffect, useState } from "react";
import { Guilloche } from "@/components/guilloche";

export type AgentStatusData = {
  model: string;
  mode: "real" | "simulação";
  conversations: number;
  conversationsToday: number;
  leads: number;
  qualifiedRate: number;
};

// online: true = último fetch ok · false = falhou · null = carregando
function useAgentStatus() {
  const [data, setData] = useState<AgentStatusData | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/agent/status", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as AgentStatusData;
        if (active) {
          setData(json);
          setOnline(true);
        }
      } catch {
        if (active) setOnline(false);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return { data, online };
}

function statusText(online: boolean | null): string {
  if (online === null) return "Conectando…";
  return online ? "Agente ativo" : "Agente offline";
}

/* Bolinha de status: verde (ativo, pulsando) · vermelho (offline) · azure (carregando) */
function StatusDot({ online, size = "md" }: { online: boolean | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const color = online === null ? "bg-ib-selo" : online ? "bg-ib-success" : "bg-ib-danger";
  return (
    <span className={`relative flex ${box}`}>
      {online !== false ? (
        <span className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-70 motion-safe:animate-signal-ping`} />
      ) : null}
      <span className={`relative inline-flex ${box} rounded-full ${color}`} />
    </span>
  );
}

/* RAIL — pinned to the sidebar footer: apenas o status */
function Rail({ online }: { online: boolean | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
      <StatusDot online={online} size="sm" />
      <span className="text-sm font-semibold tracking-wide text-white">{statusText(online)}</span>
    </div>
  );
}

/* HERO — topo da Visão geral: status + nome + métricas (sem modelo/modo) */
function Hero({ data, online }: { data: AgentStatusData | null; online: boolean | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ib-casa via-ib-casa to-ib-ink text-white shadow-[0_8px_40px_-16px_rgba(11,18,32,0.6)]">
      <div className="grid-field-dark pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      {/* A roseta gravada, mesma da tela de entrada. Substituiu o brilho diagonal que
          varria o cartão: aquilo é grafismo de dashboard, não diz nada daqui. */}
      <Guilloche
        className="pointer-events-none absolute -right-24 top-1/2 h-[420px] w-auto -translate-y-1/2 text-ib-bruma/[0.2]"
        linhas={8}
        dentes={13}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ib-casa via-ib-casa/75 to-transparent" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <StatusDot online={online} />
            <span
              className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                online === false ? "text-ib-danger" : "text-ib-selo"
              }`}
            >
              {statusText(online)}
            </span>
          </div>
          <p className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
            Agente · atendimento migratório
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/60">
            Responde no idioma de quem escreve e encaminha o caso ao time.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {/* Estes três são o TOTAL da operação, não o período escolhido no filtro logo
              abaixo — por isso "no total" no rótulo. Sem isso, a taxa daqui e a da faixa de
              indicadores apareciam como dois números diferentes para o mesmo nome. */}
          <HeroMetric label="Atendidas hoje" value={data?.conversationsToday} />
          <HeroMetric label="Leads no total" value={data?.leads} />
          <HeroMetric label="Qualif. no total" value={data ? `${data.qualifiedRate}%` : undefined} />
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-center sm:min-w-[92px]">
      <p className="font-mono text-2xl font-semibold tabular-nums text-white sm:text-3xl">{value ?? "—"}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-white/50">{label}</p>
    </div>
  );
}

export function AgentStatus({ variant }: { variant: "rail" | "hero" }) {
  const { data, online } = useAgentStatus();
  return variant === "rail" ? <Rail online={online} /> : <Hero data={data} online={online} />;
}
