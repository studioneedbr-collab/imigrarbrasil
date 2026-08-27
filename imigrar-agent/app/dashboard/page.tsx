import Link from "next/link";
import AutoRefresh from "@/components/dashboard/auto-refresh";
import { Card, Icon, PageHeader, btnGhost } from "@/components/dashboard/ui";
import { LinhaDaFila } from "@/components/fila/linha";
import { AvisoDeCorte, Paginacao } from "@/components/dashboard/paginacao";
import { carregarFila } from "@/lib/fila/carregar";
import { TETO_DE_CARGA, avaliarCorte, paginaDaBusca, paginar } from "@/lib/fila/paginacao";
import { CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

export const dynamic = "force-dynamic";

/**
 * A TELA INICIAL EXISTE PARA RESPONDER UMA PERGUNTA: O QUE VENCE PRIMEIRO?
 *
 * Não é uma tabela ordenada por data, e não é um funil. É uma fila de trabalho em três
 * blocos, e o painel que originou este código fazia o contrário de cada um deles:
 * ordenava por lead mais recente, media conversão e tratava todo contato como
 * oportunidade equivalente. Aqui uma boa parte dos casos de maior valor chega com prazo
 * processual correndo — multa, indeferimento, notificação de saída —, e prazo assim é
 * curto e fatal. Ordenar por "mais recente" faz alguém perder um prazo.
 *
 * A regra de ordem mora em lib/fila/ordenacao.ts, com teste. Esta página só a desenha.
 */

function Bloco({
  titulo,
  contagem,
  descricao,
  tom = "normal",
  children,
}: {
  titulo: string;
  contagem: number;
  descricao?: string;
  tom?: "urgente" | "normal";
  children: React.ReactNode;
}) {
  const urgente = tom === "urgente";
  return (
    <section aria-label={titulo}>
      <Card className="overflow-hidden">
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${
            urgente ? "bg-ib-danger text-white" : "border-b border-ib-line bg-ib-papel/70"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <h2 className={`text-sm font-semibold ${urgente ? "text-white" : "text-ib-ink"}`}>
              {titulo}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs tabular-nums ${
                urgente ? "bg-white/20 text-white" : "bg-white text-ib-slate ring-1 ring-inset ring-ib-line"
              }`}
            >
              {contagem}
            </span>
          </div>
          {descricao ? (
            <p className={`text-xs ${urgente ? "text-white/85" : "text-ib-slate"}`}>{descricao}</p>
          ) : null}
        </div>
        {children}
      </Card>
    </section>
  );
}

/** Estado vazio é instrução, não decoração — diz o que aquele vazio significa. */
function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm leading-relaxed text-ib-slate">{children}</p>;
}

export default async function FilaPage({
  searchParams,
}: {
  searchParams?: { p?: string };
}) {
  const agora = new Date();
  const { fila, total } = await carregarFila(agora, { limite: TETO_DE_CARGA });
  const corte = avaliarCorte(fila.aConfirmar.length + fila.correndo.length + fila.normal.length + fila.filtradas.length, total);

  // SÓ O BLOCO 3 PAGINA. Os dois de prazo são pequenos por natureza e são exatamente o
  // que não pode sumir atrás de um botão: quem tem defesa a protocolar não vai para a
  // página 2.
  const pagina = paginar(fila.normal, paginaDaBusca(searchParams?.p));

  const vencidos = fila.correndo.filter((i) => i.faixa === "vencido").length;
  const criticos = fila.correndo.filter((i) => i.faixa === "critico").length;

  const descricao =
    fila.aConfirmar.length > 0
      ? "Três blocos, nesta ordem: prazo a confirmar, prazos correndo e o resto do atendimento. Conversas sem caso concreto não aparecem aqui — estão em Filtradas."
      : "Dois blocos: prazos correndo e o resto do atendimento. Nenhum prazo esperando confirmação no momento. Conversas sem caso concreto não aparecem aqui — estão em Filtradas.";

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />

      <AvisoDeCorte corte={corte} />

      <PageHeader
        eyebrow="Fila de trabalho"
        title="O que vence primeiro"
        // A descrição acompanha o que está na tela. Ela prometia três blocos mesmo quando
        // o primeiro tinha sumido por estar vazio — e um texto que descreve uma tela que
        // não existe faz o leitor procurar o que não está lá.
        description={descricao}
        actions={
          <>
            <Link href="/dashboard/atendimentos" className={btnGhost}>
              <Icon name="check" className="h-4 w-4" />
              Quadro
            </Link>
            <Link href="/dashboard/filtradas" className={btnGhost}>
              <Icon name="search" className="h-4 w-4" />
              Filtradas ({fila.filtradas.length})
            </Link>
            <Link href="/dashboard/metricas" className={btnGhost}>
              <Icon name="activity" className="h-4 w-4" />
              Métricas
            </Link>
          </>
        }
      />

      {/* PRAZOS PERDIDOS: precisa ser zero, e precisa estar visível. Só aparece quando
          existe — um contador permanente em "0" vira mobília e some da vista. */}
      {vencidos > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm font-medium text-ib-danger"
        >
          {vencidos === 1
            ? "1 prazo já venceu e o caso continua aberto."
            : `${vencidos} prazos já venceram e os casos continuam abertos.`}{" "}
          Estão no topo do bloco de prazos correndo, marcados como vencidos.
        </div>
      ) : null}

      {/* ── BLOCO 1 ── Incomoda enquanto tiver item; some quando não tiver. */}
      {fila.aConfirmar.length > 0 ? (
        <Bloco
          titulo="Prazo a confirmar"
          contagem={fila.aConfirmar.length}
          tom="urgente"
          descricao="Ligue, confirme a data com a pessoa e registre. Sem data, não há contagem."
        >
          <ul className="divide-y divide-ib-line">
            {fila.aConfirmar.map((lead) => (
              <LinhaDaFila key={lead.id} lead={lead} agora={agora} />
            ))}
          </ul>
          <p className="border-t border-ib-line bg-ib-papel/60 px-5 py-2.5 text-xs leading-relaxed text-ib-slate">
            O agente apenas <strong>sinalizou</strong> que existe prazo. Ele não calcula
            datas de propósito: quem recebeu a notificação raramente sabe a data de cabeça,
            e um contador em cima de data errada é como se perde um prazo.
          </p>
        </Bloco>
      ) : null}

      {/* ── BLOCO 2 ── */}
      <Bloco
        titulo="Prazos correndo"
        contagem={fila.correndo.length}
        descricao={
          criticos > 0 ? `${criticos} em situação crítica (3 dias ou menos)` : undefined
        }
      >
        {fila.correndo.length === 0 ? (
          <Vazio>
            Nenhum prazo confirmado em aberto. Isso significa que ninguém do time está com
            um relógio correndo — não que não existam prazos: os que chegaram hoje e ainda
            não foram confirmados aparecem no bloco acima.
          </Vazio>
        ) : (
          <ul className="divide-y divide-ib-line">
            {fila.correndo.map(({ lead, diasRestantes, faixa }) => (
              <LinhaDaFila
                key={lead.id}
                lead={lead}
                agora={agora}
                prazo={{ dias: diasRestantes, faixa }}
              />
            ))}
          </ul>
        )}
      </Bloco>

      {/* ── BLOCO 3 ── */}
      <Bloco
        titulo="Fila normal"
        contagem={fila.normal.length}
        descricao="Judicial primeiro; dentro de cada grupo, o mais parado no topo."
      >
        {fila.normal.length === 0 ? (
          <Vazio>
            Nada esperando atendimento. Toda conversa com caso concreto ou já está com um
            responsável, ou foi fechada. Vale abrir <Link className="underline" href="/dashboard/filtradas">Filtradas</Link>{" "}
            e conferir por amostragem o que o agente descartou.
          </Vazio>
        ) : (
          <>
            <ul className="divide-y divide-ib-line">
              {pagina.itens.map((lead) => (
                <LinhaDaFila key={lead.id} lead={lead} agora={agora} />
              ))}
            </ul>
            <Paginacao pagina={pagina} base="/dashboard" rotulo="atendimentos" />
          </>
        )}
      </Bloco>

      <Resumo normal={fila.normal} />
    </div>
  );
}

/** Uma linha de contagem por classificação. Sem gráfico: é conferência, não análise. */
function Resumo({ normal }: { normal: LeadDaFila[] }) {
  const grupos = new Map<string, number>();
  for (const l of normal) {
    const k = l.classificacao ? CLASSIFICACAO_LABEL[l.classificacao] : "sem classificação";
    grupos.set(k, (grupos.get(k) ?? 0) + 1);
  }
  if (grupos.size === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ib-slate">
      {Array.from(grupos, ([k, v]) => (
        <span key={k}>
          {k}: <span className="font-mono tabular-nums text-ib-ink">{v}</span>
        </span>
      ))}
    </p>
  );
}
