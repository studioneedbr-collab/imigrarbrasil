"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CardDoAtendimento } from "@/components/atendimentos/card";
import { ResumoDoLead } from "@/components/atendimentos/resumo-modal";
import { GerenciarEtapas } from "@/components/crm/etapas";
import {
  DialogoDeMovimento,
  type CorpoDoMovimento,
  type TipoDeMovimento,
} from "@/components/crm/movimento";
import { Selecao } from "@/components/dashboard/campos";
import { Icon, btnBarra, btnBarraAtivo, btnPrimary } from "@/components/dashboard/ui";
import { montarQuadro, funilPadrao, faltamDesfechos } from "@/lib/crm/funil";
import { transicao } from "@/lib/fila/kanban";

import type { LeadDaFila } from "@/lib/fila/ordenacao";
import { ORIGEM_LABEL } from "@/lib/domain/rotulos";
import type { AtendimentoStatus, EtapaCrm, FunilCrm, OrigemLead } from "@/lib/domain/types";

/**
 * O CRM.
 *
 * Era "o Quadro": cinco colunas fixas, escritas em código, que descreviam o que o sistema
 * sabe de um caso e não o trabalho. Entre "em atendimento" e "fechado" cabem semanas de
 * "esperando a certidão consular", "protocolo enviado", "exigência a cumprir" — e tudo
 * isso ficava empilhado numa coluna só, indistinguível.
 *
 * Agora as colunas são ETAPAS que o escritório desenha, e os funis são vários porque
 * "multa correndo" e "visto de trabalho de quem ainda está lá fora" não são o mesmo
 * trabalho.
 *
 * O QUE NÃO MUDOU — e é o que segura o resto:
 *
 * Arrastar NÃO escreve no banco por um caminho novo. Cada movimento continua virando uma
 * ação de POST /api/leads/[id]/atendimento, que já sabe que "perdido" exige motivo, que
 * assumir grava responsável e cala o agente, e que tudo entra no log de acesso. Quando a
 * etapa de destino tem o MESMO status da atual, a ação é `mover` e só a etapa muda.
 *
 * NO CELULAR NÃO TEM ARRASTO. Drag em tela de toque erra mais do que acerta, e errar aqui
 * significa fechar o caso de alguém. Lá o card ganha um seletor de etapa, que faz
 * exatamente a mesma chamada.
 */
/**
 * QUANTOS CARDS POR PÁGINA EM CADA COLUNA.
 *
 * Bem menos que o `POR_PAGINA` das listas (25). Ali a página ocupa a tela inteira; aqui
 * são cinco ou doze colunas lado a lado, e cada card tem quatro linhas. Dez já enche a
 * altura de uma tela — passar disso é devolver a rolagem infinita que esta paginação
 * existe para acabar.
 */
const POR_COLUNA = 10;

/** Onde a escolha de colunas recolhidas fica guardada, no navegador de quem usa. */
const CHAVE_RECOLHIDAS = "crm:colunas-recolhidas";

/** Sem acento e em caixa baixa: quem digita "jose" precisa achar "José". */
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * ONDE A BUSCA PROCURA.
 *
 * Nome e telefone são o óbvio. Os outros três não são: num quadro de imigração, procurar
 * "venezuela", "refúgio" ou "Boa Vista" é tão comum quanto procurar alguém pelo nome — é
 * assim que se acha o grupo de casos parecidos para tratar de uma vez. E o nome, aqui,
 * falta com frequência: metade dos casos novos ainda está identificada pelo telefone.
 */
const CAMPOS_DA_BUSCA: Array<(l: LeadDaFila) => string | null | undefined> = [
  (l) => l.contactName,
  (l) => l.whatsappNumber,
  (l) => l.nacionalidade ?? l.clientType,
  (l) => l.objetivo ?? l.modalidadeProvavel,
  (l) => l.region,
  (l) => l.resumo,
  (l) => l.responsavelNome,
];

export default function QuadroCrm({
  leads: iniciais,
  agoraISO,
  funis: funisIniciais,
  etapas: etapasIniciais,
  podeDesenhar,
  podeExportar,
}: {
  leads: LeadDaFila[];
  agoraISO: string;
  funis: FunilCrm[];
  etapas: EtapaCrm[];
  /** Advogado e administrador desenham o quadro. Atendente usa o quadro desenhado. */
  podeDesenhar: boolean;
  /** Quem pode tirar a base do painel em planilha. Ver lib/auth/papeis.ts. */
  podeExportar: boolean;
}) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraISO), [agoraISO]);
  const [leads, setLeads] = useState(iniciais);
  const [funis, setFunis] = useState(funisIniciais);
  const [etapas, setEtapas] = useState(etapasIniciais);
  const [funilId, setFunilId] = useState(() => funilPadrao(funisIniciais).id);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  /**
   * A PÁGINA DE CADA COLUNA.
   *
   * Era um "carregar mais" que só crescia: numa coluna com oitenta casos, chegar ao fim
   * significava oitenta cards empilhados e uma rolagem que não acaba — e, pior, a rolagem
   * é DE DENTRO da coluna, dentro da rolagem lateral do quadro. Duas rolagens aninhadas
   * na mesma tela é como se perde a noção de onde se está.
   *
   * Página tem fim. A coluna fica sempre da mesma altura, e quem procura um caso
   * específico usa a busca, que existe logo acima.
   */
  const [paginas, setPaginas] = useState<Record<string, number>>({});
  // O movimento que parou para perguntar. Três colunas pedem dados antes de gravar —
  // ver components/crm/movimento.tsx.
  const [perguntando, setPerguntando] = useState<{
    lead: LeadDaFila;
    etapa: EtapaCrm;
    tipo: TipoDeMovimento;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [criandoFunil, setCriandoFunil] = useState(false);
  const [nomeNovoFunil, setNomeNovoFunil] = useState("");
  // O card aberto em resumo. Guardamos o ID e não o objeto: depois de assumir, o lead
  // muda (ganha responsável) e um objeto congelado mostraria o estado anterior.
  const [aberto, setAberto] = useState<string | null>(null);
  /**
   * POR ONDE O CASO CHEGOU — `null` é "todas", e é o estado inicial.
   *
   * Filtra no cliente e não no servidor de propósito: os leads do quadro já estão todos
   * aqui (a tela carrega a carga inteira, com aviso de corte quando estoura), e uma ida
   * ao servidor por clique tornaria lento justamente o uso que este filtro tem — alternar
   * entre "só o que veio do site" e "tudo" algumas vezes seguidas para comparar.
   */
  const [origem, setOrigem] = useState<OrigemLead | null>(null);
  /** O texto da busca. Filtra junto com a origem — os dois se somam, não se substituem. */
  const [busca, setBusca] = useState("");
  /**
   * AS COLUNAS RECOLHIDAS, por id de etapa.
   *
   * Guardado no navegador de quem usa, e não no banco: quais colunas alguém quer ver
   * abertas é preferência de quem está olhando, e num quadro que o escritório desenha com
   * doze etapas ela muda várias vezes por dia. Gravar no servidor faria a escolha de um
   * atendente reorganizar a tela do outro.
   */
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_RECOLHIDAS);
      if (salvo) setRecolhidas(new Set(JSON.parse(salvo) as string[]));
    } catch {
      // Navegador sem storage (janela anônima, cookies bloqueados): o quadro abre com
      // tudo expandido, que é o estado correto de quem nunca escolheu nada.
    }
  }, []);
  function alternarColuna(id: string) {
    setRecolhidas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      try {
        localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify(Array.from(proxima)));
      } catch {
        // Não poder lembrar a escolha não é motivo para não obedecê-la agora.
      }
      return proxima;
    });
  }
  const [assumindo, setAssumindo] = useState(false);

  const vivos = funis.filter((f) => !f.arquivado);
  const funil = vivos.find((f) => f.id === funilId) ?? funilPadrao(funis);
  /**
   * QUANTOS CASOS VIERAM DE CADA PORTA. Conta sobre TODOS os leads, e não sobre os
   * filtrados — senão o número ao lado de cada opção mudaria conforme a opção escolhida,
   * e um contador que muda de valor quando você olha para ele não conta nada.
   */
  const porOrigem = useMemo(() => {
    const conta = new Map<OrigemLead, number>();
    for (const l of leads) {
      const o = (l.origem ?? "whatsapp") as OrigemLead;
      conta.set(o, (conta.get(o) ?? 0) + 1);
    }
    return conta;
  }, [leads]);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, "");
    return leads.filter((l) => {
      if (origem && (l.origem ?? "whatsapp") !== origem) return false;
      if (!termo) return true;
      // O TELEFONE SE BUSCA POR DÍGITO. Quem procura "99341-4083" no quadro está lendo o
      // número de uma agenda ou de um bilhete, com a pontuação que estiver lá; comparar
      // texto com texto erraria em toda grafia diferente da gravada.
      if (digitos.length >= 4 && (l.whatsappNumber ?? "").replace(/\D/g, "").includes(digitos)) {
        return true;
      }
      return CAMPOS_DA_BUSCA.some((campo) => semAcento(String(campo(l) ?? "")).includes(termo));
    });
  }, [leads, origem, busca]);

  const colunas = useMemo(
    () => montarQuadro(filtrados, funil, etapas, agora),
    [filtrados, funil, etapas, agora],
  );
  const doFunil = etapas.filter((e) => e.funilId === funil.id && !e.arquivada);
  const semDesfecho = faltamDesfechos(doFunil);
  const leadAberto = aberto ? leads.find((l) => l.id === aberto) ?? null : null;

  async function assumirDoResumo(lead: LeadDaFila) {
    setAssumindo(true);
    const destino =
      doFunil.find((e) => e.status === "em_atendimento") ??
      colunas.find((c) => c.etapa.status === "em_atendimento")?.etapa;
    if (destino) await mover(lead, destino);
    setAssumindo(false);
    setAberto(null);
  }

  /**
   * Move o card na tela, chama o endpoint e desfaz se ele recusar.
   *
   * A tradução "soltei nesta coluna" → "que ação é essa" acontece pelo STATUS da etapa,
   * não pelo nome dela: é o que faz uma etapa nova chamada "aguardando certidão" herdar
   * as regras de "em atendimento" sem uma linha de código a mais.
   */
  async function mover(lead: LeadDaFila, etapa: EtapaCrm, extra?: CorpoDoMovimento) {
    const de = lead.atendimentoStatus ?? "novo";
    const mesmaEtapa = lead.etapaId === etapa.id && lead.funilId === etapa.funilId;
    if (mesmaEtapa) return;

    const t = de === etapa.status ? null : transicao(de, etapa.status);
    if (de !== etapa.status && !t) return;
    const acao = t?.acao ?? "mover";

    setErro(null);
    const antes = leads;
    setLeads((atual) =>
      atual.map((l) =>
        l.id === lead.id
          ? { ...l, atendimentoStatus: etapa.status, etapaId: etapa.id, funilId: etapa.funilId }
          : l,
      ),
    );

    const r = await fetch(`/api/leads/${lead.id}/atendimento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao,
        para: t?.para,
        ...extra,
        etapaId: etapa.id,
        funilId: etapa.funilId,
      }),
    }).catch(() => null);

    if (!r?.ok) {
      setLeads(antes);
      setErro(
        (await r?.json().catch(() => null))?.error ??
          "Não foi possível mover este atendimento. Nada foi alterado.",
      );
      return;
    }
    router.refresh();
  }

  /**
   * Onde o arrasto para e pergunta. Proposta, fechamento e perda afirmam um FATO que só
   * existe se alguém digitar — e o endpoint recusa os três sem os dados, então perguntar
   * aqui é o que evita um erro vermelho depois de um gesto que pareceu ter dado certo.
   */
  function pedirOuMover(lead: LeadDaFila, etapa: EtapaCrm) {
    const de = lead.atendimentoStatus ?? "novo";
    const t = de === etapa.status ? null : transicao(de, etapa.status);
    const tipo: TipoDeMovimento | null = t?.exigeProposta
      ? "propor"
      : t?.exigeValor
        ? "fechar"
        : t?.exigeMotivo
          ? "perder"
          : null;
    if (tipo) setPerguntando({ lead, etapa, tipo });
    else void mover(lead, etapa);
  }

  function soltar(etapa: EtapaCrm) {
    const lead = leads.find((l) => l.id === arrastando);
    setArrastando(null);
    setSobre(null);
    if (lead) pedirOuMover(lead, etapa);
  }

  async function criarFunil() {
    const nome = nomeNovoFunil.trim();
    if (nome.length < 2) return;
    const r = await fetch("/api/crm/funis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(corpo?.error ?? "Não foi possível criar o funil.");
      return;
    }
    // Um funil sem etapa é um quadro vazio. O primeiro desenho vem pronto com as três
    // colunas de trabalho e as duas de desfecho — dá para renomear tudo em seguida.
    const base: { nome: string; status: AtendimentoStatus; ajuda: string }[] = [
      { nome: "Novo", status: "novo", ajuda: "Chegou e ninguém pegou." },
      { nome: "Em atendimento", status: "em_atendimento", ajuda: "Alguém do time está com a bola." },
      { nome: "Proposta enviada", status: "proposta_enviada", ajuda: "O orçamento está com a pessoa, esperando resposta." },
      { nome: "Reunião agendada", status: "agendado", ajuda: "Reunião marcada com a pessoa." },
      { nome: "Fechado", status: "fechado", ajuda: "Virou cliente ou o assunto se resolveu." },
      { nome: "Perdido", status: "perdido", ajuda: "Não virou atendimento — com o motivo registrado." },
    ];
    const novas: EtapaCrm[] = [];
    for (let i = 0; i < base.length; i++) {
      const e = base[i];
      const resp = await fetch("/api/crm/etapas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...e, funilId: corpo.funil.id, ordem: i }),
      }).catch(() => null);
      const c = await resp?.json().catch(() => null);
      if (c?.etapa) novas.push(c.etapa);
    }
    setFunis((f) => [...f, corpo.funil]);
    setEtapas((e) => [...e, ...novas]);
    setFunilId(corpo.funil.id);
    setNomeNovoFunil("");
    setCriandoFunil(false);
    setEditando(true);
  }

  return (
    <div className="space-y-3">
      {erro ? (
        <div role="alert" className="rounded-xl border border-ib-danger/30 bg-ib-danger/[0.06] px-4 py-3 text-sm text-ib-danger">
          {erro}
        </div>
      ) : null}

      {/* ─── A BARRA DE FUNIS ───
          Um funil por vez. Mostrar dois ao mesmo tempo faria o mesmo caso aparecer em dois
          lugares — e um caso contado duas vezes é trabalho alocado duas vezes. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Funis" className="flex flex-wrap gap-1">
          {vivos.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === funil.id}
              onClick={() => setFunilId(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                f.id === funil.id
                  ? "bg-ib-carimbo text-white"
                  : "bg-white text-ib-slate ring-1 ring-inset ring-ib-line hover:text-ib-ink"
              }`}
            >
              {f.nome}
              {f.padrao ? <span className="ml-1 opacity-60">·padrão</span> : null}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* PARA A PLANILHA. O quadro é onde o comercial trabalha, e é daqui que sai o
              pedido de "me manda isso em Excel". A exportação é escopada, registrada no
              log de acesso e restrita por papel — ver app/api/exportar/leads. */}
          {podeExportar ? (
            <a href="/api/exportar/leads?escopo=fila" className={btnBarra} title="Baixar os casos em CSV">
              <Icon name="doc" className="h-4 w-4 text-ib-slate" />
              Exportar
            </a>
          ) : null}

          {podeDesenhar ? (
            <button
              type="button"
              onClick={() => setEditando((e) => !e)}
              className={editando ? btnBarraAtivo : btnBarra}
              title="Renomear, reordenar e criar colunas"
            >
              <Icon name="gear" className={`h-4 w-4 ${editando ? "text-white" : "text-ib-slate"}`} />
              {editando ? "Fechar etapas" : "Editar etapas"}
            </button>
          ) : null}
        </div>

        {podeDesenhar ? (
          <div className="flex items-center gap-1.5">
            {criandoFunil ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={nomeNovoFunil}
                  onChange={(e) => setNomeNovoFunil(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void criarFunil()}
                  placeholder="nome do funil"
                  className="w-40 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 text-xs text-ib-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
                />
                <button type="button" onClick={() => void criarFunil()} className={btnPrimary}>
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setCriandoFunil(false)}
                  className="text-xs font-semibold text-ib-slate hover:underline"
                >
                  cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setCriandoFunil(true)}
                className={btnBarra}
                title="Um funil é um conjunto de colunas para outro tipo de trabalho"
              >
                <Icon name="plus" className="h-4 w-4 text-ib-slate" />
                Novo funil
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* ─── BUSCA ───
          Um quadro com doze colunas e centenas de cards não se lê rolando. A busca é o
          jeito de responder "cadê o caso do fulano?" sem abrir coluna por coluna — e,
          neste domínio, de juntar os casos parecidos ("venezuela", "refúgio", "Boa
          Vista") para tratar de uma vez. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ib-slate">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, nacionalidade, caso…"
            aria-label="Buscar casos no quadro"
            className="w-full rounded-lg border border-ib-line bg-white py-2 pl-9 pr-9 text-sm text-ib-ink placeholder:text-ib-slate/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar a busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-semibold text-ib-slate hover:bg-ib-papel hover:text-ib-ink"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* QUANTOS SOBRARAM. Sem este número, uma busca que não acha nada é
            indistinguível de um quadro vazio — e de um filtro de origem esquecido ligado. */}
        {busca || origem ? (
          <p className="text-xs text-ib-slate">
            <span className="font-semibold text-ib-ink">{filtrados.length}</span> de {leads.length}{" "}
            {leads.length === 1 ? "caso" : "casos"}
            {filtrados.length === 0 ? " — nada bate com o que você procurou" : ""}
          </p>
        ) : null}

        {recolhidas.size > 0 ? (
          <button
            type="button"
            onClick={() => {
              setRecolhidas(new Set());
              try {
                localStorage.removeItem(CHAVE_RECOLHIDAS);
              } catch {
                // sem storage, a escolha já valeu na tela
              }
            }}
            className="ml-auto text-xs font-semibold text-ib-carimbo hover:underline"
          >
            Expandir as {recolhidas.size} colunas recolhidas
          </button>
        ) : null}
      </div>

      {/* ─── DE ONDE OS CASOS VIERAM ───
          Aparece só quando há mais de uma porta na tela. Enquanto o WhatsApp for a única
          origem, um filtro com uma opção só é um controle que não filtra nada — e um
          controle inerte ensina a ignorar a barra inteira. Ele nasce no dia em que a
          primeira carga da planilha ou o primeiro contato do site entram. */}
      {porOrigem.size > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ib-slate">
            Chegou por
          </span>
          <ChipDeOrigem
            ativo={origem === null}
            rotulo="Todas"
            quantos={leads.length}
            onClick={() => setOrigem(null)}
          />
          {(Object.keys(ORIGEM_LABEL) as OrigemLead[])
            .filter((o) => porOrigem.has(o))
            .map((o) => (
              <ChipDeOrigem
                key={o}
                ativo={origem === o}
                rotulo={ORIGEM_LABEL[o]}
                quantos={porOrigem.get(o) ?? 0}
                onClick={() => setOrigem((atual) => (atual === o ? null : o))}
              />
            ))}
        </div>
      ) : null}

      {funil.descricao ? (
        <p className="text-xs text-ib-slate">{funil.descricao}</p>
      ) : null}

      {semDesfecho.length ? (
        <p className="rounded-lg border border-ib-line bg-ib-papel/70 px-3 py-2 text-xs text-ib-slate">
          Este funil não tem etapa de {semDesfecho.map((s) => (s === "fechado" ? "fechamento" : "perda")).join(" nem de ")}.
          Sem ela o caso entra e não sai — e o desfecho deixa de ser contado.
        </p>
      ) : null}

      {editando && podeDesenhar ? (
        <GerenciarEtapas
          funil={funil}
          etapas={doFunil}
          // A contagem vem das colunas já montadas: é o mesmo número que o cabeçalho de
          // cada coluna mostra. Recontar aqui, por outro caminho, seria a maneira mais
          // fácil de a tela dizer 7 num lugar e 8 no outro.
          contagem={Object.fromEntries(colunas.map((c) => [c.etapa.id, c.leads.length]))}
          podeApagarFunil={!funil.padrao && vivos.length > 1}
          aoMudar={(proximas) =>
            setEtapas((todas) => [...todas.filter((e) => e.funilId !== funil.id), ...proximas])
          }
          aoMudarFunil={(f) => {
            if (!f) {
              setFunis((atual) => atual.filter((x) => x.id !== funil.id));
              setEtapas((atual) => atual.filter((e) => e.funilId !== funil.id));
              setFunilId(funilPadrao(funis.filter((x) => x.id !== funil.id)).id);
              setEditando(false);
              return;
            }
            setFunis((atual) => atual.map((x) => (x.id === f.id ? f : f.padrao ? { ...x, padrao: false } : x)));
          }}
          aoErrar={setErro}
        />
      ) : null}

      {colunas.length === 0 ? (
        <p className="rounded-xl border border-ib-line bg-ib-papel/50 px-4 py-8 text-center text-sm text-ib-slate">
          Este funil ainda não tem etapas. {podeDesenhar ? "Crie a primeira em “Editar etapas”." : "Peça a um advogado para desenhá-lo."}
        </p>
      ) : (
        /* QUADRO KANBAN ROLA NA HORIZONTAL — NÃO QUEBRA LINHA.
           Com grid, a quinta coluna caía para uma segunda fileira e PERDIDO aparecia
           embaixo de NOVO, como se fosse continuação dela. Um quadro de etapas se lê da
           esquerda para a direita: a ordem das colunas É a informação. Largura fixa e
           rolagem lateral mantêm essa leitura com cinco colunas ou com doze. */
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {colunas.map((coluna) => {
            const totalPaginas = Math.max(1, Math.ceil(coluna.leads.length / POR_COLUNA));
            // A página guardada pode ter deixado de existir: basta a busca filtrar, ou
            // alguém mover um card para outra coluna. Presa fora da faixa, a coluna
            // apareceria vazia com casos dentro — que é o defeito mais caro deste quadro.
            const pagina = Math.min(paginas[coluna.etapa.id] ?? 1, totalPaginas);
            const mostrando = coluna.leads.slice((pagina - 1) * POR_COLUNA, pagina * POR_COLUNA);

            /* ─── A COLUNA RECOLHIDA ───
               Vira uma faixa estreita com o nome de pé e a contagem. Continua sendo alvo
               de arrasto: recolher uma coluna é dizer "não preciso ver o conteúdo agora",
               e não "não quero mais mover nada para cá" — num funil de doze etapas, as
               que se recolhem são justamente as de arquivo, que recebem card o tempo
               todo. Some a coluna como destino e o arrasto passa a ter um buraco. */
            if (recolhidas.has(coluna.etapa.id)) {
              return (
                <section
                  key={coluna.etapa.id}
                  aria-label={`${coluna.etapa.nome} (recolhida)`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(coluna.etapa.id);
                  }}
                  onDragLeave={() => setSobre((s) => (s === coluna.etapa.id ? null : s))}
                  onDrop={() => soltar(coluna.etapa)}
                  className={`flex w-12 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border bg-ib-papel/50 py-3 transition ${
                    sobre === coluna.etapa.id ? "border-ib-mar bg-ib-bruma" : "border-ib-line"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => alternarColuna(coluna.etapa.id)}
                    aria-label={`Expandir ${coluna.etapa.nome}`}
                    title={`Expandir ${coluna.etapa.nome}`}
                    className="rounded px-1 text-[11px] font-semibold text-ib-slate hover:bg-white hover:text-ib-ink"
                  >
                    ›
                  </button>
                  <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
                    {coluna.leads.length}
                  </span>
                  <span
                    className="flex-1 text-xs font-semibold uppercase tracking-wide text-ib-slate"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {coluna.etapa.nome}
                  </span>
                </section>
              );
            }

            return (
              <section
                key={coluna.etapa.id}
                aria-label={coluna.etapa.nome}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(coluna.etapa.id);
                }}
                onDragLeave={() => setSobre((s) => (s === coluna.etapa.id ? null : s))}
                onDrop={() => soltar(coluna.etapa)}
                className={`flex min-h-[8rem] w-[17rem] shrink-0 snap-start flex-col rounded-xl border bg-ib-papel/50 transition ${
                  sobre === coluna.etapa.id ? "border-ib-mar bg-ib-bruma" : "border-ib-line"
                }`}
              >
                <header className="border-b border-ib-line px-3 py-2">
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-ib-ink">
                      {coluna.etapa.nome}
                    </h2>
                    <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ib-slate ring-1 ring-inset ring-ib-line">
                      {coluna.leads.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarColuna(coluna.etapa.id)}
                      aria-label={`Recolher ${coluna.etapa.nome}`}
                      title={`Recolher ${coluna.etapa.nome}`}
                      className="-mr-1 rounded px-1 text-[11px] font-semibold text-ib-slate hover:bg-white hover:text-ib-ink"
                    >
                      ‹
                    </button>
                  </div>
                  {coluna.etapa.ajuda ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-ib-slate">{coluna.etapa.ajuda}</p>
                  ) : null}
                </header>

                <div className="flex flex-1 flex-col gap-2 p-2">
                  {mostrando.length === 0 ? (
                    <p className="px-1 py-4 text-[11px] leading-relaxed text-ib-slate">Nada aqui.</p>
                  ) : null}

                  {mostrando.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setArrastando(lead.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={`cursor-grab active:cursor-grabbing ${
                        arrastando === lead.id ? "opacity-40" : ""
                      }`}
                    >
                      <CardDoAtendimento lead={lead} agora={agora} onAbrir={(l) => setAberto(l.id)} />
                      {/* O caminho sem arrasto: existe sempre, e no celular é o único. */}
                      {/* O caminho sem arrasto — no celular é o único que existe, e
                          por isso ele some no desktop (`xl:hidden`), onde arrastar já
                          resolve e um seletor por card viraria ruído em cinco colunas. */}
                      <div className="mt-1 px-1 xl:hidden">
                        <Selecao
                          compacto
                          label="mover para"
                          valor={coluna.etapa.id}
                          onChange={(id) => {
                            const destino = doFunil.find((x) => x.id === id);
                            if (destino) pedirOuMover(lead, destino);
                          }}
                          opcoes={doFunil.map((e) => ({
                            valor: e.id,
                            rotulo: e.nome,
                            ajuda: e.ajuda ?? undefined,
                          }))}
                        />
                      </div>
                    </div>
                  ))}

                  {totalPaginas > 1 ? (
                    <nav
                      aria-label={`Páginas de ${coluna.etapa.nome}`}
                      className="mt-1 flex items-center justify-between gap-1 border-t border-ib-line pt-2"
                    >
                      <PassoDaColuna
                        rotulo="‹"
                        titulo="Página anterior"
                        ativo={pagina > 1}
                        onClick={() =>
                          setPaginas((p) => ({ ...p, [coluna.etapa.id]: pagina - 1 }))
                        }
                      />
                      <span className="font-mono text-[11px] tabular-nums text-ib-slate">
                        {(pagina - 1) * POR_COLUNA + 1}–{(pagina - 1) * POR_COLUNA + mostrando.length}{" "}
                        de {coluna.leads.length}
                      </span>
                      <PassoDaColuna
                        rotulo="›"
                        titulo="Próxima página"
                        ativo={pagina < totalPaginas}
                        onClick={() =>
                          setPaginas((p) => ({ ...p, [coluna.etapa.id]: pagina + 1 }))
                        }
                      />
                    </nav>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {leadAberto ? (
        <ResumoDoLead
          lead={leadAberto}
          agora={agora}
          assumindo={assumindo}
          onFechar={() => setAberto(null)}
          onAssumir={assumirDoResumo}
          funis={vivos}
          etapas={etapas.filter((e) => !e.arquivada)}
          onMover={(l, etapa) => pedirOuMover(l, etapa)}
        />
      ) : null}

      {perguntando ? (
        <DialogoDeMovimento
          tipo={perguntando.tipo}
          nomeDoContato={perguntando.lead.contactName ?? "esta pessoa"}
          aoCancelar={() => setPerguntando(null)}
          aoConfirmar={(corpo) => {
            const { lead, etapa } = perguntando;
            setPerguntando(null);
            void mover(lead, etapa, corpo);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * UMA OPÇÃO DO FILTRO DE ORIGEM.
 *
 * O número ao lado não é enfeite: é ele que responde a pergunta que o filtro levanta
 * ("quanto o site está trazendo?") sem obrigar ninguém a clicar em cada opção e contar
 * card na tela.
 */
function ChipDeOrigem({
  ativo,
  rotulo,
  quantos,
  onClick,
}: {
  ativo: boolean;
  rotulo: string;
  quantos: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        ativo
          ? "bg-ib-mar text-white"
          : "bg-white text-ib-slate ring-1 ring-inset ring-ib-line hover:text-ib-ink"
      }`}
    >
      {rotulo}
      <span className={`font-mono tabular-nums ${ativo ? "opacity-80" : "opacity-60"}`}>
        {quantos}
      </span>
    </button>
  );
}

/** Uma seta da paginação da coluna. Ponta da lista é `span`, não link morto. */
function PassoDaColuna({
  rotulo,
  titulo,
  ativo,
  onClick,
}: {
  rotulo: string;
  titulo: string;
  ativo: boolean;
  onClick: () => void;
}) {
  if (!ativo) {
    return (
      <span aria-hidden="true" className="px-1.5 text-[11px] font-semibold text-ib-line">
        {rotulo}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="rounded px-1.5 text-[11px] font-semibold text-ib-carimbo transition hover:bg-white"
    >
      {rotulo}
    </button>
  );
}
