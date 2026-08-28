"use client";

import { useState } from "react";
import { CampoData, Selecao } from "@/components/dashboard/campos";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import {
  CADENCIA_DIAS,
  MOTIVOS_DE_ESPERA,
  MOTIVO_ESPERA_LABEL,
  proximoToqueSugerido,
  type MotivoEspera,
} from "@/lib/followup/motivos";

/**
 * PAUSAR O CASO — dizendo O QUE se está esperando.
 *
 * É o gesto que faz o follow-up deste domínio existir. Em imigração o tempo morto é do
 * cliente: ele some três semanas porque está na fila do consulado, esperando
 * apostilamento ou agendamento na Polícia Federal. Sem o motivo gravado, a única coisa
 * que o sistema consegue escrever é a mensagem genérica de vendas — e mandá-la para quem
 * está esperando um consulado comunica, com todas as letras, que o escritório não sabe em
 * que pé está o caso dela.
 *
 * A DATA VEM PROPOSTA, NÃO IMPOSTA. A cadência por motivo é o ponto de partida; quem
 * conhece o caso ajusta. Em "cliente pediu para retomar depois" não há sugestão nenhuma:
 * a data é a que ELE indicou, e inventar uma por cima é desrespeitar o que ele pediu — por
 * isso ali o botão só habilita com a data preenchida.
 */
export function PausarCaso({
  leadId,
  motivoAtual,
  proximoToqueEm,
  toquesNoMotivo,
  aoMudar,
}: {
  leadId: string;
  motivoAtual?: string | null;
  proximoToqueEm?: string | null;
  toquesNoMotivo?: number;
  aoMudar?: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoEspera | null>(
    (motivoAtual as MotivoEspera | null) ?? null,
  );
  const [data, setData] = useState<string | null>(proximoToqueEm ? proximoToqueEm.slice(0, 10) : null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cadencia = motivo ? CADENCIA_DIAS[motivo] : null;
  const precisaDeData = motivo !== null && cadencia === null;
  const podeSalvar = motivo !== null && (!precisaDeData || !!data);

  async function salvar(limpar = false) {
    setSalvando(true);
    setErro(null);
    const quando = !limpar && data ? new Date(`${data}T12:00:00`) : null;
    const r = await fetch(`/api/leads/${leadId}/espera`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motivo: limpar ? null : motivo,
        ...(quando ? { proximoToqueEm: quando.toISOString() } : {}),
      }),
    }).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      setErro((await r?.json().catch(() => null))?.error ?? "Não foi possível salvar a espera.");
      return;
    }
    if (limpar) {
      setMotivo(null);
      setData(null);
    }
    aoMudar?.();
  }

  return (
    <div className="space-y-3 rounded-lg border border-ib-line bg-ib-papel/60 p-3">
      <div>
        <p className="text-xs font-semibold text-ib-ink">O que estamos esperando?</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ib-slate">
          O follow-up é escrito sobre isto. Caso parado sem motivo registrado vira pendência
          na Operação em vez de virar mensagem.
        </p>
      </div>

      <Selecao
        label="Motivo da espera"
        valor={motivo}
        onChange={(v) => {
          const m = v as MotivoEspera;
          setMotivo(m);
          // A data proposta acompanha o motivo escolhido, e continua editável: 30 dias é
          // a média de um consulado, não a promessa dele.
          const sugerida = proximoToqueSugerido(m);
          setData(sugerida ? sugerida.toISOString().slice(0, 10) : null);
        }}
        opcoes={MOTIVOS_DE_ESPERA.map((m) => ({
          valor: m,
          rotulo: MOTIVO_ESPERA_LABEL[m],
          ajuda:
            CADENCIA_DIAS[m] === null
              ? "a data é a que a pessoa indicou"
              : `toque sugerido a cada ${CADENCIA_DIAS[m]} dias`,
        }))}
      />

      {motivo ? (
        <CampoData
          label="Próximo toque"
          valor={data}
          onChange={setData}
          ajuda={
            precisaDeData
              ? "Este motivo não tem cadência: use a data que a pessoa indicou."
              : `Sugestão da cadência (${cadencia} dias). Ajuste se você conhece o caso.`
          }
        />
      ) : null}

      {toquesNoMotivo ? (
        <p className="text-[11px] text-ib-slate">
          {toquesNoMotivo} de 3 toques já saíram nesta espera. No terceiro sem resposta o
          caso vai para Perdido como “sumiu”, com uma última mensagem de despedida.
        </p>
      ) : null}

      {erro ? <p className="text-xs font-medium text-ib-danger">{erro}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!podeSalvar || salvando}
          onClick={() => void salvar()}
          className={btnPrimary}
        >
          {salvando ? "Salvando…" : motivoAtual ? "Atualizar espera" : "Pausar caso"}
        </button>
        {motivoAtual ? (
          <button type="button" disabled={salvando} onClick={() => void salvar(true)} className={btnGhost}>
            Retomar (não estamos mais esperando)
          </button>
        ) : null}
      </div>
    </div>
  );
}
