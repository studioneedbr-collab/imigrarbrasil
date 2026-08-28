"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { MOTIVO_ESPERA_LABEL, type MotivoEspera } from "@/lib/followup/motivos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import { rotuloContato } from "@/lib/domain/rotulos";
import type { ToqueDeFollowup } from "@/lib/domain/types";

/**
 * FOLLOW-UPS DE HOJE — no topo de "Meus atendimentos", antes de tudo.
 *
 * É o único bloco da tela em que o trabalho é de um minuto e o efeito é imediato: ler uma
 * frase e dizer enviar, editar ou pular. Enterrá-lo embaixo das listas seria garantir que
 * a fila acumule — e uma fila de rascunhos acumulada faz o follow-up parar de existir sem
 * ninguém desligar nada.
 *
 * O QUE APARECE JUNTO DA FRASE é o que sustenta a decisão de aprová-la: O QUE ESTAMOS
 * ESPERANDO e EM QUE LÍNGUA. Sem o motivo, quem aprova não tem como saber se a mensagem
 * faz sentido; sem o idioma, ninguém percebe que a frase saiu em português para alguém
 * que fala crioulo, que é justamente o erro que destrói este produto.
 *
 * AS TAREFAS DIVIDEM O BLOCO com os rascunhos, e de propósito: "ligar, há prazo correndo"
 * e "escrever à mão, não há modelo em crioulo" são o mesmo trabalho de acompanhamento,
 * feito por outro meio. Separá-las em outra tela é como elas deixam de ser feitas.
 */
export default function FilaDeFollowup({ toques }: { toques: ToqueDeFollowup[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const rascunhos = toques.filter((t) => t.status === "rascunho");
  const tarefas = toques.filter((t) => t.status === "tarefa");
  if (!rascunhos.length && !tarefas.length) return null;

  async function decidir(
    toque: ToqueDeFollowup,
    acao: "enviar" | "pular" | "concluir",
    corpo?: string,
  ) {
    setOcupado(toque.id);
    setErro(null);
    const r = await fetch(`/api/followup/toques/${toque.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, ...(corpo ? { texto: corpo } : {}) }),
    }).catch(() => null);
    setOcupado(null);
    if (!r?.ok) {
      setErro((await r?.json().catch(() => null))?.error ?? "Não foi possível concluir.");
      return;
    }
    setEditando(null);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ib-mar/30 bg-white ring-1 ring-ib-mar/20">
      <div className="border-b border-ib-line bg-ib-bruma/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-ib-ink">Follow-ups de hoje</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">
          O sistema escreveu; quem manda é você. Confira o idioma e o que estamos esperando
          antes de enviar.
        </p>
      </div>

      {erro ? (
        <p role="alert" className="border-b border-ib-line bg-ib-danger/[0.06] px-5 py-2 text-xs text-ib-danger">
          {erro}
        </p>
      ) : null}

      <ul className="divide-y divide-ib-line">
        {rascunhos.map((t) => {
          const contato = rotuloContato({
            contactName: t.contato?.nome,
            whatsappNumber: t.contato?.whatsappNumber,
          });
          return (
            <li key={t.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {t.leadId ? (
                  <Link href={`/dashboard/leads/${t.leadId}`} className="text-sm font-semibold text-ib-ink hover:underline">
                    {contato.texto}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-ib-ink">{contato.texto}</span>
                )}
                <span className="text-[11px] text-ib-slate">
                  {MOTIVO_ESPERA_LABEL[t.motivo as MotivoEspera] ?? t.motivo}
                </span>
                <span className="rounded bg-ib-papel px-1.5 py-0.5 font-mono text-[10px] text-ib-slate ring-1 ring-inset ring-ib-line">
                  {nomeDoIdioma(t.idioma) ?? "idioma não identificado"}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-ib-slate">
                  toque {t.toque}
                </span>
              </div>

              {editando === t.id ? (
                <textarea
                  autoFocus
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="mt-2 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
                />
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ib-ink">
                  {t.texto}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocupado === t.id}
                  onClick={() => decidir(t, "enviar", editando === t.id ? texto : undefined)}
                  className={btnPrimary}
                >
                  {ocupado === t.id ? "Enviando…" : "Enviar"}
                </button>
                <button
                  type="button"
                  disabled={ocupado === t.id}
                  onClick={() => {
                    setTexto(t.texto);
                    setEditando(editando === t.id ? null : t.id);
                  }}
                  className={btnGhost}
                >
                  {editando === t.id ? "Cancelar edição" : "Editar"}
                </button>
                {/* PULAR NÃO É FALHA, É DADO: um modelo que é pulado toda vez está errado,
                    e sem registrar o pulo ninguém descobre isso. */}
                <button
                  type="button"
                  disabled={ocupado === t.id}
                  onClick={() => decidir(t, "pular")}
                  className="text-xs font-semibold text-ib-slate underline hover:text-ib-ink"
                >
                  Pular
                </button>
              </div>
            </li>
          );
        })}

        {tarefas.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 bg-ib-papel/50 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ib-ink">
                {t.leadId ? (
                  <Link href={`/dashboard/leads/${t.leadId}`} className="hover:underline">
                    {rotuloContato({
                      contactName: t.contato?.nome,
                      whatsappNumber: t.contato?.whatsappNumber,
                    }).texto}
                  </Link>
                ) : (
                  rotuloContato({ whatsappNumber: t.contato?.whatsappNumber }).texto
                )}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ib-ink">{t.texto}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ib-carimbo ring-1 ring-inset ring-ib-line">
                {t.canal === "ligacao" ? "ligar" : "escrever à mão"}
              </span>
              <button
                type="button"
                disabled={ocupado === t.id}
                onClick={() => decidir(t, "concluir")}
                className="text-xs font-semibold text-ib-carimbo underline"
              >
                {ocupado === t.id ? "…" : "feito"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
