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
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import { resumirCustos } from "@/lib/custos/resumo";
import { cambio, emReais } from "@/lib/custos/cambio";

export const dynamic = "force-dynamic";

/**
 * AS MÉTRICAS DESTE TIME.
 *
 * O painel que originou este código media receita, ticket médio e conversão. Nada disso
 * está aqui, de propósito: o que prova o valor deste produto é quanto tempo do time ele
 * economizou — e, do outro lado, se ele economizou tempo demais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ABAS, E POR QUE O CABEÇALHO DE FILTRO É TÃO EXPLÍCITO.
 *
 * A tela era uma coluna só com dezoito números, e o seletor de período no topo parecia
 * quebrado — 7, 30 e 90 dias mostravam quase sempre a MESMA coisa. Não estava quebrado:
 * a operação é nova, e quando todo caso do banco nasceu nas últimas duas semanas, os três
 * recortes contêm os mesmos casos. Só que um filtro que não muda nada é indistinguível
 * de um filtro que não funciona, e a diferença entre as duas coisas não pode depender de
 * o usuário adivinhar.
 *
 * Então agora o recorte se declara: quantos casos existem ao todo, quantos entraram no
 * período escolhido e de que data até que data. Se os números não mudam, dá para VER por
 * quê. E "tudo" existe justamente para o dia em que 90 dias já não é o banco inteiro.
 *
 * As abas separam perguntas que não se respondem juntas: quanto o agente poupou, quem é
 * essa gente, o que aconteceu com os casos, os prazos, a concordância com a IA e o custo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PERIODOS = [
  { key: "7d", label: "7 dias", dias: 7 },
  { key: "30d", label: "30 dias", dias: 30 },
  { key: "90d", label: "90 dias", dias: 90 },
  { key: "tudo", label: "Tudo", dias: 3650 },
] as const;

const ABAS = [
  { key: "visao", label: "Visão geral" },
  { key: "pessoas", label: "Quem procura" },
  { key: "desfecho", label: "Desfecho" },
  { key: "prazos", label: "Prazos" },
  { key: "agente", label: "Agente" },
  { key: "custo", label: "Custo" },
] as const;

type AbaKey = (typeof ABAS)[number]["key"];

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/**
 * DINHEIRO DE IA É CARO NA TERCEIRA CASA DECIMAL.
 *
 * Um atendimento inteiro custa centavos, e arredondar para dois dígitos transformaria
 * "US$ 0,004 por conversa" em "US$ 0,00" — o número mais importante desta tela virando
 * zero por causa de formatação. Abaixo de um centavo, quatro casas.
 */
function usd(n: number): string {
  return n > 0 && n < 0.01 ? `US$ ${n.toFixed(4)}` : `US$ ${n.toFixed(2)}`;
}

function brl(n: number): string {
  return n > 0 && n < 0.01 ? `R$ ${n.toFixed(4)}` : `R$ ${n.toFixed(2)}`;
}

const TIPO_LABEL: Record<string, string> = {
  redacao: "Redação",
  extracao: "Extração (documentos)",
  classificacao: "Classificação",
  transcricao: "Transcrição de áudio",
  embedding: "Embedding (busca)",
};

function duracao(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} dias`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
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

function Barras({ rows, vazio = "Nada no período." }: { rows: { label: string; total: number }[]; vazio?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) {
    return <p className="px-5 py-6 text-sm text-ib-slate">{vazio}</p>;
  }
  return (
    <ul className="space-y-2.5 p-5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ib-ink">{r.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-ib-slate">{r.total}</span>
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

function Bloco({
  titulo,
  descricao,
  children,
  className = "",
}: {
  titulo: string;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="border-b border-ib-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ib-ink">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-xs leading-relaxed text-ib-slate">{descricao}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/** Preserva os outros filtros ao trocar um deles — trocar de aba não pode zerar o recorte. */
function comFiltro(
  base: { aba: AbaKey; periodo: string; nacionalidade?: string },
  patch: Partial<{ aba: string; periodo: string; nacionalidade: string }>,
): string {
  const q = new URLSearchParams();
  const v = { ...base, ...patch };
  if (v.aba && v.aba !== "visao") q.set("aba", v.aba);
  if (v.periodo && v.periodo !== "30d") q.set("periodo", v.periodo);
  if (v.nacionalidade) q.set("nacionalidade", v.nacionalidade);
  const s = q.toString();
  return `/dashboard/metricas${s ? `?${s}` : ""}`;
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: { periodo?: string; aba?: string; nacionalidade?: string };
}) {
  const periodo = PERIODOS.find((p) => p.key === searchParams.periodo) ?? PERIODOS[1];
  const aba: AbaKey = (ABAS.find((a) => a.key === searchParams.aba)?.key ?? "visao") as AbaKey;
  const nacionalidade = searchParams.nacionalidade?.trim() || "";
  const agora = new Date();
  const de = new Date(agora.getTime() - periodo.dias * 86_400_000);

  const [todos, reclassificacoes, session, chamadas] = await Promise.all([
    carregarLeadsDaFila(),
    getRepository().listReclassificacoes().catch(() => []),
    getSession(),
    getRepository().listChamadasLlm({ desde: de.toISOString() }).catch(() => []),
  ]);

  // O FILTRO DE NACIONALIDADE ENTRA ANTES DO CÁLCULO, não depois: filtrar o gráfico e
  // deixar os números grandes intactos daria duas leituras contraditórias na mesma tela.
  const chave = (l: LeadDaFila) => (l.nacionalidade ?? l.clientType ?? "").trim();
  const nacionalidades = Array.from(
    new Set(todos.filter((l) => l.ambiente !== "teste").map(chave).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const leads = nacionalidade
    ? todos.filter((l) => chave(l).toLowerCase() === nacionalidade.toLowerCase())
    : todos;

  const m = calcularMetricas(leads, reclassificacoes, de, agora, agora);
  const exporta = session ? podeExportar(session.role) : false;

  // O CUSTO TAMBÉM RESPEITA O FILTRO.
  //
  // As chamadas de LLM vêm todas do período; se a tela está recortada por nacionalidade,
  // deixá-las inteiras daria duas leituras contraditórias lado a lado — e pior: toda
  // conversa fora do recorte cairia no balde "idioma não detectado" da quebra por idioma,
  // porque o mapa de idiomas só conhece as conversas filtradas.
  const conversasDoRecorte = new Set(leads.map((l) => l.conversationId));
  const chamadasDoRecorte = nacionalidade
    ? chamadas.filter((c) => !c.conversationId || conversasDoRecorte.has(c.conversationId))
    : chamadas;
  const idiomaPorConversa = new Map(leads.map((l) => [l.conversationId, l.idioma]));
  const custos = resumirCustos(chamadasDoRecorte, idiomaPorConversa, de, agora);
  const taxa = cambio();

  const totalReal = todos.filter((l) => l.ambiente !== "teste").length;
  const base = { aba, periodo: periodo.key, nacionalidade };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Métricas"
        title="Quanto tempo o agente economizou"
        description="Sem receita, sem ticket médio, sem previsão de faturamento — não é o que este time acompanha. Custo entra, porque é aqui que ele tem período e denominador: o número que interessa não é o gasto, é quanto custa atender UMA conversa."
        actions={
          exporta ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* Sem exportação em massa: o escopo é escolhido, e o download vira linha
                  no log de acesso. Atendente não vê estes botões. */}
              <a href="/api/exportar/leads?escopo=prazos" className={btnGhost}>
                <Icon name="doc" className="h-4 w-4" />
                Exportar prazos
              </a>
              <a href="/api/exportar/leads?escopo=fila" className={btnGhost}>
                <Icon name="doc" className="h-4 w-4" />
                Exportar a fila
              </a>
            </div>
          ) : null
        }
      />

      {/* ─── O RECORTE, DECLARADO ───
          Se os números não mudarem ao trocar de período, esta faixa mostra o porquê. */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-0.5 rounded-xl border border-ib-line bg-ib-papel/60 p-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.key}
                href={comFiltro(base, { periodo: p.key })}
                aria-current={p.key === periodo.key ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  p.key === periodo.key
                    ? "bg-ib-mar text-white"
                    : "text-ib-slate hover:bg-white hover:text-ib-ink"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
              Nacionalidade
            </span>
            <Link
              href={comFiltro(base, { nacionalidade: "" })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                nacionalidade
                  ? "bg-white text-ib-slate ring-1 ring-inset ring-ib-line hover:text-ib-ink"
                  : "bg-ib-carimbo text-white"
              }`}
            >
              todas
            </Link>
            {nacionalidades.slice(0, 12).map((n) => (
              <Link
                key={n}
                href={comFiltro(base, { nacionalidade: n })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  n.toLowerCase() === nacionalidade.toLowerCase()
                    ? "bg-ib-carimbo text-white"
                    : "bg-white text-ib-slate ring-1 ring-inset ring-ib-line hover:text-ib-ink"
                }`}
              >
                {n}
              </Link>
            ))}
            {nacionalidades.length === 0 ? (
              <span className="text-xs text-ib-slate">nenhuma preenchida ainda</span>
            ) : null}
          </div>
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-ib-slate">
          <span className="font-mono tabular-nums text-ib-ink">{m.atendidas}</span> caso
          {m.atendidas === 1 ? "" : "s"} no recorte, de{" "}
          <span className="font-mono tabular-nums">{totalReal}</span> no painel · de{" "}
          <span className="font-mono tabular-nums">{dataCurta(m.periodo.de)}</span> a{" "}
          <span className="font-mono tabular-nums">{dataCurta(m.periodo.ate)}</span>
          {nacionalidade ? ` · só ${nacionalidade}` : ""}. Conversa de teste nunca entra.
          {m.atendidas === totalReal && periodo.key !== "tudo"
            ? " Todo o painel cabe neste período — por isso trocar de período ainda não muda os números."
            : ""}
        </p>
      </Card>

      {/* ─── AS ABAS ─── */}
      <div role="tablist" aria-label="Métricas" className="flex flex-wrap gap-1 border-b border-ib-line">
        {ABAS.map((a) => (
          <Link
            key={a.key}
            role="tab"
            aria-selected={a.key === aba}
            href={comFiltro(base, { aba: a.key })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              a.key === aba
                ? "border-ib-mar text-ib-ink"
                : "border-transparent text-ib-slate hover:text-ib-ink"
            }`}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {/* PRAZOS PERDIDOS acompanha TODAS as abas: precisa ser zero, e um alerta que só
          aparece na aba certa é um alerta que ninguém vê. Não é do período — é de agora. */}
      {m.prazosPerdidos.length > 0 ? (
        <Card className="overflow-hidden ring-2 ring-ib-danger/40">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ib-slate">
                Prazos perdidos
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ib-danger">
                {m.prazosPerdidos.length}
              </p>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-ib-slate">
              Prazo confirmado que já venceu com o caso ainda aberto. Este número precisa
              ser zero. Ele não é do período escolhido: é do estado de agora.
            </p>
          </div>
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
        </Card>
      ) : null}

      {/* ══════════════ VISÃO GERAL ══════════════ */}
      {aba === "visao" ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Numero label="Conversas atendidas" valor={String(m.atendidas)} nota={`No recorte escolhido.`} />
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

          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Numero
                label="Prazos correndo"
                valor={String(m.prazos.correndo)}
                nota="Casos abertos com data limite confirmada."
                tom={m.prazos.correndo > 0 ? "alerta" : "normal"}
              />
              <Numero
                label="Casos fechados"
                valor={String(m.desfecho.fechados)}
                nota={`${pct(m.desfecho.taxaFechamento)} dos casos com desfecho no período.`}
                tom="bom"
              />
              <Numero label="Em aberto" valor={String(m.desfecho.emAberto)} nota="Ainda sem desfecho." />
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

          <div className="grid gap-5 lg:grid-cols-2">
            <Bloco
              titulo="Leads entregues, por classificação"
              descricao="O trabalho que efetivamente chegou à fila."
            >
              <Barras
                rows={m.qualificados.porClassificacao.map((c) => ({
                  label: CLASSIFICACAO_LABEL[c.classificacao],
                  total: c.total,
                }))}
              />
            </Bloco>
            <Bloco
              titulo="O que foi filtrado"
              descricao={
                <>
                  Revisável por amostragem em{" "}
                  <Link href="/dashboard/filtradas" className="underline">
                    Conversas filtradas
                  </Link>
                  .
                </>
              }
            >
              <Barras
                rows={m.filtradas.porClassificacao.map((c) => ({
                  label: CLASSIFICACAO_LABEL[c.classificacao],
                  total: c.total,
                }))}
              />
            </Bloco>
          </div>
        </>
      ) : null}

      {/* ══════════════ QUEM PROCURA ══════════════ */}
      {aba === "pessoas" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Bloco
            titulo="Por nacionalidade"
            descricao="De onde vem quem procura o escritório. Clique numa nacionalidade no filtro acima para ver a tela inteira só dela."
          >
            <Barras rows={m.porNacionalidade} vazio="Nenhuma nacionalidade preenchida no período." />
          </Bloco>
          <Bloco
            titulo="Onde a pessoa está"
            descricao="Quem já está no Brasil e quem ainda está fora não têm o mesmo caminho — nem a mesma urgência."
          >
            <Barras rows={m.porLocalizacao} />
          </Bloco>
          <Bloco
            titulo="Por idioma"
            descricao="É o que diz se o time consegue atender quem está escrevendo."
          >
            <Barras
              rows={m.porIdioma.map((i) => ({
                label: i.idioma === "—" ? "idioma não detectado" : nomeDoIdioma(i.idioma) ?? i.idioma,
                total: i.total,
              }))}
            />
          </Bloco>
          <Bloco
            titulo="Modalidade provável"
            descricao="Hipótese do agente, não orientação dada à pessoa. Serve para saber que trabalho está entrando."
          >
            <Barras rows={m.porModalidade} />
          </Bloco>
        </div>
      ) : null}

      {/* ══════════════ DESFECHO ══════════════ */}
      {aba === "desfecho" ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Numero label="Fechados" valor={String(m.desfecho.fechados)} tom="bom" nota="Virou cliente ou o assunto se resolveu." />
              <Numero label="Perdidos" valor={String(m.desfecho.perdidos)} nota="Com motivo registrado — é o que se lê seis meses depois." />
              <Numero label="Em aberto" valor={String(m.desfecho.emAberto)} nota="Ainda em alguma etapa do CRM." />
              <Numero
                label="Taxa de fechamento"
                valor={pct(m.desfecho.taxaFechamento)}
                nota="Sobre os casos que TIVERAM desfecho no período. Quem está em aberto não entra no denominador."
              />
            </div>
          </Card>
          <Bloco
            titulo="Por que os casos foram perdidos"
            descricao="O motivo é exigido na hora de mover o card. Esta lista é a soma desses motivos — a resposta mais barata que existe para “por que não fecha?”."
          >
            <Barras rows={m.desfecho.motivos} vazio="Nenhum caso perdido no período." />
          </Bloco>
        </>
      ) : null}

      {/* ══════════════ PRAZOS ══════════════ */}
      {aba === "prazos" ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Numero label="Prazos sinalizados" valor={String(m.prazos.sinalizados)} nota="O agente identificou prazo na conversa." />
              <Numero
                label="Datas confirmadas"
                valor={String(m.prazos.confirmados)}
                nota="Alguém ligou e registrou a data do documento."
                tom="bom"
              />
              <Numero
                label="Taxa de confirmação"
                valor={pct(m.prazos.taxaConfirmacao)}
                nota="Sinalizado sem confirmar é caso sem contador: ninguém sabe quantos dias sobram."
                tom={m.prazos.taxaConfirmacao < 0.5 && m.prazos.sinalizados > 0 ? "alerta" : "normal"}
              />
              <Numero
                label="Prazos perdidos"
                valor={String(m.prazosPerdidos.length)}
                nota="Venceu com o caso aberto. Do estado de agora, não do período."
                tom={m.prazosPerdidos.length > 0 ? "alerta" : "bom"}
              />
            </div>
          </Card>
          <Bloco
            titulo="Tempo até o primeiro contato humano"
            descricao="A média geral esconde o caso em que a demora custa o caso — por isso os dois números."
          >
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <Numero
                label="Nos casos com prazo"
                valor={duracao(m.tempoAteHumano.quentePrazoMin)}
                tom={
                  m.tempoAteHumano.quentePrazoMin !== null && m.tempoAteHumano.quentePrazoMin > 240
                    ? "alerta"
                    : "normal"
                }
                nota={`${m.tempoAteHumano.semAssumir} casos ainda sem ninguém.`}
              />
              <Numero label="Geral" valor={duracao(m.tempoAteHumano.geralMin)} nota="Todos os casos do período." />
            </div>
          </Bloco>
        </>
      ) : null}

      {/* ══════════════ AGENTE ══════════════ */}
      {aba === "agente" ? (
        <>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
              <Numero
                label="Taxa de reclassificação"
                valor={pct(m.reclassificacao.taxa)}
                nota={`${m.reclassificacao.reclassificados} de ${m.reclassificacao.base} classificados foram corrigidos à mão. É o dado que calibra o agente.`}
              />
              <Numero
                label="Taxa de resgate"
                valor={pct(m.resgate.taxa)}
                nota={`${m.resgate.resgatados} de ${m.resgate.base}. Se sobe, o agente está descartando gente que deveria ter chegado ao time.`}
                tom={m.resgate.taxa >= 0.15 ? "alerta" : "normal"}
              />
              <Numero
                label="Filtradas"
                valor={String(m.filtradas.total)}
                nota="O que o time não precisou olhar."
                tom="bom"
              />
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Bloco titulo="O que foi filtrado, por motivo">
              <Barras
                rows={m.filtradas.porClassificacao.map((c) => ({
                  label: CLASSIFICACAO_LABEL[c.classificacao],
                  total: c.total,
                }))}
              />
            </Bloco>
            <Bloco titulo="O que foi entregue, por classificação">
              <Barras
                rows={m.qualificados.porClassificacao.map((c) => ({
                  label: CLASSIFICACAO_LABEL[c.classificacao],
                  total: c.total,
                }))}
              />
            </Bloco>
          </div>
        </>
      ) : null}

      {/* ══════════════ CUSTO ══════════════ */}
      {aba === "custo" ? (
        <>
          <Bloco
            titulo="O que a IA custou"
            descricao={
              <>
                Somando os dois provedores, chamada por chamada. Convertido a{" "}
                <span className="font-mono tabular-nums">R$ {taxa.usdBrl.toFixed(2)}</span> por dólar
                {taxa.configurado ? "" : " (cotação padrão — defina USD_BRL para a sua)"}.
              </>
            }
          >
            <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Numero
                label="Custo do período"
                valor={usd(custos.totalUsd)}
                nota={`${brl(emReais(custos.totalUsd, taxa.usdBrl))} · ${custos.chamadas} chamadas no recorte.`}
              />
              <Numero
                label="Custo médio por conversa"
                valor={custos.mediaPorConversaUsd === null ? "—" : usd(custos.mediaPorConversaUsd)}
                nota={
                  custos.mediaPorConversaUsd === null
                    ? "Nenhuma conversa com chamada de IA no período."
                    : `${brl(emReais(custos.mediaPorConversaUsd, taxa.usdBrl))} · é este o número que fecha a precificação. Base: ${custos.conversas} conversas.`
                }
              />
              <Numero
                label="Conversas com IA"
                valor={String(custos.conversas)}
                nota="Conversas que consumiram ao menos uma chamada. É o denominador da média."
              />
              <Numero
                label="Sem preço na tabela"
                valor={String(custos.semPreco)}
                nota={
                  custos.semPreco > 0
                    ? "Chamadas de um modelo fora da tabela de preços. Enquanto for maior que zero, o custo acima é um piso."
                    : "Todo modelo usado no período tem preço conhecido."
                }
                tom={custos.semPreco > 0 ? "alerta" : "normal"}
              />
            </div>
          </Bloco>

          <div className="grid gap-5 lg:grid-cols-2">
            <Bloco
              titulo="Custo médio por conversa, por idioma"
              descricao="Não custam o mesmo: quem escreve pouco manda áudio, e áudio passa por transcrição. A média geral esconde justamente o público de quem este atendimento existe."
            >
              {custos.porIdioma.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ib-slate">Nada no período.</p>
              ) : (
                <ul className="divide-y divide-ib-line">
                  {custos.porIdioma.map((l) => (
                    <li key={l.chave} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                      <span className="text-ib-ink">
                        {l.chave === "—" ? "idioma não detectado" : nomeDoIdioma(l.chave) ?? l.chave}
                        <span className="ml-2 text-xs text-ib-slate">{l.conversas} conversas</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-ib-ink">
                        {usd(l.mediaUsd)}
                        <span className="ml-2 text-ib-slate">{brl(emReais(l.mediaUsd, taxa.usdBrl))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            <Bloco
              titulo="Por modelo e por tipo de chamada"
              descricao="Sem esta quebra não dá para saber se a separação entre modelo pequeno e modelo grande está funcionando de fato."
            >
              {custos.porModelo.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ib-slate">Nada no período.</p>
              ) : (
                <div className="grid grid-cols-1 divide-y divide-ib-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <ul className="divide-y divide-ib-line">
                    {custos.porModelo.map((l) => (
                      <li key={l.chave} className="px-5 py-2.5 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-mono text-xs text-ib-ink">{l.chave}</span>
                          <span className="font-mono text-xs tabular-nums text-ib-ink">{usd(l.custoUsd)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ib-slate">
                          {l.chamadas} chamadas
                          {l.semPreco > 0 ? ` · ${l.semPreco} sem preço na tabela` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <ul className="divide-y divide-ib-line">
                    {custos.porTipo.map((l) => (
                      <li key={l.tipo} className="px-5 py-2.5 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-ib-ink">{TIPO_LABEL[l.tipo] ?? l.tipo}</span>
                          <span className="font-mono text-xs tabular-nums text-ib-ink">{usd(l.custoUsd)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ib-slate">{l.chamadas} chamadas</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Bloco>
          </div>
        </>
      ) : null}
    </div>
  );
}
