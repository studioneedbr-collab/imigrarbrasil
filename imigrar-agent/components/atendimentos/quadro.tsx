"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CardDoAtendimento } from "@/components/atendimentos/card";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import type { AtendimentoStatus } from "@/lib/domain/types";
import { COLUNAS, montarKanban, transicao } from "@/lib/fila/kanban";
import { POR_PAGINA } from "@/lib/fila/paginacao";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

/**
 * O QUADRO.
 *
 * Arrastar NÃO escreve no banco por um caminho novo: cada movimento vira uma das ações do
 * endpoint POST /api/leads/[id]/atendimento, que já existia e já sabe que "perdido" exige
 * motivo, que assumir grava responsável e que tudo entra no log de acesso. Um `update`
 * direto no drop apagaria as três coisas em silêncio.
 *
 * O quadro é otimista de propósito — o card muda de coluna na hora e volta se o servidor
 * recusar. Arrastar e esperar meio segundo por um refresh de página inteira transforma
 * organizar dez casos numa tarefa de um minuto.
 *
 * NO CELULAR NÃO TEM ARRASTO. Drag em tela de toque erra mais do que acerta, e errar aqui
 * significa fechar o caso de alguém. Lá o card ganha um seletor de status, que faz
 * exatamente a mesma chamada.
 */

const AJUDA: Record<AtendimentoStatus, string> = {
  novo: "Chegou e ninguém pegou.",
  em_atendimento: "Alguém do time está com a bola.",
  agendado: "Reunião marcada com a pessoa.",
  fechado: "Virou cliente ou o assunto se resolveu.",
  perdido: "Não virou atendimento — com o motivo registrado.",
};

export default function Quadro({
  leads: iniciais,
  agoraISO,
}: {
  leads: LeadDaFila[];
  agoraISO: string;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraISO), [agoraISO]);
  const [leads, setLeads] = useState(iniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<AtendimentoStatus | null>(null);
  const [visiveis, setVisiveis] = useState<Record<string, number>>({});
  const [perda, setPerda] = useState<{ lead: LeadDaFila; motivo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const colunas = useMemo(() => montarKanban(leads, agora), [leads, agora]);

  /**
   * Move o card na tela, chama o endpoint e desfaz se ele recusar. O `router.refresh()`
   * no fim reconcilia com o servidor — sem ele, "assumir" mostraria o card na coluna
   * certa e sem o nome do responsável até alguém recarregar.
   */
  async function mover(lead: LeadDaFila, para: AtendimentoStatus, motivo?: string) {
    const de = lead.atendimentoStatus ?? "novo";
    const t = transicao(de, para);
    if (!t) return;

    setErro(null);
    const antes = leads;
    setLeads((atual) =>
      atual.map((l) => (l.id === lead.id ? { ...l, atendimentoStatus: para } : l)),
    );

    const r = await fetch(`/api/leads/${lead.id}/atendimento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: t.acao, para: t.para, motivo }),
    }).catch(() => null);

    if (!r?.ok) {
      setLeads(antes);
      setErro(
        (await r?.json().catch(() => null))?.error ??
          "Não foi possível mover este atendimento. Nada foi alterado.",
      );
      return;
    }
    router.refresh();
  }

  function soltar(para: AtendimentoStatus) {
    const lead = leads.find((l) => l.id === arrastando);
    setArrastando(null);
    setSobre(null);
    if (!lead) return;
    const t = transicao(lead.atendimentoStatus ?? "novo", para);
    if (!t) return;
    // "Perdido" para aqui e pede o motivo antes de gravar: o endpoint recusa sem ele, e
    // é assim que a coluna não vira um cemitério sem explicação.
    if (t.exigeMotivo) setPerda({ lead, motivo: "" });
    else void mover(lead, para);
  }

  return (
    <div className="space-y-3">
      {erro ? (
        <div role="alert" className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm text-ib-danger">
          {erro}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {colunas.map((coluna) => {
          const limite = visiveis[coluna.status] ?? POR_PAGINA;
          const mostrando = coluna.leads.slice(0, limite);
          const restam = coluna.leads.length - mostrando.length;
          return (
            <section
              key={coluna.status}
              aria-label={ATENDIMENTO_LABEL[coluna.status]}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(coluna.status);
              }}
              onDragLeave={() => setSobre((s) => (s === coluna.status ? null : s))}
              onDrop={() => soltar(coluna.status)}
              className={`flex min-h-[8rem] flex-col rounded-xl border bg-ib-papel/50 transition ${
                sobre === coluna.status ? "border-ib-mar bg-ib-bruma" : "border-ib-line"
              }`}
            >
              <header className="border-b border-ib-line px-3 py-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-ib-ink">
                    {ATENDIMENTO_LABEL[coluna.status]}
                  </h2>
                  <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
                    {coluna.leads.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-ib-slate">
                  {AJUDA[coluna.status]}
                </p>
              </header>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {mostrando.length === 0 ? (
                  <p className="px-1 py-4 text-[11px] leading-relaxed text-ib-slate">
                    Nada aqui.
                  </p>
                ) : null}

                {mostrando.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setArrastando(lead.id)}
                    onDragEnd={() => setArrastando(null)}
                    className={`cursor-grab active:cursor-grabbing ${
                      arrastando === lead.id ? "opacity-40" : ""
                    }`}
                  >
                    <CardDoAtendimento lead={lead} agora={agora} />
                    {/* O caminho sem arrasto: existe sempre, e no celular é o único. */}
                    <label className="mt-1 flex items-center gap-1 px-1 xl:hidden">
                      <span className="text-[10px] text-ib-slate">mover para</span>
                      <select
                        value={coluna.status}
                        onChange={(e) => {
                          const para = e.target.value as AtendimentoStatus;
                          const t = transicao(coluna.status, para);
                          if (t?.exigeMotivo) setPerda({ lead, motivo: "" });
                          else if (t) void mover(lead, para);
                        }}
                        className="rounded border border-ib-line bg-white px-1 py-0.5 text-[11px] text-ib-ink"
                      >
                        {COLUNAS.map((s) => (
                          <option key={s} value={s}>
                            {ATENDIMENTO_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}

                {restam > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisiveis((v) => ({ ...v, [coluna.status]: limite + POR_PAGINA }))
                    }
                    className="rounded-md border border-ib-line bg-white px-2 py-1.5 text-[11px] font-medium text-ib-carimbo transition hover:bg-ib-papel"
                  >
                    Carregar mais {restam > POR_PAGINA ? POR_PAGINA : restam} ({restam} restantes)
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {perda ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-ib-ink">
              Por que este caso foi perdido?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ib-slate">
              É o que alguém vai ler daqui a seis meses tentando entender por que{" "}
              {perda.lead.contactName ?? "esta pessoa"} não virou atendimento.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={perda.motivo}
              onChange={(e) => setPerda({ ...perda, motivo: e.target.value })}
              className="mt-3 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setPerda(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!perda.motivo.trim()}
                onClick={() => {
                  const { lead, motivo } = perda;
                  setPerda(null);
                  void mover(lead, "perdido", motivo.trim());
                }}
              >
                Marcar como perdido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
