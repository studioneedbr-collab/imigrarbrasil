"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, fmtDate } from "@/components/dashboard/ui";

/**
 * NÍVEL 1 — A CHAVE GERAL, NO TOPO DE TODAS AS TELAS.
 *
 * Duas decisões de desenho que valem o comentário:
 *
 * 1. DOIS ESTADOS CLAROS, e não um toggle cinza. Um interruptor discreto no canto é
 *    exatamente como se descobre, três dias depois, que o agente estava desligado desde
 *    terça. Ligado é sóbrio (verde, discreto); desligado é vermelho e ocupa a linha.
 *
 * 2. DESLIGAR ABRE UM CAMPO DE MOTIVO OBRIGATÓRIO. Não é burocracia: o motivo aparece na
 *    faixa de alerta para todo mundo que abrir o painel depois. Sem ele, "o agente está
 *    desligado" é um fato sem história, e ninguém sabe se pode religar.
 */

interface Chave {
  ligada: boolean;
  autor: string | null;
  em: string | null;
  motivo: string | null;
}

export default function ChaveGeral() {
  const [chave, setChave] = useState<Chave | null>(null);
  const [admin, setAdmin] = useState(false);
  const [confirmando, setConfirmando] = useState<"ligar" | "desligar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/agente/chave", { cache: "no-store" });
      if (res.ok) setChave((await res.json()).chave);
    } catch {
      /* a faixa de alerta cobre o caso de o painel não conseguir ler o estado */
    }
  }, []);

  useEffect(() => {
    carregar();
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => setAdmin(d?.role === "admin"))
      .catch(() => setAdmin(false));
    // O estado é relido de tempos em tempos porque ele é global: se alguém desligar o
    // agente da outra ponta do escritório, quem está com a tela aberta precisa ver.
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [carregar]);

  async function aplicar(ligada: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/agente/chave", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ligada, motivo: motivo.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não consegui mudar a chave geral.");
        return;
      }
      setChave(data.chave);
      setConfirmando(null);
      setMotivo("");
      // A faixa de alerta e a fila são renderizadas no servidor: sem o reload elas
      // continuariam mostrando o estado anterior, que é pior do que não mostrar nada.
      window.location.reload();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setSalvando(false);
    }
  }

  if (!chave) return null;

  const ligada = chave.ligada;

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────────────
          LIGADO É UMA LINHA. DESLIGADO É UM ALARME.

          Os dois estados tinham o mesmo desenho: mesma caixa, mesmo ícone de 36px, mesmo
          padding, logo abaixo da faixa vermelha de captação parada. O resultado é que o
          estado NORMAL do sistema — o agente funcionando — ocupava a mesma área e a mesma
          altura que um alarme, todo dia, em todas as telas.

          Duas coisas dão errado aí, e a segunda é a que custa caro. A primeira é o espaço:
          um bloco permanente empurra o trabalho para baixo da dobra. A segunda é que
          quando tudo pesa igual, nada pesa: o olho aprende a pular aquela região, e o dia
          em que ela ficar vermelha ele vai pular também.

          Então: ligado vira uma linha discreta, que continua SEMPRE visível (um botão que
          só aparece quando algo está errado é um botão que ninguém sabe que existe) e
          continua a um clique de desligar. Desligado mantém a caixa inteira — ali é
          alarme, e alarme domina.
          ───────────────────────────────────────────────────────────────────────── */}
      {ligada ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ib-slate">
          <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="font-medium text-ib-ink">Agente ligado</span>
          <span className="text-ib-slate">
            · a Ana está respondendo nas instâncias que estão ligadas
          </span>
          {admin ? (
            <button
              type="button"
              onClick={() => {
                setMotivo("");
                setErro(null);
                setConfirmando("desligar");
              }}
              className="ml-auto rounded px-1.5 py-0.5 font-semibold text-ib-slate underline decoration-dotted transition hover:text-ib-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-danger"
            >
              Desligar o agente
            </button>
          ) : null}
        </div>
      ) : (
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-ib-danger/30 bg-ib-danger/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ib-danger/10 text-ib-danger">
            <Icon name="shield" className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ib-danger">Agente DESLIGADO</p>
            <p className="mt-0.5 truncate text-xs text-ib-slate">
              Por {chave.autor ?? "alguém"}
              {chave.em ? ` desde ${fmtDate(chave.em)}` : ""}
              {chave.motivo ? ` — ${chave.motivo}` : ""}. As mensagens continuam chegando e
              sendo gravadas.
            </p>
          </div>
        </div>

        {admin ? (
          <button
            type="button"
            onClick={() => {
              setMotivo("");
              setErro(null);
              setConfirmando("ligar");
            }}
            className="shrink-0 rounded-lg bg-ib-mar px-4 py-2 text-sm font-semibold text-white transition hover:bg-ib-carimbo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar"
          >
            Ligar o agente
          </button>
        ) : (
          // Quem não é admin vê o estado, e é isso que importa: ninguém pode esquecer
          // que está desligado, mesmo sem poder mexer.
          <span className="shrink-0 text-xs text-ib-slate">Só um admin pode mudar.</span>
        )}
      </div>
      )}

      {confirmando ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ib-casa/45 backdrop-blur-[2px]"
            onClick={() => !salvando && setConfirmando(null)}
            aria-hidden
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-ib-line bg-white p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-ib-ink">
              {confirmando === "desligar" ? "Desligar o agente inteiro?" : "Ligar o agente?"}
            </h2>

            <div className="mt-2 text-sm leading-relaxed text-ib-slate">
              {confirmando === "desligar" ? (
                <>
                  A Ana para de responder em <strong>todas</strong> as instâncias. As mensagens
                  continuam chegando, sendo gravadas e aparecendo no painel — e cada conversa
                  entra na fila esperando resposta humana, com o relógio de SLA correndo.
                </>
              ) : (
                <>
                  A Ana volta a responder nas instâncias que estiverem ligadas. Isto{" "}
                  <strong>não</strong> liga instância nenhuma por conta própria — cada uma
                  tem o seu botão.
                </>
              )}
            </div>

            {confirmando === "desligar" ? (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Por quê? (obrigatório)
                </span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  maxLength={280}
                  autoFocus
                  placeholder="Ex.: respondeu errado sobre prazo de defesa — conferindo o prompt"
                  className="mt-1.5 w-full rounded-xl border border-ib-line px-3 py-2 text-sm text-ib-ink outline-none focus:border-ib-mar"
                />
                <span className="mt-1 block text-xs text-ib-slate">
                  Vai aparecer na faixa vermelha do topo para todo mundo, até alguém religar.
                </span>
              </label>
            ) : null}

            {erro ? <p className="mt-3 text-sm text-ib-danger">{erro}</p> : null}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                disabled={salvando}
                className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => aplicar(confirmando === "ligar")}
                disabled={salvando || (confirmando === "desligar" && !motivo.trim())}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                  confirmando === "desligar" ? "bg-ib-danger hover:bg-ib-danger/90" : "bg-ib-mar hover:bg-ib-carimbo"
                }`}
              >
                {salvando ? "Salvando…" : confirmando === "desligar" ? "Desligar" : "Ligar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
