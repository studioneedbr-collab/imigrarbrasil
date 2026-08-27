import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { LinhaDaFila } from "@/components/fila/linha";
import ConcluirLembrete from "./_concluir";
import { carregarLeadsDaFila } from "@/lib/fila/carregar";
import { montarMeus, diasParado } from "@/lib/operacao/meus";
import { DIAS_PARA_CONSIDERAR_PARADO } from "@/lib/operacao/limites";
import { diasRestantes, faixaDoPrazo, type LeadDaFila } from "@/lib/fila/ordenacao";
import { desde } from "@/lib/domain/rotulos";

export const dynamic = "force-dynamic";

/**
 * MEUS ATENDIMENTOS.
 *
 * A fila responde "o que chegou". Esta tela responde "o que é meu, e o que está parado".
 *
 * A separação que carrega a tela é uma só: **quem está com a bola**. Em imigração o ciclo
 * é longo — a pessoa some três semanas juntando documento no consulado e volta, e isso é
 * o processo funcionando. O que não pode é o caso em que ELA está esperando uma resposta
 * nossa parecer igual ao caso em que NÓS estamos esperando ela. Um é dívida, o outro é
 * paciência.
 */

function Bloco({
  titulo,
  contagem,
  descricao,
  vazio,
  destaque,
  children,
}: {
  titulo: string;
  contagem: number;
  descricao?: string;
  vazio: string;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={`overflow-hidden ${destaque && contagem > 0 ? "ring-1 ring-ib-warn/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ib-line bg-ib-papel/70 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-ib-ink">{titulo}</h2>
          <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
            {contagem}
          </span>
        </div>
        {descricao ? <p className="text-xs text-ib-slate">{descricao}</p> : null}
      </div>
      {contagem === 0 ? (
        <p className="px-5 py-5 text-sm leading-relaxed text-ib-slate">{vazio}</p>
      ) : (
        children
      )}
    </Card>
  );
}

function Lista({ leads, agora }: { leads: LeadDaFila[]; agora: Date }) {
  return (
    <ul className="divide-y divide-ib-line">
      {leads.map((l) => (
        <LinhaDaFila
          key={l.id}
          lead={l}
          agora={agora}
          prazo={
            l.prazoDataLimite
              ? {
                  dias: diasRestantes(l.prazoDataLimite, agora),
                  faixa: faixaDoPrazo(diasRestantes(l.prazoDataLimite, agora)),
                }
              : undefined
          }
        />
      ))}
    </ul>
  );
}

export default async function MeusAtendimentosPage() {
  const agora = new Date();
  const session = await getSession();
  const [leads, lembretes] = await Promise.all([
    carregarLeadsDaFila(),
    getRepository().listLembretes({ apenasPendentes: true }).catch(() => []),
  ]);

  const meus = montarMeus(leads, lembretes, session?.sub ?? null, agora);
  const total = meus.comigo.length + meus.aguardandoCliente.length + meus.agendados.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acompanhamento"
        title="Meus atendimentos"
        description="O que está com você, separado por quem precisa agir. A fila mostra quem chegou; esta tela mostra quem está esperando."
      />

      {/* LEMBRETES DO DIA vêm antes de tudo: é a única coisa aqui que alguém marcou
          explicitamente para hoje, com um motivo escrito. */}
      {meus.paraHoje.length > 0 ? (
        <Card className="overflow-hidden ring-1 ring-ib-mar/30">
          <div className="border-b border-ib-line bg-ib-bruma/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">Retornos para hoje</h2>
            <p className="mt-0.5 text-xs text-ib-slate">
              Você agendou estes retornos. A nota é o que você escreveu na hora de agendar.
            </p>
          </div>
          <ul className="divide-y divide-ib-line">
            {meus.paraHoje.map(({ lembrete, lead }) => (
              <li key={lembrete.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {lead ? (
                      <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-ib-ink hover:underline">
                        {lead.contactName ?? lead.whatsappNumber}
                      </Link>
                    ) : (
                      <span className="text-ib-slate">lead removido</span>
                    )}
                    <span className="ml-2 font-mono text-xs tabular-nums text-ib-slate">{lembrete.quando}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ib-ink">{lembrete.nota}</p>
                </div>
                <ConcluirLembrete id={lembrete.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Bloco
        titulo="Aguardando meu retorno"
        contagem={meus.comigo.length}
        descricao="A pessoa falou por último. Quem espera há mais tempo vem primeiro."
        vazio="Nenhuma mensagem esperando resposta sua. Toda conversa sua está com a bola do outro lado."
      >
        <Lista leads={meus.comigo} agora={agora} />
      </Bloco>

      <Bloco
        titulo="Aguardando resposta do cliente"
        contagem={meus.aguardandoCliente.length}
        descricao="Você respondeu por último. O contador é de silêncio, não de atraso."
        vazio="Nada esperando o cliente."
      >
        <Lista leads={meus.aguardandoCliente} agora={agora} />
      </Bloco>

      <Bloco
        titulo="Reunião agendada"
        contagem={meus.agendados.length}
        vazio="Nenhuma reunião marcada."
      >
        <Lista leads={meus.agendados} agora={agora} />
      </Bloco>

      <Bloco
        titulo={`Parados há mais de ${DIAS_PARA_CONSIDERAR_PARADO} dias`}
        contagem={meus.parados.length}
        destaque
        descricao="Estes também aparecem nos blocos acima — aqui é o alerta, não uma lista separada."
        vazio={`Nada seu está parado há mais de ${DIAS_PARA_CONSIDERAR_PARADO} dias.`}
      >
        <ul className="divide-y divide-ib-line">
          {meus.parados.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <Link href={`/dashboard/leads/${l.id}`} className="min-w-0 text-sm font-medium text-ib-ink hover:underline">
                {l.contactName ?? l.whatsappNumber}
                <span className="ml-2 font-normal text-ib-slate">
                  {l.ultimaMensagemDe === "user" ? "esperando você" : "esperando o cliente"}
                </span>
              </Link>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[#9A6212]">
                {diasParado(l, agora)} dias sem movimento · {desde(l.ultimoContatoEm, agora)}
              </span>
            </li>
          ))}
        </ul>
      </Bloco>

      {total === 0 && meus.paraHoje.length === 0 ? (
        <p className="px-1 text-sm leading-relaxed text-ib-slate">
          Você ainda não assumiu nenhum atendimento. Abra a{" "}
          <Link href="/dashboard" className="underline">
            fila
          </Link>{" "}
          e use <strong>Assumir atendimento</strong> num caso — ele passa a aparecer aqui.
        </p>
      ) : null}
    </div>
  );
}
