import Link from "next/link";
import { getRepository } from "@/lib/data";
import { getSession } from "@/lib/auth/guard";
import { podeExportar } from "@/lib/auth/papeis";
import { Card, Icon, PageHeader, btnGhost } from "@/components/dashboard/ui";
import { carregarLeadsDaFila } from "@/lib/fila/carregar";
import { calcularMetricas } from "@/lib/metricas";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import { CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import { rotuloPrazo, diasRestantes } from "@/lib/fila/ordenacao";

export const dynamic = "force-dynamic";

/**
 * AS MÉTRICAS DESTE TIME.
 *
 * O painel que originou este código media receita, ticket médio e conversão. Nada disso
 * está aqui, de propósito: o que prova o valor deste produto é quanto tempo do time ele
 * economizou — e, do outro lado, se ele economizou tempo demais.
 *
 * Duas leituras merecem atenção de quem abrir esta tela:
 *
 *   · FILTRADAS é o número que justifica o projeto. São as conversas que o time não
 *     precisou olhar.
 *   · TAXA DE RESGATE é o número que protege o projeto. Se ela sobe, o agente está
 *     descartando gente que deveria ter chegado ao time — e essa falha, sem esta
 *     métrica, parece sucesso.
 */

const PERIODOS = [
  { key: "7d", label: "7 dias", dias: 7 },
  { key: "30d", label: "30 dias", dias: 30 },
  { key: "90d", label: "90 dias", dias: 90 },
] as const;

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function duracao(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} dias`;
}

function Numero({
  label,
  valor,
  nota,
  tom = "normal",
}: {
  label: string;
  valor: string;
  nota?: string;
  tom?: "normal" | "alerta" | "bom";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ib-slate">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          tom === "alerta" ? "text-ib-danger" : tom === "bom" ? "text-ib-success" : "text-ib-ink"
        }`}
      >
        {valor}
      </p>
      {nota ? <p className="mt-1 text-xs leading-relaxed text-ib-slate">{nota}</p> : null}
    </div>
  );
}

function Barras({ rows }: { rows: { label: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-ib-slate">Nada no período.</p>;
  }
  return (
    <ul className="space-y-2.5 p-5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ib-ink">{r.label}</span>
            <span className="font-mono text-xs tabular-nums text-ib-slate">{r.total}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ib-papel">
            <div
              className="h-full rounded-full bg-ib-carimbo"
              style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const periodo = PERIODOS.find((p) => p.key === searchParams.periodo) ?? PERIODOS[1];
  const agora = new Date();
  const de = new Date(agora.getTime() - periodo.dias * 86_400_000);

  const [leads, reclassificacoes, session] = await Promise.all([
    carregarLeadsDaFila(),
    getRepository().listReclassificacoes().catch(() => []),
    getSession(),
  ]);

  const m = calcularMetricas(leads, reclassificacoes, de, agora, agora);
  const exporta = session ? podeExportar(session.role) : false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas"
        title="Quanto tempo o agente economizou"
        description="Sem receita, sem ticket médio, sem previsão de faturamento — não é o que este time acompanha."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-ib-line bg-white p-1">
              {PERIODOS.map((p) => (
                <Link
                  key={p.key}
                  href={`/dashboard/metricas?periodo=${p.key}`}
                  aria-current={p.key === periodo.key ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    p.key === periodo.key
                      ? "bg-ib-mar text-white"
                      : "text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
                  }`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
            {/* Sem exportação em massa: o escopo é escolhido, e o download vira linha no
                log de acesso. Atendente não vê estes botões. */}
            {exporta ? (
              <>
                <a href="/api/exportar/leads?escopo=prazos" className={btnGhost}>
                  <Icon name="doc" className="h-4 w-4" />
                  Exportar prazos
                </a>
                <a href="/api/exportar/leads?escopo=fila" className={btnGhost}>
                  <Icon name="doc" className="h-4 w-4" />
                  Exportar a fila
                </a>
              </>
            ) : null}
          </div>
        }
      />

      {/* PRAZOS PERDIDOS. Precisa ser zero, e precisa estar visível — inclusive quando é
          zero, que aqui é a única métrica que vale a pena mostrar zerada. */}
      <Card
        className={`overflow-hidden ${m.prazosPerdidos.length > 0 ? "ring-2 ring-ib-danger/40" : ""}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ib-slate">
              Prazos perdidos
            </p>
            <p
              className={`mt-1 font-display text-3xl font-semibold tabular-nums ${
                m.prazosPerdidos.length > 0 ? "text-ib-danger" : "text-ib-success"
              }`}
            >
              {m.prazosPerdidos.length}
            </p>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-ib-slate">
            Prazo confirmado que já venceu com o caso ainda aberto. Este número precisa ser
            zero. Ele não é do período escolhido: é do estado de agora.
          </p>
        </div>
        {m.prazosPerdidos.length > 0 ? (
          <ul className="divide-y divide-ib-line border-t border-ib-line">
            {m.prazosPerdidos.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/dashboard/leads/${l.id}`} className="truncate font-medium text-ib-ink hover:underline">
                  {l.contactName ?? l.whatsappNumber}
                </Link>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ib-danger">
                  {rotuloPrazo(diasRestantes(l.prazoDataLimite!, agora))}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <Numero
            label="Conversas atendidas"
            valor={String(m.atendidas)}
            nota={`Nos últimos ${periodo.dias} dias.`}
          />
          <Numero
            label="Filtradas pelo agente"
            valor={String(m.filtradas.total)}
            nota="O que o time não precisou olhar. É o número que justifica o projeto."
            tom="bom"
          />
          <Numero
            label="Entregues ao time"
            valor={String(m.qualificados.total)}
            nota="Leads qualificados que chegaram à fila."
          />
          <Numero
            label="Taxa de resgate"
            valor={pct(m.resgate.taxa)}
            nota={`${m.resgate.resgatados} de ${m.resgate.base} filtrados voltaram por mão humana. Se sobe, o agente está descartando demais.`}
            tom={m.resgate.taxa >= 0.15 ? "alerta" : "normal"}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">Atendimentos por idioma</h2>
            <p className="mt-0.5 text-xs text-ib-slate">
              É o que diz se o time consegue atender quem está escrevendo.
            </p>
          </div>
          <Barras
            rows={m.porIdioma.map((i) => ({
              label: i.idioma === "—" ? "idioma não detectado" : nomeDoIdioma(i.idioma) ?? i.idioma,
              total: i.total,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">Leads entregues, por classificação</h2>
            <p className="mt-0.5 text-xs text-ib-slate">O trabalho que efetivamente chegou à fila.</p>
          </div>
          <Barras
            rows={m.qualificados.porClassificacao.map((c) => ({
              label: CLASSIFICACAO_LABEL[c.classificacao],
              total: c.total,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">O que foi filtrado</h2>
            <p className="mt-0.5 text-xs text-ib-slate">
              Revisável por amostragem em{" "}
              <Link href="/dashboard/filtradas" className="underline">
                Conversas filtradas
              </Link>
              .
            </p>
          </div>
          <Barras
            rows={m.filtradas.porClassificacao.map((c) => ({
              label: CLASSIFICACAO_LABEL[c.classificacao],
              total: c.total,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-ib-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ib-ink">Concordância com o agente</h2>
            <p className="mt-0.5 text-xs text-ib-slate">
              Quanto o humano discorda da classificação da IA, e quanto tempo leva até
              alguém assumir.
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <Numero
              label="Taxa de reclassificação"
              valor={pct(m.reclassificacao.taxa)}
              nota={`${m.reclassificacao.reclassificados} de ${m.reclassificacao.base} classificados foram corrigidos à mão.`}
            />
            <Numero
              label="Até o 1º contato humano"
              valor={duracao(m.tempoAteHumano.quentePrazoMin)}
              nota={`Nos casos com prazo. Geral: ${duracao(m.tempoAteHumano.geralMin)}. ${m.tempoAteHumano.semAssumir} ainda sem ninguém.`}
              tom={
                m.tempoAteHumano.quentePrazoMin !== null && m.tempoAteHumano.quentePrazoMin > 240
                  ? "alerta"
                  : "normal"
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
