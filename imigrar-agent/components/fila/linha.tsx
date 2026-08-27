import Link from "next/link";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import { CLASSIFICACAO_LABEL, PRAZO_TIPO_LABEL, desde } from "@/lib/domain/rotulos";
import {
  diasDoRelogio,
  relogioApertado,
  rotuloPrazo,
  rotuloRelogio,
  type FaixaPrazo,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";
import { slaHorasDe } from "@/lib/operacao/limites";

/**
 * A LINHA DA FILA.
 *
 * Densidade acima de espaço em branco: é uma ferramenta de uso diário e repetitivo, e
 * quem a abre às 8h precisa varrer trinta linhas sem rolar. Sem card decorativo, sem
 * ilustração, sem gradiente — a hierarquia é carregada pela urgência.
 *
 * O IDIOMA vem primeiro, e em mono: o time precisa saber se consegue atender aquela
 * pessoa ANTES de abrir a conversa. Descobrir que a conversa é em árabe depois de abrir
 * e ler três parágrafos é o desperdício que este canto da linha evita.
 */

/** A cor mais forte da interface pertence ao prazo. Só a ele. */
const FAIXA_ESTILO: Record<FaixaPrazo, { pill: string; barra: string }> = {
  vencido: { pill: "bg-ib-danger text-white", barra: "bg-ib-danger" },
  critico: { pill: "bg-ib-danger/12 text-ib-danger ring-1 ring-inset ring-ib-danger/30", barra: "bg-ib-danger" },
  atencao: { pill: "bg-ib-warn/12 text-[#9A6212] ring-1 ring-inset ring-ib-warn/25", barra: "bg-ib-warn" },
  acompanhamento: { pill: "bg-slate-100 text-ib-slate", barra: "bg-slate-300" },
};

export function ChipIdioma({ idioma }: { idioma?: string | null }) {
  const nome = nomeDoIdioma(idioma);
  return (
    <span
      title={nome ? `Conversa em ${nome}` : "Idioma ainda não detectado"}
      className={`inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded px-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${
        idioma && idioma !== "pt"
          ? "bg-ib-bruma text-ib-carimbo ring-1 ring-inset ring-ib-mar/20"
          : "bg-slate-100 text-ib-slate"
      }`}
    >
      {idioma ?? "??"}
    </span>
  );
}

export function ContadorPrazo({ dias, faixa }: { dias: number; faixa: FaixaPrazo }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums ${FAIXA_ESTILO[faixa].pill}`}
    >
      {rotuloPrazo(dias)}
    </span>
  );
}

/**
 * SLA DE PRIMEIRO CONTATO — o relógio que corre do agente até a gente.
 *
 * Só aparece quando está estourado, e só enquanto ninguém assumiu. Um contador visível
 * em todas as linhas viraria paisagem; aparecendo só no atraso, ele é uma exceção — que
 * é o que ele deveria ser.
 */
function SlaEstourado({ lead, agora }: { lead: LeadDaFila; agora: Date }) {
  if (lead.assumidoEm) return null;
  const horas = (agora.getTime() - Date.parse(lead.createdAt)) / 3_600_000;
  const limite = slaHorasDe(lead.classificacao);
  if (!Number.isFinite(horas) || horas <= limite) return null;
  return (
    <span
      title={`Limite de ${limite}h para o primeiro contato humano neste tipo de caso`}
      className="inline-flex shrink-0 items-center rounded-md bg-ib-warn/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#9A6212] ring-1 ring-inset ring-ib-warn/25"
    >
      sem contato há {Math.floor(horas)}h
    </span>
  );
}

/**
 * O RELÓGIO DO CASO — o que corre contra o caso sem ser prazo processual: o início das
 * aulas, o contrato, o passaporte que vence.
 *
 * Aparece só quando a data já está dentro da janela, e NUNCA com a cor do prazo. Essa
 * cor pertence a multa, indeferimento e notificação de saída, e emprestá-la aqui faria
 * a fila inteira parecer urgente — que é o mesmo que nada parecer.
 */
function ChipRelogio({ lead, agora }: { lead: LeadDaFila; agora: Date }) {
  if (!relogioApertado(lead, agora)) return null;
  const dias = diasDoRelogio(lead, agora);
  if (dias === null) return null;
  return (
    <span
      title={lead.relogioDoCaso ?? "Relógio do caso — não é prazo processual"}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ib-bruma px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ib-carimbo ring-1 ring-inset ring-ib-mar/20"
    >
      <span aria-hidden="true">◷</span>
      {rotuloRelogio(dias)}
    </span>
  );
}

export function LinhaDaFila({
  lead,
  prazo,
  agora,
}: {
  lead: LeadDaFila;
  prazo?: { dias: number; faixa: FaixaPrazo };
  agora: Date;
}) {
  // O resumo tem duas linhas por contrato. Cortar aqui é melhor do que deixar a linha
  // crescer: uma fila em que cada item tem altura diferente não se varre com os olhos.
  const [linha1, linha2] = (lead.resumo ?? "").split("\n");

  return (
    <li className="relative">
      {prazo ? (
        <span className={`absolute inset-y-0 left-0 w-1 ${FAIXA_ESTILO[prazo.faixa].barra}`} aria-hidden="true" />
      ) : null}
      <Link
        href={`/dashboard/leads/${lead.id}`}
        className="flex flex-col gap-2 px-4 py-3 transition hover:bg-ib-papel focus:outline-none focus-visible:bg-ib-bruma focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ib-mar sm:flex-row sm:items-start sm:gap-4 sm:pl-5"
      >
        <div className="flex shrink-0 items-center gap-2 sm:w-[9.5rem]">
          <ChipIdioma idioma={lead.idioma} />
          <span className="truncate text-sm font-semibold text-ib-ink">
            {lead.nacionalidade ?? lead.clientType ?? "Nacionalidade —"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ib-ink">
            {lead.contactName ? `${lead.contactName} · ` : ""}
            <span className="text-ib-carimbo">
              {lead.modalidadeProvavel ?? lead.objetivo ?? "Modalidade a definir"}
            </span>
            {lead.prazoTipo ? (
              <span className="text-ib-slate"> · {PRAZO_TIPO_LABEL[lead.prazoTipo]}</span>
            ) : null}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ib-slate">
            {linha1 ? (
              <>
                {linha1}
                {linha2 ? <span className="block">{linha2}</span> : null}
              </>
            ) : (
              "Sem resumo ainda — abra para ler a conversa."
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:w-[15rem] sm:justify-end">
          <ChipRelogio lead={lead} agora={agora} />
          <SlaEstourado lead={lead} agora={agora} />
          {prazo ? <ContadorPrazo dias={prazo.dias} faixa={prazo.faixa} /> : null}
          <div className="text-right">
            <p className="font-mono text-xs tabular-nums text-ib-slate">
              {desde(lead.ultimoContatoEm, agora)}
            </p>
            <p className="truncate text-xs text-ib-slate">
              {lead.responsavelNome ?? "sem responsável"}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function EtiquetaClassificacao({ lead }: { lead: LeadDaFila }) {
  if (!lead.classificacao) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ib-slate">
        sem classificação
      </span>
    );
  }
  return (
    <span className="rounded-full bg-ib-bruma px-2 py-0.5 text-[11px] font-medium text-ib-carimbo">
      {CLASSIFICACAO_LABEL[lead.classificacao]}
    </span>
  );
}
