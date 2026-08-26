"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader, Skeleton, btnGhost, btnPrimary, fmtDate } from "@/components/dashboard/ui";
import type { AccessLogEntry } from "@/lib/domain/types";

/**
 * DADOS SENSÍVEIS: QUEM VIU, E POR QUANTO TEMPO GUARDAMOS.
 *
 * Este painel guarda situação migratória — inclusive de gente em situação irregular e de
 * solicitantes de refúgio. Não é cadastro de cliente: é informação que, exposta, causa
 * dano real à pessoa. Esta tela existe para as duas perguntas que aparecem quando algo
 * dá errado: quem acessou, e por que isso ainda estava guardado.
 */

const ACAO_LABEL: Record<string, string> = {
  abriu_lead: "abriu um lead",
  corrigiu_ficha: "corrigiu a ficha",
  confirmou_prazo: "confirmou um prazo",
  assumiu_lead: "assumiu um lead",
  assumiu_atendimento: "assumiu o atendimento",
  reclassificou_lead: "reclassificou",
  resgatou_lead: "resgatou para a fila",
  exportou: "EXPORTOU DADOS",
  mudou_retencao: "mudou a retenção",
  executou_retencao: "executou a retenção",
  marcou_fechado: "fechou o atendimento",
  marcou_perdido: "marcou como perdido",
  marcou_agendado: "agendou reunião",
};

export default function AcessoPage() {
  const [acessos, setAcessos] = useState<AccessLogEntry[] | null>(null);
  const [dias, setDias] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const carregar = useCallback(async () => {
    const [a, r] = await Promise.all([
      fetch("/api/acessos?limit=200", { cache: "no-store" }),
      fetch("/api/retencao", { cache: "no-store" }),
    ]);
    if (a.status === 403 || r.status === 403) {
      setSemPermissao(true);
      return;
    }
    if (a.ok) setAcessos((await a.json()).acessos ?? []);
    if (r.ok) setDias((await r.json()).dias ?? 180);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(executar: boolean) {
    setSalvando(true);
    setErro(null);
    setMsg(null);
    const r = await fetch("/api/retencao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dias, executar }),
    });
    setSalvando(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d.error ?? "Não foi possível salvar.");
      return;
    }
    setMsg(
      executar
        ? `${d.apagados ?? 0} conversas descartadas foram apagadas.`
        : "Prazo de retenção salvo.",
    );
    carregar();
  }

  if (semPermissao) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ib-ink">
          Esta tela é do administrador. O log de acesso e a política de retenção não são
          visíveis para os demais perfis.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LGPD"
        title="Acesso e retenção"
        description="Quem abriu e quem exportou dado sensível, e por quanto tempo as conversas descartadas continuam guardadas."
      />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ib-ink">Política de retenção</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ib-slate">
          Conversas classificadas como sem caso concreto, DPU ou fora do escopo são
          apagadas depois deste prazo. Quem foi resgatado para a fila nunca é apagado por
          aqui — deixou de ser descarte no momento em que uma pessoa disse que o agente
          errou. O prazo mínimo é de 30 dias porque abaixo disso a revisão por amostragem
          das filtradas deixa de ser possível.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
              Dias
            </span>
            <input
              type="number"
              min={30}
              max={3650}
              value={dias ?? ""}
              onChange={(e) => setDias(Number(e.target.value))}
              className="mt-1 w-28 rounded-lg border border-ib-line bg-white px-3 py-2 font-mono text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
          </label>
          <button type="button" onClick={() => salvar(false)} disabled={salvando} className={btnPrimary}>
            {salvando ? "Salvando prazo…" : "Salvar prazo de retenção"}
          </button>
          <button type="button" onClick={() => salvar(true)} disabled={salvando} className={btnGhost}>
            {salvando ? "Apagando descartados…" : "Apagar descartados vencidos agora"}
          </button>
        </div>
        {msg ? <p className="mt-2 text-xs font-medium text-ib-success">{msg}</p> : null}
        {erro ? <p className="mt-2 text-xs font-medium text-ib-danger">{erro}</p> : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-ib-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ib-ink">Log de acesso</h2>
          <p className="mt-0.5 text-xs text-ib-slate">
            Os 200 registros mais recentes. Exportações aparecem em destaque.
          </p>
        </div>
        {acessos === null ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : acessos.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-ib-slate">
            Nada registrado ainda. O log começa a se preencher assim que alguém abrir um
            lead ou exportar dados.
          </p>
        ) : (
          <ul className="divide-y divide-ib-line">
            {acessos.map((a) => (
              <li
                key={a.id}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2 text-sm ${
                  a.acao === "exportou" ? "bg-ib-warn/[0.06]" : ""
                }`}
              >
                <span className="font-mono text-xs tabular-nums text-ib-slate">
                  {fmtDate(a.criadoEm)}
                </span>
                <span className="font-medium text-ib-ink">{a.autor}</span>
                <span className="text-ib-slate">{ACAO_LABEL[a.acao] ?? a.acao}</span>
                {a.detalhe ? <span className="text-xs text-ib-slate">· {a.detalhe}</span> : null}
                {a.ip ? <span className="ml-auto font-mono text-[11px] text-ib-slate">{a.ip}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
