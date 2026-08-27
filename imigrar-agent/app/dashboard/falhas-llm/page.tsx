import Link from "next/link";
import { getRepository } from "@/lib/data";
import { Card, PageHeader, fmtDate } from "@/components/dashboard/ui";
import BotaoTratar from "../audios/_tratar";

export const dynamic = "force-dynamic";

/**
 * QUANDO O MODELO NÃO RESPONDEU — E A ANA VIROU UM MENU.
 *
 * A queda é elegante: a chamada ao provedor falha, o atendimento cai no motor
 * determinístico e a pessoa recebe resposta do mesmo jeito. É exatamente por isso que
 * ela precisa de uma tela. De fora nada parece errado — a conversa anda, o painel mostra
 * mensagem entrando e saindo — mas naquele turno a Ana deixou de conduzir e passou a
 * despachar. Quem estava contando um caso difícil recebeu um menu.
 *
 * ISTO NÃO É A TELA DE ÁUDIOS, e essa separação é o conserto de um erro concreto: o
 * contador "quedas do agente" da barra lateral apontava para /dashboard/audios. Falha de
 * transcrição e falha de LLM são dois problemas, com duas causas (uma é a OpenAI e o
 * arquivo de áudio; a outra é a chave, o saldo ou a instabilidade do provedor de
 * linguagem) e dois desfechos diferentes. Uma tela só para os dois ensinava a procurar
 * no lugar errado.
 */
export default async function FalhasLlmPage({
  searchParams,
}: {
  searchParams: { todos?: string };
}) {
  const apenasPendentes = searchParams.todos !== "1";

  const eventos = await getRepository()
    .listEventosOperacao({ tipo: "llm_falhou", apenasPendentes, limit: 200 })
    .catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saúde da operação"
        title="Falhas de LLM"
        description="A chamada ao modelo falhou e o atendimento caiu no motor determinístico. A pessoa recebeu resposta, mas a Ana não conduziu aquele turno. Se isso se repete, o lugar de olhar é a credencial ou a conta do provedor."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/integracoes"
              className="rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs font-semibold text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink"
            >
              Ver os provedores
            </Link>
            <Link
              href="/dashboard/audios"
              className="rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs font-semibold text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink"
            >
              Ver falhas de transcrição
            </Link>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ib-line bg-ib-papel/70 px-5 py-3">
          <p className="text-sm font-semibold text-ib-ink">
            {apenasPendentes ? "Ainda não tratadas" : "Todos os registros"}
          </p>
          <Link
            href={`/dashboard/falhas-llm${apenasPendentes ? "?todos=1" : ""}`}
            className="text-xs font-semibold text-ib-mar hover:underline"
          >
            {apenasPendentes ? "Ver também as já tratadas" : "Ver só as pendentes"}
          </Link>
        </div>

        {eventos.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-ib-slate">
            {apenasPendentes
              ? "O modelo não falhou nenhuma vez. Todas as respostas saíram dele, e não do motor determinístico."
              : "Nada registrado ainda."}
          </p>
        ) : (
          <ul className="divide-y divide-ib-line">
            {eventos.map((e) => (
              <li key={e.id} className={`px-5 py-3.5 ${e.resolvidoEm ? "opacity-55" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-medium text-ib-ink">
                        {e.contato?.nome ?? e.contato?.whatsappNumber ?? "contato desconhecido"}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-ib-slate">
                        {fmtDate(e.criadoEm)}
                      </span>
                      {e.resolvidoEm ? (
                        <span className="rounded-full bg-ib-success/12 px-2 py-0.5 text-[11px] font-medium text-[#15803D]">
                          tratada por {e.resolvidoPor}
                        </span>
                      ) : null}
                    </p>
                    {/* O erro cru do provedor. É feio, e é o que resolve: "Insufficient
                        Balance" e "401" pedem coisas completamente diferentes de quem lê. */}
                    {e.detalhe ? (
                      <p className="mt-1 break-words font-mono text-xs leading-relaxed text-ib-slate">
                        {e.detalhe}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {e.conversationId ? (
                      <Link
                        href={`/dashboard/conversations/${e.conversationId}`}
                        className="text-xs font-semibold text-ib-mar hover:underline"
                      >
                        Abrir conversa
                      </Link>
                    ) : null}
                    {!e.resolvidoEm ? <BotaoTratar id={e.id} /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
