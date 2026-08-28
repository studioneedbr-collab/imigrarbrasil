"use client";

import { CLASSIFICACAO_LABEL, INTENCAO_LABEL, porQueImporta } from "@/lib/domain/rotulos";
import { qualificacaoFaltando } from "@/lib/domain/ficha";
import type { Lead } from "@/lib/domain/types";

/**
 * A QUALIDADE DO LEAD, EM UM BLOCO.
 *
 * Existiam três leituras da mesma coisa espalhadas pelo painel: o "score" numérico
 * herdado do funil comercial (que ninguém sabia interpretar — 43 de quê?), a lista do que
 * falta na ficha, e a frase do `porQueImporta`. Juntas elas respondem a pergunta que quem
 * organiza faz o dia inteiro: **este caso está pronto para o time pegar, e ele urge?**
 *
 * SÃO DOIS EIXOS DIFERENTES, e misturá-los num número só foi o erro do painel anterior:
 *
 *   · COMPLETUDE — quanto da ficha mínima já se sabe. É o que separa "posso ligar agora"
 *     de "ainda vou ter que perguntar três coisas". Cresce por trabalho de atendimento.
 *   · PRIORIDADE — o que pressiona. Prazo processual, relógio do caso, intenção
 *     declarada. Não tem nada a ver com completude: o caso mais urgente do painel costuma
 *     ser o de ficha mais vazia, porque acabou de chegar.
 *
 * Por isso a barra mede uma coisa e o selo diz a outra, e o texto embaixo é a conclusão
 * pronta — ler dez campos para chegar nela é trabalho que a tela deveria ter feito.
 */

const TOM_SELO: Record<"urgente" | "atencao" | "neutro" | "baixo", string> = {
  urgente: "bg-ib-danger text-white",
  atencao: "bg-ib-bruma text-ib-carimbo ring-1 ring-inset ring-ib-mar/25",
  neutro: "bg-ib-papel text-ib-ink ring-1 ring-inset ring-ib-line",
  baixo: "bg-ib-papel text-ib-slate ring-1 ring-inset ring-ib-line",
};

const TOM_ROTULO: Record<"urgente" | "atencao" | "neutro" | "baixo", string> = {
  urgente: "Urgente",
  atencao: "Atenção",
  neutro: "Fila normal",
  baixo: "Prioridade baixa",
};

const TOM_TEXTO: Record<"urgente" | "atencao" | "neutro" | "baixo", string> = {
  urgente: "border-ib-danger/30 bg-ib-danger/[0.06] text-ib-danger",
  atencao: "border-ib-mar/25 bg-ib-bruma/60 text-ib-carimbo",
  neutro: "border-ib-line bg-ib-papel/60 text-ib-ink",
  baixo: "border-ib-line bg-ib-papel/60 text-ib-slate",
};

export function QualidadeDoLead({
  lead,
  compacto,
  className = "",
}: {
  lead: Partial<Lead> & { fichaFaltando?: string[] };
  /** Sem a lista do que falta — para caber dentro de um card estreito. */
  compacto?: boolean;
  className?: string;
}) {
  // A lista pode vir pronta do servidor (a fila calcula uma vez para todos) ou ser
  // calculada aqui. Uma definição só de "ficha completa", em lib/domain/ficha.ts.
  const faltam = lead.fichaFaltando ?? qualificacaoFaltando(lead as Lead).faltam;
  const total = 6;
  const preenchidos = Math.max(0, total - faltam.length);
  const motivo = porQueImporta({ ...lead, fichaFaltando: faltam });

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
          Qualidade do lead
        </p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TOM_SELO[motivo.tom]}`}>
          {TOM_ROTULO[motivo.tom]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* A barra é de SEIS pedaços, e não uma porcentagem: "4 de 6" diz quantas
            perguntas ainda faltam; "67%" não diz nada acionável. */}
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < preenchidos
                  ? preenchidos === total
                    ? "bg-ib-success"
                    : "bg-ib-mar"
                  : "bg-ib-line"
              }`}
            />
          ))}
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ib-slate">
          {preenchidos}/{total}
        </span>
      </div>

      <p className={`mt-2 rounded-lg border px-3 py-2 text-[12px] leading-snug ${TOM_TEXTO[motivo.tom]}`}>
        {motivo.texto}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.classificacao ? <Sinal texto={CLASSIFICACAO_LABEL[lead.classificacao]} /> : null}
        {lead.intencao ? <Sinal texto={INTENCAO_LABEL[lead.intencao]} /> : null}
        {lead.entradaControleMigratorio ? <Sinal texto="entrou pelo controle migratório" /> : null}
        {faltam.length === 0 ? <Sinal texto="ficha completa" tom="bom" /> : null}
      </div>

      {!compacto && faltam.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[12px] leading-snug text-ib-slate">
          {faltam.map((f) => (
            <li key={f} className="flex gap-1.5">
              <span aria-hidden="true" className="text-ib-slate/60">
                ·
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Sinal({ texto, tom }: { texto: string; tom?: "bom" }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        tom === "bom"
          ? "bg-ib-success/10 text-ib-success ring-1 ring-inset ring-ib-success/25"
          : "bg-ib-papel text-ib-slate ring-1 ring-inset ring-ib-line"
      }`}
    >
      {texto}
    </span>
  );
}
