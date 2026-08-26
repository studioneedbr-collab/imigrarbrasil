import Link from "next/link";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { ChipIdioma } from "@/components/fila/linha";
import BotaoResgatar from "./_resgatar";
import { carregarFila } from "@/lib/fila/carregar";
import { CLASSIFICACAO_AJUDA, CLASSIFICACAO_LABEL, desde } from "@/lib/domain/rotulos";
import { CLASSIFICACOES_FILTRADAS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * CONVERSAS FILTRADAS.
 *
 * Existe para AUDITORIA, não para trabalho. Alguém revisa por amostragem se o agente
 * está descartando gente que não deveria — e devolve à fila quem ele descartou por
 * engano.
 *
 * É a defesa contra o modo de falhar mais perigoso deste produto: um agente que filtra
 * demais parece ótimo nos números (pouca conversa chegando ao time) e está destruindo o
 * negócio em silêncio. A taxa de resgate, alimentada por esta tela, é o único jeito de
 * perceber isso cedo.
 */
export default async function FiltradasPage() {
  const agora = new Date();
  const { fila } = await carregarFila(agora);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auditoria"
        title="Conversas filtradas"
        description="O que o agente tirou da frente do time. Revise por amostragem: se alguém aqui tinha caso, devolva à fila — é assim que se descobre um agente descartando demais."
      />

      {fila.filtradas.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm leading-relaxed text-ib-slate">
            Nenhuma conversa foi filtrada até agora. Ou o agente ainda não classificou
            nada, ou todo mundo que escreveu tinha caso concreto — vale conferir a{" "}
            <Link href="/dashboard" className="underline">
              fila
            </Link>{" "}
            para saber qual dos dois.
          </p>
        </Card>
      ) : (
        CLASSIFICACOES_FILTRADAS.map((classificacao) => {
          const leads = fila.filtradas.filter((l) => l.classificacao === classificacao);
          if (leads.length === 0) return null;
          return (
            <Card key={classificacao} className="overflow-hidden">
              <div className="border-b border-ib-line bg-ib-papel/70 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-semibold text-ib-ink">
                    {CLASSIFICACAO_LABEL[classificacao]}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
                    {leads.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ib-slate">{CLASSIFICACAO_AJUDA[classificacao]}</p>
              </div>
              <ul className="divide-y divide-ib-line">
                {leads.map((lead) => {
                  const [linha1, linha2] = (lead.resumo ?? "").split("\n");
                  return (
                    <li
                      key={lead.id}
                      className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ChipIdioma idioma={lead.idioma} />
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="truncate text-sm font-semibold text-ib-ink hover:underline"
                          >
                            {lead.contactName ?? lead.whatsappNumber}
                          </Link>
                          <span className="shrink-0 text-xs text-ib-slate">
                            {lead.nacionalidade ?? "—"} · {desde(lead.ultimoContatoEm, agora)}
                          </span>
                          {lead.resgatadoEm ? (
                            <span className="shrink-0 rounded-full bg-ib-success/12 px-2 py-0.5 text-[11px] font-medium text-[#15803D]">
                              já resgatado antes
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[13px] leading-snug text-ib-slate">
                          {linha1 ?? "Sem resumo."}
                          {linha2 ? <span className="block">{linha2}</span> : null}
                        </p>
                      </div>
                      <BotaoResgatar leadId={lead.id} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
