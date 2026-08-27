import Link from "next/link";
import { getRepository } from "@/lib/data";
import { Card, PageHeader, fmtDate } from "@/components/dashboard/ui";
import BotaoTratar from "./_tratar";
import type { TipoEventoOperacao } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * O QUE O AGENTE NÃO CONSEGUIU OUVIR.
 *
 * Quando a transcrição falha, o atendimento continua: a Ana pede, com cuidado, que a
 * pessoa escreva. É a degradação certa, e é exatamente por isso que ela é perigosa —
 * de fora não parece um erro. Mas quem manda áudio neste atendimento é quem tem
 * dificuldade de escrever, quem está com pressa e quem está com medo. Boa parte não
 * volta.
 *
 * Esta tela existe para que esse lead perdido tenha para onde ir: o áudio original fica
 * aqui, alguém do time ouve, e o atendimento é retomado por gente. Um áudio perdido é um
 * lead perdido — e antes disto ele sumia sem deixar rastro.
 */

/**
 * ESTA TELA É SÓ DE TRANSCRIÇÃO, AGORA.
 *
 * Ela atendia dois assuntos por um parâmetro na URL, e o contador da barra lateral
 * mandava as quedas do modelo para cá (`?tipo=deepseek_falhou`). Quem clicava procurando
 * entender por que a Ana estava estranha caía numa lista de áudios, não via nada com a
 * sua cara e ia embora. Falha de LLM tem tela própria: /dashboard/falhas-llm.
 */
const TIPO: TipoEventoOperacao = "transcricao_falhou";

export default async function AudiosPage({
  searchParams,
}: {
  searchParams: { todos?: string };
}) {
  const tipo = TIPO;
  const apenasPendentes = searchParams.todos !== "1";

  const eventos = await getRepository()
    .listEventosOperacao({ tipo, apenasPendentes, limit: 200 })
    .catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saúde da operação"
        title="Falhas de transcrição"
        description="A pessoa mandou uma mensagem de voz e o sistema não conseguiu ouvir. Ela recebeu um pedido para escrever — o que muita gente não faz. Ouça e retome o atendimento."
        actions={
          <Link
            href="/dashboard/falhas-llm"
            className="rounded-lg border border-ib-line bg-white px-3 py-1.5 text-xs font-semibold text-ib-slate transition hover:bg-ib-papel hover:text-ib-ink"
          >
            Ver falhas de LLM
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ib-line bg-ib-papel/70 px-5 py-3">
          <p className="text-sm font-semibold text-ib-ink">
            {apenasPendentes ? "Ainda não tratados" : "Todos os registros"}
          </p>
          <Link
            href={`/dashboard/audios${apenasPendentes ? "?todos=1" : ""}`}
            className="text-xs font-semibold text-ib-mar hover:underline"
          >
            {apenasPendentes ? "Ver também os já tratados" : "Ver só os pendentes"}
          </Link>
        </div>

        {eventos.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-ib-slate">
            {apenasPendentes
              ? "Nenhum áudio ficou sem transcrever. Toda mensagem de voz que chegou foi entendida e entrou na conversa como texto."
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
                          ouvido por {e.resolvidoPor}
                        </span>
                      ) : null}
                    </p>
                    {e.detalhe ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">{e.detalhe}</p>
                    ) : null}

                    {/* O áudio original, aqui mesmo. Sem isto a tela só informaria que se
                        perdeu alguma coisa — e informar uma perda sem dar como recuperá-la
                        é só angústia. */}
                    {e.mediaUrl ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls preload="none" src={e.mediaUrl} className="mt-2 w-full max-w-sm" />
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
