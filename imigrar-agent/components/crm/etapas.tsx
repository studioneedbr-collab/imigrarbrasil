"use client";

import { useEffect, useState } from "react";
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
  proposta_enviada: "o orçamento está com a pessoa; EXIGE valor e validade ao mover",
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
  contagem,
  podeApagarFunil,
  aoMudar,
  aoMudarFunil,
  aoErrar,
}: {
  funil: FunilCrm;
  etapas: EtapaCrm[];
  /**
   * Quantos casos estão em cada etapa AGORA.
   *
   * Existe por causa de uma pergunta que a tela não respondia na hora de apagar: "isto
   * aqui tem gente dentro?". Apagar uma etapa não apaga caso nenhum — eles voltam a se
   * distribuir pelo status —, mas quem clica não sabe disso, e quem sabe ainda precisa
   * saber quantos vão se mexer.
   */
  contagem: Record<string, number>;
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
  /**
   * A ETAPA QUE ACABOU DE SER SALVA.
   *
   * Esta tela grava no `blur`: a pessoa digita o nome da coluna, clica em qualquer outro
   * lugar e a gravação acontece — sem botão, sem aviso, sem nada mudando na tela. Quem
   * não tem certeza de que salvou faz a única coisa possível, que é recarregar a página
   * para conferir; e quem recarrega no meio de uma edição perde o campo em que estava.
   * Um "salvo" que aparece e some em dois segundos custa nada e fecha essa dúvida.
   */
  const [salvo, setSalvo] = useState<string | null>(null);
  /** Apagar coluna é destrutivo o bastante para pedir confirmação, como o funil já pedia. */
  const [confirmandoEtapa, setConfirmandoEtapa] = useState<string | null>(null);
  /** O "salvo" do funil — mesma dúvida do nome da etapa, mesmo remédio. */
  const [funilSalvo, setFunilSalvo] = useState(false);
  /** A etapa em trânsito, enquanto alguém arrasta. */
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  useEffect(() => {
    if (!funilSalvo) return;
    const t = setTimeout(() => setFunilSalvo(false), 2000);
    return () => clearTimeout(t);
  }, [funilSalvo]);

  useEffect(() => {
    if (!salvo) return;
    const t = setTimeout(() => setSalvo(null), 2000);
    return () => clearTimeout(t);
  }, [salvo]);

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
    setSalvo(id);
  }

  async function apagar(id: string) {
    const c = await chamar<{ ok: true }>(`/api/crm/etapas/${id}`, { method: "DELETE" });
    if (!c) return;
    aoMudar(etapas.filter((e) => e.id !== id));
    setConfirmandoEtapa(null);
  }

  /**
   * REORDENAR — a lista inteira, numa decisão só.
   *
   * Eram dois PATCH em sequência. Quando o primeiro gravava e o segundo falhava, as duas
   * etapas ficavam com a MESMA ordem e o quadro passava a se reorganizar sozinho, na cara
   * de quem estava arrumando. Ver app/api/crm/etapas/ordem.
   */
  async function reordenar(proximas: EtapaCrm[]) {
    const antes = etapas;
    // A tela anda primeiro. Arrastar precisa responder no dedo; se o servidor recusar, a
    // ordem antiga volta e o erro aparece — que é melhor do que a coluna ficar presa no
    // lugar por meio segundo a cada arrasto.
    aoMudar(proximas.map((e, i) => ({ ...e, ordem: i })));
    const c = await chamar<{ etapas: EtapaCrm[] }>("/api/crm/etapas/ordem", {
      method: "POST",
      body: JSON.stringify({ funilId: funil.id, ids: proximas.map((e) => e.id) }),
    });
    if (!c) {
      aoMudar(antes);
      return;
    }
    aoMudar(c.etapas);
    setSalvo("ordem");
  }

  /** As setas continuam existindo: no celular não há arrasto, e no teclado também não. */
  function trocar(i: number, j: number) {
    if (j < 0 || j >= etapas.length) return;
    const proximas = [...etapas];
    [proximas[i], proximas[j]] = [proximas[j], proximas[i]];
    void reordenar(proximas);
  }

  /** Soltou em cima de outra etapa: a arrastada ocupa aquela posição. */
  function soltarEm(idDestino: string) {
    const de = etapas.findIndex((e) => e.id === arrastando);
    const para = etapas.findIndex((e) => e.id === idDestino);
    setArrastando(null);
    setSobre(null);
    if (de < 0 || para < 0 || de === para) return;
    const proximas = [...etapas];
    const [movida] = proximas.splice(de, 1);
    proximas.splice(para, 0, movida);
    void reordenar(proximas);
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
                }).then((c) => {
                  if (!c) return;
                  aoMudarFunil(c.funil);
                  setFunilSalvo(true);
                });
              }
            }}
            className="mt-1 w-48 rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          {/* O nome do funil gravava no blur sem nada mudar na tela — a mesma dúvida que
              a etapa tinha, no campo logo acima dela. */}
          <span className="mt-1 block h-4 text-[11px] font-semibold text-ib-success">
            {funilSalvo ? "✓ salvo" : ""}
          </span>
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
      {/* ARRASTAR PARA REORDENAR. O quadro ao lado já se organiza arrastando, e chegar
          aqui e ter só duas setinhas é a inconsistência que faz alguém achar que a tela
          está pela metade. As setas ficam: no celular não há arrasto, e no teclado
          também não. */}
      <p className="text-[11px] text-ib-slate">
        Arraste para reordenar as colunas — ou use as setas.
        {salvo === "ordem" ? (
          <span className="ml-2 font-semibold text-ib-success">✓ ordem salva</span>
        ) : null}
      </p>
      <ul className="space-y-2">
        {etapas.map((e, i) => (
          <li
            key={e.id}
            draggable
            onDragStart={() => setArrastando(e.id)}
            onDragEnd={() => {
              setArrastando(null);
              setSobre(null);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              setSobre(e.id);
            }}
            onDragLeave={() => setSobre((atual) => (atual === e.id ? null : atual))}
            onDrop={() => soltarEm(e.id)}
            className={`rounded-lg border bg-ib-papel/40 p-3 transition ${
              arrastando === e.id ? "opacity-40" : ""
            } ${sobre === e.id && arrastando !== e.id ? "border-ib-mar bg-ib-bruma" : "border-ib-line"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                title="Arraste para reordenar"
                className="cursor-grab select-none px-1 text-ib-slate active:cursor-grabbing"
              >
                ⠿
              </span>
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
                {confirmandoEtapa === e.id ? (
                  <span className="ml-1 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void apagar(e.id)}
                      className="rounded bg-ib-danger px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Apagar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmandoEtapa(null)}
                      className="text-xs font-semibold text-ib-slate hover:underline"
                    >
                      cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado || etapas.length <= 1}
                    onClick={() => setConfirmandoEtapa(e.id)}
                    className="ml-1 text-xs font-semibold text-ib-slate underline hover:text-ib-danger disabled:no-underline disabled:opacity-40"
                  >
                    apagar
                  </button>
                )}
              </span>
            </div>

            {/* O QUE ESTÁ DENTRO DESTA COLUNA, e o que acontece se ela sumir.
                Apagar uma etapa não apaga caso nenhum: eles voltam a se distribuir pelo
                status. Quem clica não sabe disso — e essa é exatamente a dúvida que faz
                alguém não mexer no quadro, ou mexer com medo. */}
            <p className="mt-1.5 text-[11px] text-ib-slate">
              {confirmandoEtapa === e.id ? (
                <span className="text-ib-danger">
                  {(contagem[e.id] ?? 0) === 0
                    ? "Não há caso nenhum nesta coluna. "
                    : `${contagem[e.id]} ${contagem[e.id] === 1 ? "caso volta" : "casos voltam"} a se distribuir pelo status. `}
                  Nada é apagado, só o desenho da coluna.
                </span>
              ) : (
                <>
                  {contagem[e.id] ?? 0} {(contagem[e.id] ?? 0) === 1 ? "caso" : "casos"} nesta
                  coluna
                  {salvo === e.id ? (
                    <span className="ml-2 font-semibold text-ib-success">✓ salvo</span>
                  ) : null}
                </>
              )}
            </p>
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
