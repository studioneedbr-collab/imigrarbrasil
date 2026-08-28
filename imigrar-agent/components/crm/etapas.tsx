"use client";

import { useState } from "react";
import { Selecao } from "@/components/dashboard/campos";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { COLUNAS } from "@/lib/fila/kanban";
import { AJUDA_MAX, NOME_MAX } from "@/lib/crm/funil";
import type { AtendimentoStatus, EtapaCrm, FunilCrm } from "@/lib/domain/types";

/**
 * DESENHAR O QUADRO.
 *
 * Cada etapa tem um NOME, que é vocabulário do escritório, e um STATUS, que é do domínio.
 * O seletor de status é a peça mais importante da tela e a mais fácil de tratar como
 * detalhe: é ele que faz "aguardando certidão consular" continuar sendo trabalho em
 * aberto para a fila, e "contrato assinado" contar como desfecho no relatório.
 *
 * Por isso ele não some atrás de um "avançado", e por isso cada opção vem com a frase que
 * explica o que ela implica — quem monta o funil precisa saber que pôr uma etapa em
 * "perdido" significa que mover um card para lá vai pedir motivo.
 */

const IMPLICA: Record<AtendimentoStatus, string> = {
  novo: "caso ainda sem dono; aparece na fila como novo",
  em_atendimento: "trabalho em aberto; conta como atendimento ativo",
  agendado: "há reunião marcada com a pessoa",
  fechado: "desfecho: encerra o caso e sai da fila",
  perdido: "desfecho: encerra o caso e EXIGE motivo ao mover",
};

const OPCOES_STATUS = COLUNAS.map((s) => ({
  valor: s,
  rotulo: ATENDIMENTO_LABEL[s],
  ajuda: IMPLICA[s],
}));

export function GerenciarEtapas({
  funil,
  etapas,
  podeApagarFunil,
  aoMudar,
  aoMudarFunil,
  aoErrar,
}: {
  funil: FunilCrm;
  etapas: EtapaCrm[];
  podeApagarFunil: boolean;
  aoMudar: (etapas: EtapaCrm[]) => void;
  /** `null` significa funil apagado. */
  aoMudarFunil: (funil: FunilCrm | null) => void;
  aoErrar: (msg: string | null) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [nome, setNome] = useState("");
  const [ajuda, setAjuda] = useState("");
  const [status, setStatus] = useState<AtendimentoStatus>("em_atendimento");
  const [nomeFunil, setNomeFunil] = useState(funil.nome);
  const [confirmandoFunil, setConfirmandoFunil] = useState(false);

  async function chamar<T>(url: string, init: RequestInit): Promise<T | null> {
    setOcupado(true);
    aoErrar(null);
    const r = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    }).catch(() => null);
    setOcupado(false);
    const corpo = await r?.json().catch(() => null);
    if (!r?.ok) {
      aoErrar(corpo?.error ?? "Não foi possível salvar. Nada mudou.");
      return null;
    }
    return corpo as T;
  }

  async function criar() {
    if (nome.trim().length < 2) return;
    const c = await chamar<{ etapa: EtapaCrm }>("/api/crm/etapas", {
      method: "POST",
      body: JSON.stringify({
        funilId: funil.id,
        nome: nome.trim(),
        ajuda: ajuda.trim() || null,
        status,
        ordem: etapas.length,
      }),
    });
    if (!c) return;
    aoMudar([...etapas, c.etapa]);
    setNome("");
    setAjuda("");
  }

  async function salvar(id: string, patch: Partial<EtapaCrm>) {
    const c = await chamar<{ etapa: EtapaCrm }>(`/api/crm/etapas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!c) return;
    aoMudar(etapas.map((e) => (e.id === id ? c.etapa : e)));
  }

  async function apagar(id: string) {
    const c = await chamar<{ ok: true }>(`/api/crm/etapas/${id}`, { method: "DELETE" });
    if (!c) return;
    aoMudar(etapas.filter((e) => e.id !== id));
  }

  /**
   * Trocar duas etapas de lugar. São dois PATCH e não um "reordenar tudo": mover uma
   * coluna é a operação real, e uma chamada por etapa mantém o log de acesso legível.
   */
  async function trocar(i: number, j: number) {
    if (j < 0 || j >= etapas.length) return;
    const a = etapas[i];
    const b = etapas[j];
    const c1 = await chamar<{ etapa: EtapaCrm }>(`/api/crm/etapas/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ordem: b.ordem }),
    });
    if (!c1) return;
    const c2 = await chamar<{ etapa: EtapaCrm }>(`/api/crm/etapas/${b.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ordem: a.ordem }),
    });
    if (!c2) return;
    aoMudar(
      etapas.map((e) => (e.id === a.id ? c1.etapa : e.id === b.id ? c2.etapa : e)),
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-ib-line bg-white p-4">
      {/* ─── O funil ─── */}
      <div className="flex flex-wrap items-end gap-2 border-b border-ib-line pb-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Nome do funil
          </span>
          <input
            value={nomeFunil}
            maxLength={NOME_MAX}
            onChange={(e) => setNomeFunil(e.target.value)}
            onBlur={() => {
              if (nomeFunil.trim().length >= 2 && nomeFunil.trim() !== funil.nome) {
                void chamar<{ funil: FunilCrm }>(`/api/crm/funis/${funil.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ nome: nomeFunil.trim() }),
                }).then((c) => c && aoMudarFunil(c.funil));
              }
            }}
            className="mt-1 w-48 rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
        </label>

        {!funil.padrao ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              void chamar<{ funil: FunilCrm }>(`/api/crm/funis/${funil.id}`, {
                method: "PATCH",
                body: JSON.stringify({ padrao: true }),
              }).then((c) => c && aoMudarFunil(c.funil))
            }
            className={btnGhost}
            title="Casos novos passam a cair neste funil."
          >
            Tornar padrão
          </button>
        ) : (
          <span className="pb-2 text-xs text-ib-slate">
            É o funil padrão: os casos novos caem aqui.
          </span>
        )}

        {podeApagarFunil ? (
          <span className="ml-auto">
            {confirmandoFunil ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-ib-slate">
                  Apaga o desenho das colunas. Os casos voltam a se distribuir pelo status.
                </span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    void chamar<{ ok: true }>(`/api/crm/funis/${funil.id}`, { method: "DELETE" }).then(
                      (c) => c && aoMudarFunil(null),
                    )
                  }
                  className={btnPrimary}
                >
                  Apagar funil
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoFunil(false)}
                  className="text-xs font-semibold text-ib-slate hover:underline"
                >
                  cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoFunil(true)}
                className="text-xs font-semibold text-ib-slate underline hover:text-ib-danger"
              >
                Apagar funil
              </button>
            )}
          </span>
        ) : null}
      </div>

      {/* ─── As etapas ─── */}
      <ul className="space-y-2">
        {etapas.map((e, i) => (
          <li key={e.id} className="rounded-lg border border-ib-line bg-ib-papel/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                defaultValue={e.nome}
                maxLength={NOME_MAX}
                aria-label={`Nome da etapa ${e.nome}`}
                onBlur={(ev) => {
                  const v = ev.target.value.trim();
                  if (v.length >= 2 && v !== e.nome) void salvar(e.id, { nome: v });
                }}
                className="w-44 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-sm font-semibold text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
              <Selecao
                compacto
                className="w-44"
                label={`Status de ${e.nome}`}
                valor={e.status}
                onChange={(v) => void salvar(e.id, { status: v })}
                opcoes={OPCOES_STATUS}
              />

              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  disabled={ocupado || i === 0}
                  onClick={() => void trocar(i, i - 1)}
                  aria-label={`Mover ${e.nome} para a esquerda`}
                  className="rounded border border-ib-line bg-white px-2 py-1 text-xs text-ib-slate disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={ocupado || i === etapas.length - 1}
                  onClick={() => void trocar(i, i + 1)}
                  aria-label={`Mover ${e.nome} para a direita`}
                  className="rounded border border-ib-line bg-white px-2 py-1 text-xs text-ib-slate disabled:opacity-40"
                >
                  →
                </button>
                <button
                  type="button"
                  disabled={ocupado || etapas.length <= 1}
                  onClick={() => void apagar(e.id)}
                  className="ml-1 text-xs font-semibold text-ib-slate underline hover:text-ib-danger disabled:no-underline disabled:opacity-40"
                >
                  apagar
                </button>
              </span>
            </div>
            <input
              defaultValue={e.ajuda ?? ""}
              maxLength={AJUDA_MAX}
              placeholder="o que significa um caso estar nesta coluna"
              aria-label={`Ajuda de ${e.nome}`}
              onBlur={(ev) => {
                const v = ev.target.value.trim();
                if (v !== (e.ajuda ?? "")) void salvar(e.id, { ajuda: v || null });
              }}
              className="mt-2 w-full rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs text-ib-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
          </li>
        ))}
      </ul>

      {/* ─── A etapa nova ─── */}
      <div className="flex flex-wrap items-end gap-2 border-t border-ib-line pt-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            Nova etapa
          </span>
          <input
            value={nome}
            maxLength={NOME_MAX}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: aguardando certidão consular"
            className="mt-1 w-56 rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
        </label>
        <label className="block flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
            O que significa estar aqui
          </span>
          <input
            value={ajuda}
            maxLength={AJUDA_MAX}
            onChange={(e) => setAjuda(e.target.value)}
            placeholder="a linha que aparece embaixo do título da coluna"
            className="mt-1 w-full min-w-[12rem] rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
        </label>
        <Selecao
          className="w-52"
          label="Conta como"
          valor={status}
          onChange={setStatus}
          opcoes={OPCOES_STATUS}
        />
        <button
          type="button"
          disabled={ocupado || nome.trim().length < 2}
          onClick={() => void criar()}
          className={btnPrimary}
        >
          Criar etapa
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-ib-slate">
        O nome é do escritório; o “conta como” é do sistema — {IMPLICA[status]}. É essa
        amarração que faz a fila continuar ordenando por prazo e o desfecho continuar sendo
        contado, por mais colunas que o funil ganhe.
      </p>
    </div>
  );
}
