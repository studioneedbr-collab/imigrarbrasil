import Link from "next/link";
import { ChipIdioma } from "@/components/fila/linha";
import { PRAZO_TIPO_LABEL, desde } from "@/lib/domain/rotulos";
import {
  diasDoRelogio,
  diasRestantes,
  faixaDoPrazo,
  relogioApertado,
  rotuloPrazo,
  rotuloRelogio,
  temPrazo,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";

/**
 * O CARD DO QUADRO.
 *
 * Carrega a mesma informação da linha da fila, pelo mesmo motivo: é com ela que se
 * escolhe o que pegar. Idioma primeiro (saber se dá para atender antes de abrir), nome,
 * nacionalidade, modalidade, responsável e há quanto tempo parado.
 *
 * A cor forte continua sendo SÓ do prazo processual — aqui dentro também. O relógio do
 * caso usa o chip discreto, e o resto do card não usa cor nenhuma. Um quadro onde todo
 * card grita é um quadro onde nada é urgente.
 */
export function CardDoAtendimento({ lead, agora }: { lead: LeadDaFila; agora: Date }) {
  const prazo = lead.prazoDataLimite ? diasRestantes(lead.prazoDataLimite, agora) : null;
  const relogio = relogioApertado(lead, agora) ? diasDoRelogio(lead, agora) : null;

  return (
    <article className="rounded-lg border border-ib-line bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-2">
        <ChipIdioma idioma={lead.idioma} />
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-ib-ink hover:underline"
        >
          {lead.contactName ?? lead.whatsappNumber}
        </Link>
      </div>

      <p className="mt-1 truncate text-xs text-ib-slate">
        {lead.nacionalidade ?? lead.clientType ?? "Nacionalidade —"}
        {" · "}
        <span className="text-ib-carimbo">
          {lead.modalidadeProvavel ?? lead.objetivo ?? "Modalidade a definir"}
        </span>
      </p>

      {prazo !== null || relogio !== null || temPrazo(lead) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {prazo !== null ? (
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                faixaDoPrazo(prazo) === "acompanhamento"
                  ? "bg-slate-100 text-ib-slate"
                  : "bg-ib-danger/12 text-ib-danger ring-1 ring-inset ring-ib-danger/30"
              }`}
            >
              {rotuloPrazo(prazo)}
            </span>
          ) : temPrazo(lead) ? (
            <span className="inline-flex items-center rounded-md bg-ib-danger px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              prazo a confirmar{lead.prazoTipo ? ` · ${PRAZO_TIPO_LABEL[lead.prazoTipo]}` : ""}
            </span>
          ) : null}
          {relogio !== null ? (
            <span
              title={lead.relogioDoCaso ?? "Relógio do caso — não é prazo processual"}
              className="inline-flex items-center gap-1 rounded-md bg-ib-bruma px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ib-carimbo ring-1 ring-inset ring-ib-mar/20"
            >
              <span aria-hidden="true">◷</span>
              {rotuloRelogio(relogio)}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ib-slate">
        <span className="truncate">{lead.responsavelNome ?? "sem responsável"}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {desde(lead.ultimoContatoEm, agora)}
        </span>
      </p>
    </article>
  );
}
