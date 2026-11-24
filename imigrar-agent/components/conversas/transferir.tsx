"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { EscolhaDaAgente } from "@/components/conversas/escolha-da-agente";
import type { ModoDaAgente } from "@/lib/crm/agente-na-transferencia";

interface Opcoes {
  agenteCalada: boolean;
  pessoas: { id: string; nome: string; eu: boolean }[];
  lead: { responsavelId: string | null } | null;
}

/**
 * TRANSFERIR DE DENTRO DA CONVERSA — a MESMA transferência da lista.
 *
 * Havia duas: a daqui gravava um nome digitado e não mexia no responsável do caso, então a
 * conversa dizia uma pessoa e o CRM, outra; e só administrador conseguia usar.
 */
export function TransferirConversa({
  conversationId,
  aberto,
  onFechar,
  onFeito,
}: {
  conversationId: string;
  aberto: boolean;
  /** Referência estável: o diálogo refaz o foco quando ela muda. */
  onFechar: () => void;
  onFeito: (mensagem: string) => void;
}) {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [pessoa, setPessoa] = useState("");
  const [agente, setAgente] = useState<ModoDaAgente>("para");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setOpcoes(null);
    setPessoa("");
    setAgente("para");
    setErro(null);
    fetch(`/api/conversations/${conversationId}/encaminhar`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: Opcoes) => {
        if (!vivo) return;
        setOpcoes(d);
        setPessoa((d.pessoas.find((p) => p.id === d.lead?.responsavelId) ?? d.pessoas[0])?.id ?? "");
      })
      .catch(() => vivo && setErro("Não foi possível carregar o time. Feche e tente de novo."));
    return () => {
      vivo = false;
    };
  }, [aberto, conversationId]);

  async function confirmar() {
    if (!pessoa) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/encaminhar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "transferir", usuarioId: pessoa, agente }),
      });
      const d = (await res.json().catch(() => ({}))) as { mensagem?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Não foi possível transferir.");
      onFeito(d.mensagem ?? "Conversa transferida.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível transferir.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmDialog
      open={aberto}
      tone="primary"
      loading={enviando}
      title="Transferir conversa"
      confirmLabel="Transferir"
      loadingLabel="Transferindo…"
      onConfirm={confirmar}
      onCancel={onFechar}
      message={
        <div className="space-y-3">
          <p>Quem recebe passa a ser o responsável pelo caso, aqui e no CRM.</p>
          {opcoes ? (
            <>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">Para quem</span>
                <select
                  value={pessoa}
                  onChange={(e) => setPessoa(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20"
                >
                  {opcoes.pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.eu ? " (eu)" : ""}
                      {p.id === opcoes.lead?.responsavelId ? " — responsável atual" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <EscolhaDaAgente valor={agente} onChange={setAgente} calada={opcoes.agenteCalada} />
            </>
          ) : erro ? null : (
            <p>Carregando…</p>
          )}
          {erro ? (
            <p role="alert" className="rounded-lg border border-ib-danger/20 bg-ib-danger/5 px-3 py-2 text-ib-danger">
              {erro}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
