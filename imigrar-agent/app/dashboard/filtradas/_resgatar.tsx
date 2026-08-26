"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost } from "@/components/dashboard/ui";
import { CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import type { Classificacao } from "@/lib/domain/types";

/**
 * RESGATAR — devolver à fila alguém que o agente descartou.
 *
 * O botão faz uma reclassificação como qualquer outra: é no repositório que a saída do
 * descarte vira "resgate", justamente para que nenhuma outra tela precise lembrar de
 * marcar isso. A taxa de resgate é a métrica que denuncia um agente filtrando demais, e
 * ela não pode depender de um clique num botão específico.
 */
export default function BotaoResgatar({
  leadId,
  sugestao = "MORNO_ADMINISTRATIVO",
}: {
  leadId: string;
  sugestao?: Classificacao;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function resgatar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/leads/${leadId}/classificacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: sugestao, motivo: "resgatado na revisão das filtradas" }),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).error ?? "Não foi possível resgatar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={resgatar}
        disabled={salvando}
        className={`${btnGhost} px-3 py-1.5 text-xs`}
        title={`Devolve à fila como ${CLASSIFICACAO_LABEL[sugestao]}`}
      >
        {salvando ? "Resgatando…" : "Resgatar para a fila"}
      </button>
      {erro ? <span className="text-[11px] text-ib-danger">{erro}</span> : null}
    </div>
  );
}
