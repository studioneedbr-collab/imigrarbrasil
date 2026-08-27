"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Icon, fmtDate } from "@/components/dashboard/ui";

/**
 * NÍVEL 2 — AS INSTÂNCIAS DA Z-API.
 *
 * Cada linha é um número de WhatsApp com ambiente e ativação próprios. O que esta tela
 * tem de fazer, acima de tudo, é impedir três acidentes:
 *
 * 1. Ligar produção sem perceber. Por isso a confirmação é um diálogo separado, com o
 *    nome da instância escrito, e não um toggle que responde ao primeiro clique.
 * 2. Confundir teste com produção num relance. Por isso o ambiente é a informação mais
 *    forte de cada cartão, antes do nome.
 * 3. Achar que "desligada" quer dizer "sem efeito". Por isso o modo de desligado fica
 *    visível no cartão, sempre: é ele que decide o que a pessoa do outro lado recebe.
 */

interface Instancia {
  id: string;
  nome: string;
  ambiente: "teste" | "producao";
  instanceId: string;
  tokenSet: boolean;
  clientTokenSet: boolean;
  baseUrl: string;
  ativo: boolean;
  ativadoPor: string | null;
  ativadoEm: string | null;
  modoDesligado: "silencio" | "resposta_fixa" | "sombra";
  respostaFixa: string | null;
  slaMinutos: number;
  conectada: boolean | null;
  ultimaMensagem: string | null;
  criadoEm: string;
}

const MODO_LABEL: Record<Instancia["modoDesligado"], string> = {
  silencio: "Silêncio total",
  resposta_fixa: "Resposta automática fixa",
  sombra: "Modo sombra (grava, não envia)",
};

const MODO_EXPLICA: Record<Instancia["modoDesligado"], string> = {
  silencio: "Nada volta para quem escreve. Só existe em instância de teste.",
  resposta_fixa: "Avisa que uma pessoa vai responder, e quando.",
  sombra: "A Ana monta a resposta, ela fica no painel para revisão e nada é enviado.",
};

const inputClass =
  "w-full rounded-xl border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none";

export default function Instancias() {
  const [lista, setLista] = useState<Instancia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ nome: "", instanceId: "", token: "", clientToken: "" });
  const [confirmar, setConfirmar] = useState<{ inst: Instancia; ligar: boolean } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/agente/instancias?conexao=1", { cache: "no-store" });
      if (res.ok) setLista((await res.json()).instancias ?? []);
    } catch {
      /* a lista fica como está; o erro aparece na próxima ação */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function cadastrar() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/agente/instancias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nova),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não consegui cadastrar.");
        return;
      }
      setNova({ nome: "", instanceId: "", token: "", clientToken: "" });
      setCriando(false);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function salvarCampo(inst: Instancia, patch: Record<string, unknown>) {
    setErro(null);
    const res = await fetch(`/api/agente/instancias/${inst.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 409 = promover a produção precisa de confirmação. A pergunta é feita aqui, com o
      // que muda escrito por extenso, e não como um "tem certeza?" genérico.
      if (data.precisaConfirmar === "producao" && window.confirm(`${data.error}\n\nPromover "${inst.nome}" a produção?`)) {
        return salvarCampo(inst, { ...patch, confirmarProducao: true });
      }
      setErro(data.error ?? "Não consegui salvar.");
      return;
    }
    await carregar();
  }

  async function reconectar(inst: Instancia) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/agente/instancias/${inst.id}/reconectar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; detalhe?: string; error?: string };
      if (!res.ok || !data.ok) {
        setErro(data.detalhe ?? data.error ?? "Não consegui pedir a reconexão.");
        return;
      }
      // O texto vem do servidor porque ele diz o que este botão NÃO resolve: aparelho
      // desvinculado só volta com alguém lendo o QR Code no painel da Z-API.
      setAviso(data.detalhe ?? "Pedido de reconexão enviado.");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function aplicarAtivacao() {
    if (!confirmar) return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/agente/instancias/${confirmar.inst.id}/ativacao`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ativo: confirmar.ligar,
          confirmarProducao: true,
          motivo: motivo.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não consegui mudar a ativação.");
        return;
      }
      setConfirmar(null);
      setMotivo("");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Instâncias do WhatsApp</SectionTitle>
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-ib-slate">
          Cada instância tem <strong className="text-ib-ink">ambiente</strong> e{" "}
          <strong className="text-ib-ink">ativação</strong> próprios. Ligar a de teste não liga
          a de produção. Conversa que acontece numa instância de teste não entra nas métricas
          nem na fila de trabalho.
        </p>

        {erro ? (
          <p className="rounded-xl border border-ib-danger/20 bg-ib-danger/5 px-3 py-2 text-sm text-ib-danger">
            {erro}
          </p>
        ) : null}

        {aviso ? (
          <p className="rounded-xl border border-ib-mar/20 bg-ib-bruma px-3 py-2 text-sm text-ib-mar">
            {aviso}
          </p>
        ) : null}

        {carregando ? <p className="text-sm text-ib-slate">Carregando…</p> : null}

        {lista.map((inst) => (
          <div
            key={inst.id}
            className={`rounded-2xl border p-4 ${
              inst.ativo && inst.ambiente === "producao"
                ? "border-emerald-300 bg-emerald-50/40"
                : "border-ib-line bg-white"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                      inst.ambiente === "producao"
                        ? "bg-ib-danger/10 text-ib-danger"
                        : "bg-ib-bruma text-ib-mar"
                    }`}
                  >
                    {inst.ambiente === "producao" ? "Produção" : "Teste"}
                  </span>
                  <span className="font-semibold text-ib-ink">{inst.nome}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      inst.ativo ? "text-[#15803D]" : "text-ib-slate"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${inst.ativo ? "bg-ib-success" : "bg-ib-slate/50"}`} />
                    {inst.ativo ? "Agente ligado" : "Agente desligado"}
                  </span>
                  {/* VOCABULÁRIO ÚNICO: conexão do WhatsApp é conectado/desconectado, e
                      o agente é ligado/desligado. Eram quatro termos para dois conceitos
                      ("fora do ar", "captação parada", "quedas do agente", "ligado"), e
                      ninguém sabia quais deles eram sinônimos. */}
                  {inst.conectada === null ? null : (
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        inst.conectada ? "text-[#15803D]" : "text-ib-danger"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${inst.conectada ? "bg-ib-success" : "bg-ib-danger"}`}
                      />
                      {inst.conectada ? "WhatsApp conectado" : "WhatsApp desconectado"}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-ib-slate">{inst.instanceId}</p>
                <p className="mt-0.5 text-xs text-ib-slate">
                  {inst.ultimaMensagem
                    ? `Última mensagem recebida em ${fmtDate(inst.ultimaMensagem)}.`
                    : "Nenhuma mensagem recebida por esta instância."}
                </p>
                {inst.ativo && inst.ativadoPor ? (
                  <p className="mt-0.5 text-xs text-ib-slate">
                    Ligada por {inst.ativadoPor}
                    {inst.ativadoEm ? ` em ${fmtDate(inst.ativadoEm)}` : ""}.
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => reconectar(inst)}
                  disabled={ocupado}
                  className="rounded-lg border border-ib-line px-3.5 py-2 text-sm font-semibold text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink disabled:opacity-50"
                >
                  Reconectar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMotivo("");
                    setConfirmar({ inst, ligar: !inst.ativo });
                  }}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    inst.ativo
                      ? "border border-ib-danger/40 text-ib-danger hover:bg-ib-danger/10"
                      : "bg-ib-mar text-white hover:bg-ib-carimbo"
                  }`}
                >
                  {inst.ativo ? "Desligar" : "Ligar"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Com o agente desligado
                </span>
                <select
                  value={inst.modoDesligado}
                  onChange={(e) => salvarCampo(inst, { modoDesligado: e.target.value })}
                  className={`${inputClass} mt-1.5`}
                >
                  {/* Silêncio total só aparece em teste — em produção deixar alguém sem
                      NENHUMA resposta é o pior desfecho possível, e a opção que não deve
                      existir é a opção que não se oferece. */}
                  {(inst.ambiente === "teste"
                    ? (["silencio", "resposta_fixa", "sombra"] as const)
                    : (["resposta_fixa", "sombra"] as const)
                  ).map((m) => (
                    <option key={m} value={m}>
                      {MODO_LABEL[m]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-ib-slate">
                  {MODO_EXPLICA[inst.modoDesligado]}
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Prazo da primeira resposta humana
                </span>
                <select
                  value={inst.slaMinutos}
                  onChange={(e) => salvarCampo(inst, { slaMinutos: Number(e.target.value) })}
                  className={`${inputClass} mt-1.5`}
                >
                  {[15, 30, 60, 120, 240, 480].map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-ib-slate">
                  Conta só o expediente. Passou disso, o caso sobe para o topo da fila.
                </span>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Ambiente
                </span>
                <select
                  value={inst.ambiente}
                  onChange={(e) => salvarCampo(inst, { ambiente: e.target.value })}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value="teste">Teste — não conta nas métricas nem na fila</option>
                  <option value="producao">Produção — fala com clientes de verdade</option>
                </select>
              </label>

              {inst.modoDesligado === "resposta_fixa" ? (
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                    Texto da resposta automática
                  </span>
                  <textarea
                    defaultValue={inst.respostaFixa ?? ""}
                    onBlur={(e) => {
                      if ((e.target.value ?? "") !== (inst.respostaFixa ?? "")) {
                        salvarCampo(inst, { respostaFixa: e.target.value.trim() || null });
                      }
                    }}
                    rows={2}
                    placeholder="Em branco, sai um texto padrão que promete um horário real de atendimento."
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
              ) : null}
            </div>
          </div>
        ))}

        {criando ? (
          <div className="rounded-2xl border border-dashed border-ib-line bg-ib-papel/40 p-4">
            <p className="mb-3 text-sm font-semibold text-ib-ink">Nova instância</p>
            <p className="mb-3 text-xs leading-relaxed text-ib-slate">
              Ela nasce em <strong>teste</strong> e <strong>desligada</strong>, sempre — e em
              modo sombra, gravando o que a Ana responderia sem enviar nada. Promover a
              produção e ligar são duas decisões separadas, depois.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={nova.nome}
                onChange={(e) => setNova({ ...nova, nome: e.target.value })}
                placeholder="Nome (ex.: Número de testes)"
                className={inputClass}
              />
              <input
                value={nova.instanceId}
                onChange={(e) => setNova({ ...nova, instanceId: e.target.value })}
                placeholder="Instance ID"
                className={inputClass}
              />
              <input
                type="password"
                value={nova.token}
                onChange={(e) => setNova({ ...nova, token: e.target.value })}
                placeholder="Token"
                autoComplete="off"
                className={inputClass}
              />
              <input
                type="password"
                value={nova.clientToken}
                onChange={(e) => setNova({ ...nova, clientToken: e.target.value })}
                placeholder="Client-Token (opcional)"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={ocupado || !nova.nome.trim() || !nova.instanceId.trim() || !nova.token.trim()}
                onClick={cadastrar}
                className="rounded-lg bg-ib-mar px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ib-carimbo disabled:opacity-50"
              >
                {ocupado ? "Cadastrando…" : "Cadastrar"}
              </button>
              <button
                type="button"
                onClick={() => setCriando(false)}
                className="rounded-lg border border-ib-line bg-white px-3.5 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ib-mar transition hover:underline"
          >
            <Icon name="plus" className="h-4 w-4" />
            Cadastrar uma instância
          </button>
        )}
      </div>

      {confirmar ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ib-casa/45 backdrop-blur-[2px]"
            onClick={() => !ocupado && setConfirmar(null)}
            aria-hidden
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-ib-line bg-white p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-ib-ink">
              {confirmar.ligar ? "Ligar" : "Desligar"} “{confirmar.inst.nome}”?
            </h2>
            <div className="mt-2 text-sm leading-relaxed text-ib-slate">
              {confirmar.ligar ? (
                confirmar.inst.ambiente === "producao" ? (
                  <>
                    Esta é uma instância de <strong className="text-ib-danger">PRODUÇÃO</strong>.
                    A Ana vai responder sozinha para clientes de verdade neste número. Isto é
                    uma decisão separada da chave geral do agente.
                  </>
                ) : (
                  <>
                    A Ana passa a responder no número de teste. As instâncias de produção não
                    são afetadas por isto.
                  </>
                )
              ) : (
                <>
                  A Ana para de responder neste número. As mensagens continuam chegando e sendo
                  gravadas — o que sai de volta passa a ser{" "}
                  <strong className="text-ib-ink">{MODO_LABEL[confirmar.inst.modoDesligado].toLowerCase()}</strong>.
                </>
              )}
            </div>

            {!confirmar.ligar && confirmar.inst.ambiente === "producao" ? (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-ib-slate">
                  Por quê? (obrigatório)
                </span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  autoFocus
                  maxLength={280}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
            ) : null}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                disabled={ocupado}
                className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aplicarAtivacao}
                disabled={
                  ocupado ||
                  (!confirmar.ligar && confirmar.inst.ambiente === "producao" && !motivo.trim())
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                  confirmar.ligar ? "bg-ib-mar hover:bg-ib-carimbo" : "bg-ib-danger hover:bg-ib-danger/90"
                }`}
              >
                {ocupado ? "Salvando…" : confirmar.ligar ? "Ligar" : "Desligar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
