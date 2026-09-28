"use client";

import { useEffect, useState } from "react";
import { Selecao } from "@/components/dashboard/campos";
import { btnPrimary } from "@/components/dashboard/ui";
import type { MotivoDesfecho, TipoDeMotivo } from "@/lib/domain/types";

/**
 * AS CATEGORIAS DE DESFECHO, EDITÁVEIS PELA TELA.
 *
 * Eram seis, compiladas junto com o sistema. "Por que perdemos" é vocabulário de quem
 * vende: muda com o serviço, com a concorrência e com a época do ano — e depender de
 * deploy para acrescentar uma significa, na prática, que ninguém acrescenta. Todo mundo
 * escolhe "Outro", e "Outro" não responde nada seis meses depois.
 *
 * ── O QUE ESTA TELA DELIBERADAMENTE NÃO DEIXA FAZER ────────────────────────────────
 *
 * EDITAR A CHAVE. Ela é o que está gravado nos casos já fechados. Trocá-la tornaria esses
 * casos órfãos em silêncio: o relatório mostraria uma categoria a menos e uma fatia sem
 * nome, sem nada indicando o que aconteceu. Renomear "Preço" para "Preço/condições"
 * conserta o histórico inteiro de uma vez; trocar a chave o partiria em dois.
 *
 * APAGAR O QUE ESTÁ EM USO. A rota recusa e diz quantos casos usam. O caminho é ARQUIVAR:
 * sai do seletor de quem atende e continua nomeando o que já foi fechado.
 */

const TITULO: Record<TipoDeMotivo, { nome: string; ajuda: string }> = {
  perda: {
    nome: "Motivos de perda",
    ajuda: "Por que uma proposta não virou contrato. É o que o relatório de conversão soma.",
  },
  desqualificacao: {
    nome: "Motivos de desqualificação",
    ajuda: "Por que um lead não virou oportunidade. Pré-venda pergunta outra coisa que venda.",
  },
};

export default function MotivosDoFunil({ podeEditar }: { podeEditar: boolean }) {
  const [motivos, setMotivos] = useState<MotivoDesfecho[]>([]);
  const [tipo, setTipo] = useState<TipoDeMotivo>("perda");
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/motivos")
      .then((r) => (r.ok ? r.json() : { motivos: [] }))
      .then((d) => setMotivos(d.motivos ?? []))
      .catch(() => setErro("Não consegui carregar os motivos."));
  }, []);

  async function chamar<T>(url: string, init: RequestInit): Promise<T | null> {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.error ?? "Não deu certo.");
        return null;
      }
      return corpo as T;
    } finally {
      setOcupado(false);
    }
  }

  async function criar() {
    if (novo.trim().length < 2) return;
    const c = await chamar<{ motivo: MotivoDesfecho }>("/api/crm/motivos", {
      method: "POST",
      body: JSON.stringify({ tipo, rotulo: novo.trim() }),
    });
    if (!c) return;
    setMotivos((m) => [...m.filter((x) => x.id !== c.motivo.id), c.motivo]);
    setNovo("");
  }

  async function salvar(id: string, patch: Partial<MotivoDesfecho>) {
    const c = await chamar<{ motivo: MotivoDesfecho }>(`/api/crm/motivos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!c) return;
    setMotivos((m) => m.map((x) => (x.id === id ? c.motivo : x)));
    setSalvo(id);
    setTimeout(() => setSalvo((a) => (a === id ? null : a)), 2000);
  }

  async function apagar(id: string) {
    const c = await chamar<{ ok: boolean }>(`/api/crm/motivos/${id}`, { method: "DELETE" });
    setConfirmando(null);
    if (!c) return;
    setMotivos((m) => m.filter((x) => x.id !== id));
  }

  const daVez = motivos.filter((m) => m.tipo === tipo).sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-3 border-t border-ib-line pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Selecao
          className="w-60"
          label="Categorias de"
          valor={tipo}
          onChange={(v) => setTipo(v as TipoDeMotivo)}
          opcoes={[
            { valor: "perda", rotulo: TITULO.perda.nome, ajuda: TITULO.perda.ajuda },
            { valor: "desqualificacao", rotulo: TITULO.desqualificacao.nome, ajuda: TITULO.desqualificacao.ajuda },
          ]}
        />
      </div>

      {erro ? (
        <p role="alert" className="rounded-lg border border-ib-danger/30 bg-ib-danger/[0.06] px-3 py-2 text-xs text-ib-danger">
          {erro}
        </p>
      ) : null}

      {podeEditar ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ib-slate">
              Novo motivo
            </span>
            <input
              value={novo}
              maxLength={60}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void criar();
                }
              }}
              placeholder={tipo === "perda" ? "ex.: prazo curto demais" : "ex.: já tem advogado"}
              className="mt-1 block w-full min-w-[12rem] rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />
          </label>
          <button
            type="button"
            disabled={ocupado || novo.trim().length < 2}
            onClick={() => void criar()}
            className={btnPrimary}
          >
            Criar motivo
          </button>
        </div>
      ) : null}

      <ul className="max-h-[20rem] space-y-1.5 overflow-y-auto pr-1">
        {daVez.map((m) => (
          <li
            key={m.id}
            className={`flex flex-wrap items-center gap-2 rounded-lg border border-ib-line bg-ib-papel/40 px-3 py-2 ${
              m.arquivado ? "opacity-55" : ""
            }`}
          >
            <input
              defaultValue={m.rotulo}
              maxLength={60}
              disabled={!podeEditar}
              aria-label={`Nome do motivo ${m.rotulo}`}
              onBlur={(ev) => {
                const v = ev.target.value.trim();
                if (v.length >= 2 && v !== m.rotulo) void salvar(m.id, { rotulo: v });
              }}
              className="min-w-[10rem] flex-1 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-sm font-semibold text-ib-ink disabled:bg-ib-papel focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
            />

            {/* A CHAVE, À VISTA E SEM CAMPO. Ela é o que está gravado nos casos fechados —
                mostrar ajuda a entender por que o rótulo muda e ela não. */}
            <code className="shrink-0 rounded bg-ib-papel px-1.5 py-0.5 text-[11px] text-ib-slate">
              {m.chave}
            </code>

            {m.protegido ? (
              <span
                title="O sistema escreve este motivo sozinho na varredura de follow-up. Pode ser renomeado e arquivado, não apagado."
                className="shrink-0 rounded bg-ib-mar/10 px-1.5 py-0.5 text-[11px] font-semibold text-ib-mar"
              >
                do sistema
              </span>
            ) : null}

            {salvo === m.id ? (
              <span className="shrink-0 text-[11px] font-semibold text-ib-success">✓ salvo</span>
            ) : null}

            {podeEditar ? (
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void salvar(m.id, { arquivado: !m.arquivado })}
                  className="text-xs font-semibold text-ib-slate underline hover:text-ib-ink disabled:opacity-40"
                >
                  {m.arquivado ? "reativar" : "arquivar"}
                </button>
                {confirmando === m.id ? (
                  <>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void apagar(m.id)}
                      className="rounded bg-ib-danger px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Apagar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="text-xs font-semibold text-ib-slate hover:underline"
                    >
                      cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado || m.protegido}
                    onClick={() => setConfirmando(m.id)}
                    title={m.protegido ? "Este é escrito pelo sistema. Arquive-o." : undefined}
                    className="text-xs font-semibold text-ib-slate underline hover:text-ib-danger disabled:no-underline disabled:opacity-40"
                  >
                    apagar
                  </button>
                )}
              </span>
            ) : null}
          </li>
        ))}
        {daVez.length === 0 ? (
          <li className="rounded-lg border border-dashed border-ib-line px-3 py-6 text-center text-xs text-ib-slate">
            Nenhuma categoria aqui ainda.
          </li>
        ) : null}
      </ul>

      <p className="text-[11px] leading-relaxed text-ib-slate">
        O <strong>nome</strong> se edita à vontade: renomear conserta o histórico inteiro de
        uma vez. O <strong>código</strong> ao lado não muda — é o que está gravado nos casos
        já fechados, e trocá-lo partiria o histórico em dois.{" "}
        <strong>Arquivar</strong> tira do seletor de quem atende e mantém o nome do que já
        foi fechado; apagar só vale para o que ninguém usou.
      </p>
    </div>
  );
}
