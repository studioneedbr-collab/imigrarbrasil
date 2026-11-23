"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Icon, btnPrimary, btnGhost } from "@/components/dashboard/ui";

/**
 * A BATERIA DE TESTES NA TELA. Encadeia os turnos de cada cenário (um pedido por turno,
 * por causa do tempo máximo da Vercel) e mostra, resposta a resposta, o que deu errado.
 * As regras e os cenários estão em lib/agent/bateria.ts.
 */

interface CenarioResumo {
  id: string;
  titulo: string;
  vigia: string;
  turnos: number;
}
interface Diagnostico {
  caracteres: number;
  tokensAprox: number;
  secoes: number;
  repetidas: { titulo: string; vezes: number }[];
  promptCru: boolean;
}
interface Problema {
  tipo: string;
  detalhe: string;
}
interface Turno {
  enviado: string[];
  resposta: string;
  problemas: Problema[];
}
interface Estado {
  situacao: "esperando" | "rodando" | "passou" | "falhou" | "erro";
  turnos: Turno[];
  fichaFaltando: string[];
  erro?: string;
}

const ROTULO: Record<string, string> = {
  pergunta_repetida: "Pergunta repetida",
  repetiu_a_si_mesma: "Repetiu a própria pergunta",
  idioma: "Idioma errado",
  longa: "Resposta longa",
  perguntas_demais: "Perguntas demais",
  raciocinio_vazado: "Vazou o funcionamento",
  sem_resposta: "Sem resposta",
};

export function BateriaDeTestes() {
  const [cenarios, setCenarios] = useState<CenarioResumo[]>([]);
  const [modelo, setModelo] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [rodando, setRodando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const parar = useRef(false);

  useEffect(() => {
    fetch("/api/training/bateria", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cenarios: CenarioResumo[]; modelo: string | null; diagnostico?: Diagnostico } | null) => {
        if (!d) return;
        setCenarios(d.cenarios);
        setModelo(d.modelo);
        setDiag(d.diagnostico ?? null);
      })
      .catch(() => {});
  }, []);

  const atualizar = (id: string, patch: Partial<Estado>) =>
    setEstados((e) => {
      const base: Estado = e[id] ?? { situacao: "esperando", turnos: [], fichaFaltando: [] };
      return { ...e, [id]: { ...base, ...patch } };
    });

  const rodarUm = useCallback(async (c: CenarioResumo, emLote = false) => {
    // "Parar" vale para a rodada em andamento. Rodar um cenário sozinho depois disso não
    // pode nascer interrompido.
    if (!emLote) parar.current = false;
    atualizar(c.id, { situacao: "rodando", turnos: [], fichaFaltando: [], erro: undefined });
    let conversationId: string | undefined;
    const turnos: Turno[] = [];
    for (let i = 0; i < c.turnos; i++) {
      if (parar.current) {
        atualizar(c.id, { situacao: "erro", erro: "Interrompido." });
        return;
      }
      try {
        const res = await fetch("/api/training/bateria", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cenario: c.id, turno: i, conversationId }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        conversationId = d.conversationId;
        turnos.push(d.turno);
        atualizar(c.id, { turnos: [...turnos] });
        if (d.ultimo) {
          const ok = (d.fichaFaltando as string[]).length === 0 && turnos.every((t) => t.problemas.length === 0);
          atualizar(c.id, { situacao: ok ? "passou" : "falhou", fichaFaltando: d.fichaFaltando });
        }
      } catch (err) {
        atualizar(c.id, { situacao: "erro", erro: err instanceof Error ? err.message : "Falhou." });
        return;
      }
    }
  }, []);

  async function rodarTodos() {
    parar.current = false;
    setRodando(true);
    for (const c of cenarios) {
      if (parar.current) break;
      await rodarUm(c, true);
    }
    setRodando(false);
  }

  const passaram = cenarios.filter((c) => estados[c.id]?.situacao === "passou").length;
  const terminados = cenarios.filter((c) => ["passou", "falhou", "erro"].includes(estados[c.id]?.situacao ?? "")).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ib-line pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">Bateria de testes</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-ib-ink">A agente comete os erros conhecidos?</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ib-slate">
            Conversas-modelo, incluindo as que deram errado com clientes, rodando contra o modelo de verdade e o
            treino salvo. Rode depois de mexer no treino ou de trocar o modelo. Cada execução custa algumas
            respostas do modelo, e nada é enviado a ninguém.
          </p>
          <p className="mt-1 text-xs text-ib-slate">
            Modelo em uso: <span className="font-medium text-ib-ink">{modelo ?? "nenhum configurado"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rodando ? (
            <button type="button" className={btnGhost} onClick={() => (parar.current = true)}>
              Parar
            </button>
          ) : null}
          <button type="button" className={btnPrimary} disabled={rodando || !cenarios.length || !modelo} onClick={rodarTodos}>
            <Icon name="pulse" className="h-4 w-4" />
            {rodando ? "Rodando…" : "Rodar a bateria"}
          </button>
        </div>
      </div>

      {diag ? (
        <div className="mt-4 rounded-xl border border-ib-line bg-ib-papel/40 p-3 text-sm">
          <p className="text-ib-ink">
            <span className="font-semibold">O que a agente lê a cada mensagem:</span>{" "}
            {diag.secoes} seções, cerca de {diag.tokensAprox.toLocaleString("pt-BR")} tokens (
            {diag.caracteres.toLocaleString("pt-BR")} caracteres). Tudo entra em toda resposta.
          </p>
          {diag.promptCru ? (
            <p className="mt-1.5 font-medium text-ib-danger">
              ⚠ Um prompt antigo gravado no banco está passando por cima de quase toda esta tela. Use o botão
              &quot;Descartar o prompt cru&quot; abaixo.
            </p>
          ) : null}
          {diag.repetidas.length ? (
            <p className="mt-1.5 text-ib-warn">
              ⚠ Seções com o mesmo título aparecem mais de uma vez — duas versões da mesma regra competem, e o modelo
              escolhe uma sem avisar: {diag.repetidas.map((r) => `"${r.titulo}" (${r.vezes}×)`).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {terminados > 0 ? (
        <p className={`mt-4 text-sm font-semibold ${passaram === cenarios.length ? "text-[#15803D]" : "text-ib-danger"}`}>
          {passaram} de {cenarios.length} cenários sem nenhum problema
          {terminados < cenarios.length ? ` · ${cenarios.length - terminados} ainda por rodar` : ""}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-ib-line">
        {cenarios.map((c) => {
          const e = estados[c.id];
          const nProblemas = (e?.turnos ?? []).reduce((n, t) => n + t.problemas.length, 0) + (e?.fichaFaltando.length ?? 0);
          return (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Situacao s={e?.situacao ?? "esperando"} />
                <button
                  type="button"
                  onClick={() => setAberto((a) => (a === c.id ? null : c.id))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-sm font-semibold text-ib-ink">{c.titulo}</span>
                  <span className="block text-xs text-ib-slate">
                    {e?.situacao === "falhou"
                      ? `${nProblemas} problema${nProblemas === 1 ? "" : "s"} — clique para ver`
                      : e?.situacao === "erro"
                        ? e.erro
                        : c.vigia}
                  </span>
                </button>
                <button type="button" className={btnGhost} disabled={rodando || e?.situacao === "rodando" || !modelo} onClick={() => void rodarUm(c)}>
                  Rodar só este
                </button>
              </div>

              {aberto === c.id && e?.turnos.length ? (
                <div className="mt-3 space-y-3 rounded-xl bg-ib-papel/60 p-3">
                  {e.turnos.map((t, i) => (
                    <div key={i} className="space-y-1.5">
                      {t.enviado.map((m, j) => (
                        <p key={j} className="ml-auto w-fit max-w-[85%] rounded-xl bg-white px-3 py-1.5 text-sm text-ib-ink ring-1 ring-ib-line">
                          {m}
                        </p>
                      ))}
                      <p className="w-fit max-w-[85%] whitespace-pre-wrap rounded-xl bg-[#DCF8C6] px-3 py-1.5 text-sm text-ib-ink">
                        {t.resposta}
                      </p>
                      {t.problemas.map((p, j) => (
                        <p key={j} className="text-xs font-medium text-ib-danger">
                          ⚠ {ROTULO[p.tipo] ?? p.tipo}: {p.detalhe}
                        </p>
                      ))}
                    </div>
                  ))}
                  {e.fichaFaltando.length ? (
                    <p className="text-xs font-medium text-ib-danger">
                      ⚠ A ficha não registrou: {e.fichaFaltando.join("; ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Situacao({ s }: { s: Estado["situacao"] }) {
  const estilo: Record<Estado["situacao"], [string, string]> = {
    esperando: ["bg-ib-papel text-ib-slate", "—"],
    rodando: ["bg-ib-mar/10 text-ib-mar", "rodando"],
    passou: ["bg-ib-success/12 text-[#15803D]", "passou"],
    falhou: ["bg-ib-danger/10 text-ib-danger", "falhou"],
    erro: ["bg-ib-warn/10 text-ib-warn", "erro"],
  };
  const [cls, rotulo] = estilo[s];
  return <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${cls}`}>{rotulo}</span>;
}
