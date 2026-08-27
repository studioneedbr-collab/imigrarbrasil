"use client";

import { useState } from "react";
import { Icon, fmtDate } from "@/components/dashboard/ui";

/**
 * MODO SOMBRA — a resposta que a Ana teria dado, com as três saídas.
 *
 * Este cartão é o produto inteiro da fase de testes: é onde alguém lê o que o agente
 * escreveu para uma pessoa real e decide se aquilo podia ter saído. Três saídas, e a
 * ordem entre elas importa:
 *
 *   ENVIAR COMO ESTÁ  → o caminho de um clique, para quando ela acertou
 *   EDITAR            → abre o texto; o que sai é o texto novo, e os DOIS ficam gravados
 *   DESCARTAR         → pede o motivo, que é a parte que ensina
 *
 * O campo de edição não substitui o original em lugar nenhum. O par (o que ela escreveu,
 * o que a pessoa mandou) é o dado; só o texto final não ensina nada.
 */

export interface RascunhoView {
  id: string;
  conversationId: string;
  texto: string;
  criadoEm: string;
  status: "pendente" | "enviado" | "descartado";
  textoEnviado?: string | null;
  motivo?: string | null;
  decididoPor?: string | null;
  contato?: { nome?: string | null; whatsappNumber?: string | null } | null;
}

export default function RascunhoSombra({
  rascunho,
  mostrarContato = false,
  onDecidido,
}: {
  rascunho: RascunhoView;
  /** Na fila de sombra sim; dentro da conversa não (já se sabe de quem é). */
  mostrarContato?: boolean;
  onDecidido?: (id: string) => void;
}) {
  const [texto, setTexto] = useState(rascunho.texto);
  const [editando, setEditando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (rascunho.status !== "pendente") {
    return (
      <div className="rounded-xl border border-ib-line bg-ib-papel/60 px-4 py-3 text-xs text-ib-slate">
        <span className="font-semibold text-ib-ink">
          {rascunho.status === "enviado" ? "Rascunho enviado" : "Rascunho descartado"}
        </span>{" "}
        por {rascunho.decididoPor ?? "alguém"}
        {rascunho.status === "enviado" && rascunho.textoEnviado !== rascunho.texto
          ? " — com edição"
          : ""}
        {rascunho.motivo ? ` · ${rascunho.motivo}` : ""}
      </div>
    );
  }

  async function decidir(acao: "enviar" | "descartar") {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/agente/rascunhos/${rascunho.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          acao === "enviar"
            ? { acao, ...(texto.trim() !== rascunho.texto ? { texto: texto.trim() } : {}) }
            : { acao, motivo: motivo.trim() || undefined },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não consegui registrar a decisão.");
        return;
      }
      onDecidido?.(rascunho.id);
    } catch {
      setErro("Falha de rede.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-ib-selo/50 bg-ib-selo/[0.04] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#0B7285]">
          <Icon name="agent" className="h-3.5 w-3.5" />
          Modo sombra — não foi enviado
        </span>
        <span className="text-xs text-ib-slate">
          {mostrarContato && rascunho.contato ? (
            <>
              {rascunho.contato.nome || rascunho.contato.whatsappNumber} ·{" "}
            </>
          ) : null}
          {fmtDate(rascunho.criadoEm)}
        </span>
      </div>

      {editando ? (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={Math.min(14, Math.max(4, texto.split("\n").length + 2))}
          className="w-full rounded-xl border border-ib-line bg-white px-3 py-2 text-sm leading-relaxed text-ib-ink outline-none focus:border-ib-mar"
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-xl border border-ib-line bg-white px-4 py-3 text-sm leading-relaxed text-ib-ink">
          {texto}
        </p>
      )}

      {descartando ? (
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
            Por que não presta? (vira dado de treinamento)
          </span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
            maxLength={500}
            placeholder="Ex.: prometeu prazo que não existe"
            className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink outline-none focus:border-ib-mar"
          />
        </label>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-ib-danger">{erro}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {descartando ? (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => decidir("descartar")}
              className="rounded-lg bg-ib-danger px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ib-danger/90 disabled:opacity-50"
            >
              {ocupado ? "Descartando…" : "Confirmar descarte"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setDescartando(false)}
              className="rounded-lg border border-ib-line bg-white px-3.5 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={ocupado || !texto.trim()}
              onClick={() => decidir("enviar")}
              className="rounded-lg bg-ib-mar px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ib-carimbo disabled:opacity-50"
            >
              {ocupado
                ? "Enviando…"
                : texto.trim() !== rascunho.texto
                  ? "Enviar o texto editado"
                  : "Enviar como está"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setEditando((v) => !v)}
              className="rounded-lg border border-ib-line bg-white px-3.5 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
            >
              {editando ? "Parar de editar" : "Editar antes de enviar"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setDescartando(true)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-ib-danger transition hover:bg-ib-danger/10 disabled:opacity-50"
            >
              Descartar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
