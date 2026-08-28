import Link from "next/link";
import AutoRefresh from "@/components/dashboard/auto-refresh";
import { Icon } from "@/components/dashboard/ui";
import { LinhaDaFila } from "@/components/fila/linha";
import { Paginacao } from "@/components/dashboard/paginacao";
import { carregarFilaPaginada } from "@/lib/fila/carregar";
import { POR_PAGINA, paginaDaBusca, paginaDoServidor } from "@/lib/fila/paginacao";
import { CLASSIFICACAO_LABEL, desde } from "@/lib/domain/rotulos";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

/**
 * O atalho do cabeçalho é menor e mais leve que o botão padrão do painel.
 *
 * `btnGhost` tem o peso de uma ação principal, e aqui são três destinos secundários: com
 * ele, a linha de atalhos pesava mais na página do que a fila. Estes são links, e devem
 * parecer links com moldura — não três botões disputando o clique.
 */
const btnAtalho =
  "inline-flex items-center gap-2 rounded-lg border border-ib-line bg-white px-3 py-1.5 text-[13px] font-medium text-ib-ink transition hover:border-ib-mar/40 hover:bg-ib-bruma focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ib-mar";

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

/**
 * A FILA É UM DOCUMENTO, NÃO TRÊS CARTÕES.
 *
 * Cada bloco era um cartão próprio, com borda, sombra e um cabeçalho pintado. Três
 * cartões empilhados dão três começos de leitura: o olho reinicia a cada borda, e a
 * ordem de urgência entre eles — que é a única coisa que a tela precisa comunicar —
 * some. Aqui os blocos viram FAIXAS de um documento só: um cabeçalho em mono
 * maiúsculo, um filete, e as linhas. A hierarquia passa a ser a posição, como numa
 * pauta impressa.
 *
 * O bloco urgente não ganha fundo vermelho: ganha um filete vermelho de 3px na
 * esquerda, a mesma marca que as linhas de prazo usam. Vermelho preenchido num
 * cabeçalho colore uma área que não é o prazo — e a regra da casa é que a cor mais
 * forte pertence ao prazo, e a nada mais.
 */
function Faixa({
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
    <section aria-label={titulo} className="relative">
      {urgente ? (
        <span className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-ib-danger" aria-hidden="true" />
      ) : null}
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2 ${urgente ? "pl-4" : ""}`}>
        <h2
          className={`font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${
            urgente ? "text-ib-danger" : "text-ib-slate"
          }`}
        >
          {titulo}
        </h2>
        <span
          className={`font-mono text-[13px] font-semibold tabular-nums ${
            urgente ? "text-ib-danger" : "text-ib-ink"
          }`}
        >
          {String(contagem).padStart(2, "0")}
        </span>
        {descricao ? (
          <p className="text-xs text-ib-slate">{descricao}</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-ib-line bg-white">{children}</div>
    </section>
  );
}

/**
 * Estado vazio é instrução, não decoração — mas instrução curta.
 *
 * Os vazios daqui eram parágrafos de três linhas explicando o que o vazio significava, e
 * ocupavam mais espaço do que o conteúdo real ocuparia. Quem lê a fila todo dia lê essa
 * explicação uma vez; da segunda em diante ela é só altura entre ele e o trabalho. Fica
 * uma frase, e o resto vai para o `title`.
 */
function Vazio({ children, detalhe }: { children: React.ReactNode; detalhe?: string }) {
  return (
    <p title={detalhe} className="px-4 py-4 text-[13px] text-ib-slate">
      {children}
    </p>
  );
}

/**
 * A MESA DE CONTROLE.
 *
 * Antes desta faixa, responder "tem alguma coisa pegando fogo?" exigia ler três
 * cabeçalhos e dois parágrafos. Aqui são quatro números, na ordem em que a operação
 * decide: o que já venceu, o que corre, o que ninguém pegou, e há quanto tempo o caso
 * mais esquecido está esperando.
 *
 * Fundo navy, e não mais um cartão branco: a fila inteira embaixo é branca, e a mesa
 * precisa se ler como instrumento — algo que se consulta de relance e de longe — e não
 * como mais uma seção de conteúdo. É o mesmo navy do rail, então a tela ganha uma
 * moldura em vez de mais um retângulo solto.
 */
function Vital({
  rotulo,
  valor,
  unidade,
  tom = "neutro",
  href,
}: {
  rotulo: string;
  valor: string;
  unidade?: string;
  tom?: "neutro" | "alerta" | "acao";
  href?: string;
}) {
  /*
   * ZERO NÃO GRITA.
   *
   * Com quatro números do mesmo tamanho e do mesmo branco, "00 prazos vencidos" pesa
   * tanto quanto "07 sem responsável" — e a mesa deixa de responder à pergunta que
   * existe para responder. Zero aqui é a boa notícia: fica apagado, e a atenção sobra
   * inteira para o que não é zero.
   */
  const nulo = valor === "00" || valor === "—";
  const cor = nulo
    ? "text-white/30"
    : tom === "alerta"
      ? "text-[#FF8A8A]"
      : tom === "acao"
        ? "text-ib-selo"
        : "text-white";
  const corpo = (
    <>
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          nulo ? "text-white/25" : "text-white/50"
        }`}
      >
        {rotulo}
      </p>
      <p className={`mt-1.5 flex items-baseline gap-1.5 font-mono tabular-nums ${cor}`}>
        <span className="text-[26px] font-semibold leading-none">{valor}</span>
        {unidade ? (
          <span className="text-[11px] uppercase tracking-[0.1em] opacity-70">{unidade}</span>
        ) : null}
      </p>
    </>
  );
  if (!href) return <div className="px-4 py-3.5 sm:px-5">{corpo}</div>;
  return (
    <Link
      href={href}
      className="block px-4 py-3.5 transition hover:bg-white/[0.06] focus:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ib-selo sm:px-5"
    >
      {corpo}
    </Link>
  );
}

function MesaDeControle({
  vencidos,
  correndo,
  aConfirmar,
  semResponsavel,
  maisParado,
}: {
  vencidos: number;
  correndo: number;
  aConfirmar: number;
  semResponsavel: number;
  maisParado: string | null;
}) {
  return (
    <section
      aria-label="Estado da fila"
      className="overflow-hidden rounded-2xl bg-gradient-to-br from-ib-casa to-ib-ink"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
        {/* Vencido é o único número que troca de cor. Um painel em que tudo pode ficar
            vermelho é um painel em que nada fica. */}
        <Vital
          rotulo="prazo vencido"
          valor={String(vencidos).padStart(2, "0")}
          tom={vencidos > 0 ? "alerta" : "neutro"}
        />
        <Vital
          rotulo={aConfirmar > 0 ? "a confirmar" : "prazos correndo"}
          valor={String(aConfirmar > 0 ? aConfirmar : correndo).padStart(2, "0")}
          unidade={aConfirmar > 0 ? "sem data" : undefined}
          tom={aConfirmar > 0 ? "alerta" : "neutro"}
        />
        <Vital
          rotulo="sem responsável"
          valor={String(semResponsavel).padStart(2, "0")}
          tom={semResponsavel > 0 ? "acao" : "neutro"}
        />
        <Vital rotulo="mais parado" valor={maisParado ?? "—"} />
      </div>
      {/*
       * Aqui havia uma faixa MRZ fechando a mesa por baixo. Saiu: sobre o navy ela lia
       * como um trecho de texto selecionado por engano, e a mesa já se separa do conteúdo
       * pela cor. Assinatura que precisa ser explicada não é assinatura, é enfeite.
       */}
    </section>
  );
}

export default async function FilaPage({
  searchParams,
}: {
  searchParams?: { p?: string };
}) {
  const agora = new Date();
  // SÓ O BLOCO 3 PAGINA, E A PAGINAÇÃO É DE VERDADE — o banco devolve os leads com prazo
  // TODOS, sem teto, e uma página do resto. Antes isto era um teto de carga com um aviso
  // amarelo dizendo "42 atendimentos mais recentes, de 43": os dois blocos de prazo
  // dependiam de caber no teto, e o denominador contava a tabela inteira (com ensaio, com
  // filtradas, com caso encerrado), então o aviso aparecia mesmo sem nada ter sido
  // cortado. Quem tem defesa a protocolar não pode depender de caber numa página.
  const numeroDaPagina = paginaDaBusca(searchParams?.p);
  const { fila, totalNormal, totalFiltradas } = await carregarFilaPaginada(agora, {
    pagina: numeroDaPagina,
    porPagina: POR_PAGINA,
  });
  const pagina = paginaDoServidor(fila.normal, numeroDaPagina, POR_PAGINA, totalNormal);

  const vencidos = fila.correndo.filter((i) => i.faixa === "vencido").length;
  const criticos = fila.correndo.filter((i) => i.faixa === "critico").length;

  // Os números da mesa. Todos saem do que já está carregado — a mesa não custa consulta
  // nova, senão o topo da tela pagaria por si mesmo a cada 30 segundos do auto-refresh.
  const emEspera = [...fila.aConfirmar, ...fila.correndo.map((i) => i.lead), ...fila.normal];
  const semResponsavel = emEspera.filter((l) => !l.responsavelNome).length;
  const maisParado = tempoDoMaisParado(emEspera, agora);

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={30} />

      {/* CABEÇALHO ENXUTO. A descrição de três linhas explicando quantos blocos a tela
          tem saiu: os blocos agora se anunciam sozinhos, e quem abre esta tela trinta
          vezes por dia não relê a legenda. O que sobrou é o título e para onde ir. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-ib-selo">
            Fila de trabalho
          </p>
          <h1 className="mt-1 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-ib-ink">
            O que vence primeiro
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/crm" className={btnAtalho}>
            <Icon name="activity" className="h-4 w-4 text-ib-slate" />
            CRM
          </Link>
          <Link href="/dashboard/filtradas" className={btnAtalho}>
            <Icon name="search" className="h-4 w-4 text-ib-slate" />
            Filtradas
            <span className="font-mono text-xs tabular-nums text-ib-slate">{totalFiltradas}</span>
          </Link>
          <Link href="/dashboard/metricas" className={btnAtalho}>
            <Icon name="activity" className="h-4 w-4 text-ib-slate" />
            Métricas
          </Link>
        </div>
      </div>

      <MesaDeControle
        vencidos={vencidos}
        correndo={fila.correndo.length}
        aConfirmar={fila.aConfirmar.length}
        semResponsavel={semResponsavel}
        maisParado={maisParado}
      />

      {/* PRAZOS PERDIDOS: precisa ser zero, e precisa estar visível. Só aparece quando
          existe — um contador permanente em "0" vira mobília e some da vista. */}
      {vencidos > 0 ? (
        <p
          role="alert"
          className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-2.5 text-[13px] font-medium text-ib-danger"
        >
          {vencidos === 1
            ? "1 prazo já venceu e o caso continua aberto."
            : `${vencidos} prazos já venceram e os casos continuam abertos.`}{" "}
          Estão no topo dos prazos correndo.
        </p>
      ) : null}

      {/* ── FAIXA 1 ── Incomoda enquanto tiver item; some quando não tiver. */}
      {fila.aConfirmar.length > 0 ? (
        <Faixa
          titulo="Prazo a confirmar"
          contagem={fila.aConfirmar.length}
          tom="urgente"
          descricao="Ligue, confirme a data e registre. Sem data, não há contagem."
        >
          <ul className="divide-y divide-ib-line">
            {fila.aConfirmar.map((lead) => (
              <LinhaDaFila key={lead.id} lead={lead} agora={agora} />
            ))}
          </ul>
          <p
            title="Quem recebeu a notificação raramente sabe a data de cabeça, e um contador em cima de data errada é como se perde um prazo."
            className="border-t border-ib-line bg-ib-papel/60 px-4 py-2 text-xs text-ib-slate"
          >
            O agente <strong>sinaliza</strong> o prazo; ele não calcula a data.
          </p>
        </Faixa>
      ) : null}

      {/* ── FAIXA 2 ── */}
      <Faixa
        titulo="Prazos correndo"
        contagem={fila.correndo.length}
        descricao={criticos > 0 ? `${criticos} com 3 dias ou menos` : undefined}
      >
        {fila.correndo.length === 0 ? (
          <Vazio detalhe="Os prazos que chegaram hoje e ainda não foram confirmados aparecem na faixa 'Prazo a confirmar'.">
            Nenhum relógio correndo agora.
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
      </Faixa>

      {/* ── FAIXA 3 ── */}
      <Faixa
        titulo="Fila normal"
        contagem={totalNormal}
        descricao="Judicial primeiro; depois, o mais parado no topo."
      >
        {totalNormal === 0 ? (
          <Vazio>
            Nada esperando atendimento. Vale conferir{" "}
            <Link className="font-medium text-ib-mar underline underline-offset-2" href="/dashboard/filtradas">
              Filtradas
            </Link>{" "}
            por amostragem.
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
      </Faixa>

      <Resumo normal={fila.normal} />
    </div>
  );
}

/** Há quanto tempo espera o caso mais esquecido da fila. Alimenta a mesa de controle. */
function tempoDoMaisParado(leads: LeadDaFila[], agora: Date): string | null {
  let maisAntigo: string | null = null;
  let pior = -1;
  for (const l of leads) {
    const quando = l.ultimoContatoEm ?? l.createdAt;
    const ms = agora.getTime() - Date.parse(quando ?? "");
    if (Number.isFinite(ms) && ms > pior) {
      pior = ms;
      maisAntigo = quando ?? null;
    }
  }
  if (!maisAntigo) return null;
  // `desde()` devolve "há 4 h"; na mesa o "há" é ruído — a coluna já se chama "mais parado".
  return desde(maisAntigo, agora).replace(/^há\s*/i, "");
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
