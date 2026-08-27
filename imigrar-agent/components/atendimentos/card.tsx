import { ChipIdioma, Nacionalidade } from "@/components/fila/linha";
import { AINDA_NAO_AJUDA, PRAZO_TIPO_LABEL, desde, rotuloContato } from "@/lib/domain/rotulos";
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
 *
 * CLICAR ABRE UM RESUMO, NÃO A CONVERSA.
 *
 * Antes o card era um link para a página do caso, e sair do quadro para espiar um card
 * custava duas navegações — ida e volta, com o quadro remontando no caminho. Só que no
 * quadro ninguém está atendendo: está ORGANIZANDO, e organizar dez casos significa espiar
 * dez casos. Quem quer mesmo entrar na conversa tem o botão no rodapé do resumo, que é
 * uma navegação em vez de vinte.
 */
export function CardDoAtendimento({
  lead,
  agora,
  onAbrir,
}: {
  lead: LeadDaFila;
  agora: Date;
  /** Abre o resumo do lead. Sem ela o card é só leitura (usado fora do quadro). */
  onAbrir?: (lead: LeadDaFila) => void;
}) {
  const prazo = lead.prazoDataLimite ? diasRestantes(lead.prazoDataLimite, agora) : null;
  const relogio = relogioApertado(lead, agora) ? diasDoRelogio(lead, agora) : null;

  const contato = rotuloContato(lead);

  return (
    <article
      onClick={onAbrir ? () => onAbrir(lead) : undefined}
      onKeyDown={
        onAbrir
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAbrir(lead);
              }
            }
          : undefined
      }
      role={onAbrir ? "button" : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      aria-label={onAbrir ? `Abrir o resumo de ${contato.texto}` : undefined}
      className={`rounded-lg border border-ib-line bg-white p-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
        onAbrir
          ? "transition hover:border-ib-mar/40 hover:bg-ib-papel focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <ChipIdioma idioma={lead.idioma} />
        <span
          title={contato.conhecido ? contato.texto : AINDA_NAO_AJUDA}
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
            contato.conhecido ? "text-ib-ink" : "text-ib-slate"
          }`}
        >
          {contato.texto}
        </span>
      </div>

      <p className="mt-1 truncate text-xs text-ib-slate">
        <Nacionalidade lead={lead} />
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
