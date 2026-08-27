import Link from "next/link";
import { getRepository } from "@/lib/data";
import { Card, PageHeader, fmtDate } from "@/components/dashboard/ui";
import BotaoTratar from "./_tratar";
import type { TipoEventoOperacao } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/**
 * O QUE O AGENTE NÃO CONSEGUIU OUVIR — E O QUE ELE DEIXOU DE PENSAR.
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

const TIPOS: Record<TipoEventoOperacao, { titulo: string; explica: string }> = {
  transcricao_falhou: {
    titulo: "Áudios não transcritos",
    explica:
      "A pessoa mandou uma mensagem de voz e o sistema não conseguiu ouvir. Ela recebeu um pedido para escrever — o que muita gente não faz. Ouça e retome o atendimento.",
  },
  deepseek_falhou: {
    titulo: "Quedas do agente",
    explica:
      "A chamada ao modelo falhou e o atendimento caiu no motor determinístico. A pessoa recebeu resposta, mas a Ana virou um menu naquele turno. Se isso se repete, é a chave ou a conta do provedor.",
  },
  documento_falhou: {
    titulo: "Documentos não lidos",
    explica: "Um anexo chegou mas o conteúdo não pôde ser lido.",
  },
};

export default async function AudiosPage({
  searchParams,
}: {
  searchParams: { tipo?: string; todos?: string };
}) {
  const tipo = (searchParams.tipo as TipoEventoOperacao) ?? "transcricao_falhou";
  const meta = TIPOS[tipo] ?? TIPOS.transcricao_falhou;
  const apenasPendentes = searchParams.todos !== "1";

  const eventos = await getRepository()
    .listEventosOperacao({ tipo, apenasPendentes, limit: 200 })
    .catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saúde da operação"
        title={meta.titulo}
        description={meta.explica}
        actions={
          <div className="inline-flex items-center gap-0.5 rounded-xl border border-ib-line bg-white p-1">
            {(["transcricao_falhou", "deepseek_falhou"] as TipoEventoOperacao[]).map((t) => (
              <Link
                key={t}
                href={`/dashboard/audios?tipo=${t}`}
                aria-current={t === tipo ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  t === tipo ? "bg-ib-mar text-white" : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
                }`}
              >
                {t === "transcricao_falhou" ? "Áudios" : "Quedas do agente"}
              </Link>
            ))}
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ib-line bg-ib-papel/70 px-5 py-3">
          <p className="text-sm font-semibold text-ib-ink">
            {apenasPendentes ? "Ainda não tratados" : "Todos os registros"}
          </p>
          <Link
            href={`/dashboard/audios?tipo=${tipo}${apenasPendentes ? "&todos=1" : ""}`}
            className="text-xs font-semibold text-ib-mar hover:underline"
          >
            {apenasPendentes ? "Ver também os já tratados" : "Ver só os pendentes"}
          </Link>
        </div>

        {eventos.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-ib-slate">
            {apenasPendentes
              ? tipo === "transcricao_falhou"
                ? "Nenhum áudio ficou sem transcrever. Toda mensagem de voz que chegou foi entendida e entrou na conversa como texto."
                : "O agente não caiu nenhuma vez. Todas as respostas saíram do modelo, não do motor determinístico."
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
