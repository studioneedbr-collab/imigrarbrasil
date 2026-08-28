"use client";

import { useState } from "react";
import { CampoData, Selecao } from "@/components/dashboard/campos";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import { MOTIVO_PERDA_LABEL } from "@/lib/domain/rotulos";
import { MOTIVOS_DE_PERDA, type MotivoPerda } from "@/lib/domain/types";

/**
 * O QUE O QUADRO PERGUNTA ANTES DE MOVER.
 *
 * Três colunas não se alcançam com um arrasto silencioso, e é sempre pelo mesmo motivo:
 * o movimento afirma um FATO que só existe se alguém digitar.
 *
 *   PROPOSTA ENVIADA  de quanto, de qual serviço, até quando. Uma coluna de propostas em
 *                     que não se sabe o valor de nenhuma responde a mesma pergunta que a
 *                     coluna anterior já respondia.
 *   FECHADO           quanto foi contratado — ou que não houve contrato. Campo em branco
 *                     não distingue "não houve" de "esqueceram", e a soma do mês mente.
 *   PERDIDO           a categoria, que se soma, MAIS a frase, que se lê.
 *
 * O componente não chama a API: devolve o corpo pronto para quem já sabe mover o card.
 * É o que mantém um caminho de escrita só — o mesmo POST de sempre, com o log de acesso
 * que vem junto dele.
 */
export type TipoDeMovimento = "propor" | "fechar" | "perder";

export interface CorpoDoMovimento {
  proposta?: {
    propostaServico: string;
    propostaValidade: string;
    propostaValor?: number;
    propostaEnviadaEm?: string;
  };
  valorContratado?: number;
  semValor?: boolean;
  motivo?: string;
  motivoPerdaCategoria?: MotivoPerda;
}

const TITULO: Record<TipoDeMovimento, string> = {
  propor: "O que foi orçado?",
  fechar: "Quanto foi contratado?",
  perder: "Por que este caso foi perdido?",
};

/** Converte "1.500,00" / "1500.00" / "R$ 1500" no número que a API espera. */
export function valorEmReais(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function DialogoDeMovimento({
  tipo,
  nomeDoContato,
  aoConfirmar,
  aoCancelar,
}: {
  tipo: TipoDeMovimento;
  nomeDoContato: string;
  aoConfirmar: (corpo: CorpoDoMovimento) => void;
  aoCancelar: () => void;
}) {
  const [servico, setServico] = useState("");
  const [validade, setValidade] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [semValor, setSemValor] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [categoria, setCategoria] = useState<MotivoPerda | null>(null);

  const numero = valorEmReais(valor);

  const pronto =
    tipo === "propor"
      ? servico.trim().length >= 2 && !!validade
      : tipo === "fechar"
        ? semValor || numero !== null
        : !!categoria && motivo.trim().length > 0;

  function confirmar() {
    if (!pronto) return;
    if (tipo === "propor") {
      aoConfirmar({
        proposta: {
          propostaServico: servico.trim(),
          propostaValidade: validade!,
          ...(numero !== null ? { propostaValor: numero } : {}),
        },
      });
      return;
    }
    if (tipo === "fechar") {
      aoConfirmar(semValor ? { semValor: true } : { valorContratado: numero! });
      return;
    }
    aoConfirmar({ motivo: motivo.trim(), motivoPerdaCategoria: categoria! });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-ib-ink">{TITULO[tipo]}</h2>

        {tipo === "propor" ? (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-ib-ink">Serviço orçado</span>
              <input
                autoFocus
                value={servico}
                onChange={(e) => setServico(e.target.value)}
                placeholder="regularização por união estável, defesa de multa…"
                className="mt-1 w-full rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ib-ink">Valor proposto (R$)</span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="3.500,00"
                className="mt-1 w-full rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
              <span className="mt-1 block text-[11px] text-ib-slate">
                Pode ficar em branco quando o orçamento saiu sem número fechado.
              </span>
            </label>
            <CampoData
              label="A proposta vale até"
              valor={validade}
              onChange={setValidade}
              ajuda="Proposta sem validade é proposta que nunca vence — e nunca é cobrada."
            />
          </div>
        ) : null}

        {tipo === "fechar" ? (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-ib-ink">Valor contratado (R$)</span>
              <input
                autoFocus
                inputMode="decimal"
                value={valor}
                disabled={semValor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="3.500,00"
                className="mt-1 w-full rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink disabled:bg-ib-papel disabled:text-ib-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
            </label>
            {/* O caso que fecha sem contrato existe e é comum: o assunto se resolveu, a
                pessoa foi encaminhada. Ele precisa de um jeito EXPLÍCITO de ser dito —
                senão vira campo em branco, indistinguível de esquecimento. */}
            <label className="flex items-start gap-2 text-xs text-ib-slate">
              <input
                type="checkbox"
                checked={semValor}
                onChange={(e) => setSemValor(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Este caso fechou <strong className="font-semibold text-ib-ink">sem contrato</strong> — o
                assunto se resolveu ou a pessoa foi encaminhada.
              </span>
            </label>
          </div>
        ) : null}

        {tipo === "perder" ? (
          <div className="mt-3 space-y-3">
            <Selecao
              label="Motivo"
              valor={categoria}
              onChange={(v) => setCategoria(v as MotivoPerda)}
              opcoes={MOTIVOS_DE_PERDA.map((m) => ({ valor: m, rotulo: MOTIVO_PERDA_LABEL[m] }))}
              ajuda="É a categoria que os relatórios somam. A frase abaixo é o que se lê."
            />
            <label className="block">
              <span className="text-xs font-semibold text-ib-ink">O que aconteceu</span>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="mt-1 w-full resize-y rounded-lg border border-ib-line px-3 py-2 text-sm text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
              />
              <span className="mt-1 block text-[11px] leading-relaxed text-ib-slate">
                É o que alguém vai ler daqui a seis meses tentando entender por que{" "}
                {nomeDoContato} não virou atendimento.
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} disabled={!pronto} onClick={confirmar}>
            {tipo === "propor" ? "Registrar proposta" : tipo === "fechar" ? "Fechar caso" : "Marcar como perdido"}
          </button>
        </div>
      </div>
    </div>
  );
}
