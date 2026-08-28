"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChipIdioma, Nacionalidade } from "@/components/fila/linha";
import { QualidadeDoLead } from "@/components/atendimentos/qualidade";
import { Selecao } from "@/components/dashboard/campos";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import {
  AINDA_NAO,
  AINDA_NAO_AJUDA,
  CLASSIFICACAO_LABEL,
  PRAZO_TIPO_LABEL,
  desde,
  rotuloContato,
} from "@/lib/domain/rotulos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import {
  diasDoRelogio,
  diasRestantes,
  relogioApertado,
  rotuloPrazo,
  rotuloRelogio,
  temPrazo,
  type LeadDaFila,
} from "@/lib/fila/ordenacao";
import type { EtapaCrm, FunilCrm } from "@/lib/domain/types";

/**
 * O RESUMO DO CASO, SEM SAIR DO QUADRO.
 *
 * No quadro ninguém está atendendo — está organizando. E organizar significa espiar dez
 * casos seguidos para decidir o que vai para qual coluna e quem pega o quê. Antes cada
 * espiada custava duas navegações: entrar na página do lead e voltar, com o quadro
 * remontando no caminho e a rolagem se perdendo.
 *
 * Então o que este modal mostra é exatamente o que se olha para DECIDIR, e nada além:
 * quem é, em que língua fala, de onde é, onde está, o que quer, o que pressiona o caso,
 * quem está com ele, há quanto tempo parou e o que ainda falta perguntar. Não tem
 * formulário: quem vai editar ficha vai para a página do caso, e tem o botão para isso.
 *
 * "VER CONVERSA" É A ÚNICA SAÍDA QUE NAVEGA, e ela existe porque em algum momento a
 * pessoa realmente quer ler o que foi dito. Uma navegação, no fim de dez espiadas, em vez
 * de vinte.
 */
export function ResumoDoLead({
  lead,
  agora,
  onFechar,
  onAssumir,
  assumindo,
  funis,
  etapas,
  onMover,
}: {
  lead: LeadDaFila;
  agora: Date;
  onFechar: () => void;
  onAssumir: (lead: LeadDaFila) => void;
  assumindo: boolean;
  /** Do CRM. Sem eles o modal continua sendo só resumo (é como a fila o usa). */
  funis?: FunilCrm[];
  etapas?: EtapaCrm[];
  onMover?: (lead: LeadDaFila, etapa: EtapaCrm) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  // ESC fecha, e o foco entra na caixa. Sem isso o teclado continua navegando o quadro
  // atrás do modal — e quem usa teclado fica lendo um card que não é o que está na tela.
  useEffect(() => {
    caixa.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const contato = rotuloContato(lead);
  const prazo = lead.prazoDataLimite ? diasRestantes(lead.prazoDataLimite, agora) : null;
  const relogio = relogioApertado(lead, agora) ? diasDoRelogio(lead, agora) : null;
  const faltam = lead.fichaFaltando ?? [];
  const jaTemResponsavel = !!lead.responsavelId;
  const statusAtual = lead.atendimentoStatus ?? "novo";
  const podeMover = !!onMover && !!funis?.length && !!etapas?.length;
  const etapaAtual = etapas?.find(
    (e) => e.id === lead.etapaId && !e.arquivada && e.status === statusAtual,
  );
  const funilAtual =
    funis?.find((f) => f.id === (etapaAtual?.funilId ?? lead.funilId)) ??
    funis?.find((f) => f.padrao && !f.arquivado) ??
    funis?.[0];
  const doFunil = (etapas ?? [])
    .filter((e) => e.funilId === funilAtual?.id && !e.arquivada)
    .sort((a, b) => a.ordem - b.ordem);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ib-ink/40 p-4"
      onClick={onFechar}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={`Resumo de ${contato.texto}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-lg focus:outline-none"
      >
        {/* ── QUEM É ── */}
        <header className="border-b border-ib-line px-5 py-4">
          <div className="flex items-center gap-2">
            <ChipIdioma idioma={lead.idioma} />
            <h2
              className={`min-w-0 flex-1 truncate text-base font-semibold ${
                contato.conhecido ? "text-ib-ink" : "text-ib-slate"
              }`}
            >
              {contato.texto}
            </h2>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-ib-slate transition hover:bg-ib-papel"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-ib-slate">
            {lead.idioma ? `Conversa em ${nomeDoIdioma(lead.idioma)}` : AINDA_NAO_AJUDA}
          </p>
        </header>

        <div className="space-y-4 px-5 py-4">
          {/* ── DE ONDE É, ONDE ESTÁ, O QUE QUER ── */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Campo rotulo="Nacionalidade">
              <Nacionalidade lead={lead} className="font-medium" />
            </Campo>
            <Campo rotulo="Onde está agora">
              {lead.localizacao === "exterior"
                ? lead.paisExterior ?? "No exterior"
                : lead.region ?? (lead.localizacao === "brasil" ? "No Brasil" : null)}
            </Campo>
            <Campo rotulo="Modalidade provável">
              {lead.modalidadeProvavel ?? lead.objetivo}
            </Campo>
            <Campo rotulo="Classificação">
              {lead.classificacao ? CLASSIFICACAO_LABEL[lead.classificacao] : null}
            </Campo>
          </dl>

          {/* ── O RESUMO, EM DUAS LINHAS ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
              Resumo
            </p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-snug text-ib-ink">
              {lead.resumo?.trim() || "Sem resumo ainda — abra a conversa para ler."}
            </p>
          </div>

          {/* ── O RELÓGIO. Cor forte só para prazo processual, aqui como em todo lugar. ── */}
          {prazo !== null || temPrazo(lead) || relogio !== null || lead.relogioDoCaso ? (
            <div className="rounded-lg border border-ib-line bg-ib-papel/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
                Prazo
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {prazo !== null ? (
                  <span className="inline-flex items-center rounded-md bg-ib-danger/12 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-ib-danger ring-1 ring-inset ring-ib-danger/30">
                    {rotuloPrazo(prazo)}
                  </span>
                ) : temPrazo(lead) ? (
                  <span className="inline-flex items-center rounded-md bg-ib-danger px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                    prazo a confirmar
                    {lead.prazoTipo ? ` · ${PRAZO_TIPO_LABEL[lead.prazoTipo]}` : ""}
                  </span>
                ) : null}
                {relogio !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-ib-bruma px-2 py-0.5 font-mono text-[11px] font-semibold text-ib-carimbo ring-1 ring-inset ring-ib-mar/20">
                    <span aria-hidden="true">◷</span>
                    {rotuloRelogio(relogio)}
                  </span>
                ) : null}
              </div>
              {lead.relogioDoCaso ? (
                <p className="mt-1.5 text-[12px] leading-snug text-ib-slate">
                  “{lead.relogioDoCaso}”
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── QUEM ESTÁ COM ELE, E HÁ QUANTO TEMPO PAROU ── */}
          <dl className="grid grid-cols-2 gap-x-4 text-sm">
            <Campo rotulo="Responsável">{lead.responsavelNome}</Campo>
            <Campo rotulo="Parado há">
              <span className="font-mono tabular-nums">
                {desde(lead.ultimoContatoEm, agora)}
              </span>
            </Campo>
          </dl>

          {/* ── A QUALIDADE. Completude e prioridade, que são eixos diferentes: o caso
               mais urgente do painel costuma ser o de ficha mais vazia, porque acabou de
               chegar. Ver components/atendimentos/qualidade.tsx. ── */}
          <QualidadeDoLead
            lead={{ ...lead, fichaFaltando: faltam }}
            className="rounded-lg border border-ib-line bg-ib-papel/40 px-3 py-2.5"
          />

          {/* ── ONDE ELE ESTÁ NO CRM — e para onde vai, sem sair daqui. ── */}
          {podeMover ? (
            <div className="rounded-lg border border-ib-line bg-white px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
                Lugar no CRM
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Selecao
                  label="Funil"
                  compacto
                  valor={funilAtual?.id ?? ""}
                  onChange={(id) => {
                    // Trocar de funil leva o caso para a primeira etapa do funil novo que
                    // descreva o status em que ele está: mudar de quadro não pode mudar,
                    // de carona, se o atendimento está aberto ou fechado.
                    const destino =
                      (etapas ?? []).find(
                        (e) => e.funilId === id && !e.arquivada && e.status === statusAtual,
                      ) ?? (etapas ?? []).find((e) => e.funilId === id && !e.arquivada);
                    if (destino) onMover?.(lead, destino);
                  }}
                  opcoes={(funis ?? [])
                    .filter((f) => !f.arquivado)
                    .map((f) => ({ valor: f.id, rotulo: f.nome }))}
                />
                <Selecao
                  label="Etapa"
                  compacto
                  valor={etapaAtual?.id ?? ""}
                  placeholder="pela situação do caso"
                  onChange={(id) => {
                    const destino = (etapas ?? []).find((e) => e.id === id);
                    if (destino) onMover?.(lead, destino);
                  }}
                  opcoes={doFunil.map((e) => ({
                    valor: e.id,
                    rotulo: e.nome,
                    ajuda: e.ajuda ?? undefined,
                  }))}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ib-slate">
                Mover aqui é a mesma ação de arrastar o card: uma etapa de desfecho encerra
                o caso, e “perdido” continua pedindo o motivo.
              </p>
            </div>
          ) : null}
        </div>

        {/* ── O RODAPÉ. "Ver conversa" é a única saída que navega. ── */}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-ib-line px-5 py-3">
          <button type="button" className={btnGhost} onClick={onFechar}>
            Fechar
          </button>
          <Link href={`/dashboard/conversations/${lead.conversationId}`} className={btnGhost}>
            Ver conversa
          </Link>
          <button
            type="button"
            className={btnPrimary}
            disabled={assumindo || jaTemResponsavel}
            title={jaTemResponsavel ? `Já é de ${lead.responsavelNome ?? "alguém do time"}` : undefined}
            onClick={() => onAssumir(lead)}
          >
            {jaTemResponsavel ? "Já tem responsável" : assumindo ? "Assumindo…" : "Assumir atendimento"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Um campo do resumo. O vazio é um traço com explicação, nunca a palavra do rótulo
 * repetida nem um espaço em branco — ver lib/domain/rotulos.ts.
 */
function Campo({ rotulo, children }: { rotulo: string; children?: React.ReactNode }) {
  const vazio = children === null || children === undefined || children === "";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
        {rotulo}
      </dt>
      <dd
        className={`mt-0.5 truncate ${vazio ? "text-ib-slate" : "text-ib-ink"}`}
        title={vazio ? AINDA_NAO_AJUDA : undefined}
      >
        {vazio ? AINDA_NAO : children}
      </dd>
    </div>
  );
}
