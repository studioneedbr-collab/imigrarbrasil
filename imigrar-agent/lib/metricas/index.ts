// AS MÉTRICAS DESTE PAINEL.
//
// O painel que originou este código media receita, ticket médio e conversão. Aqui a
// pergunta é outra: QUANTO TEMPO DO TIME O AGENTE ECONOMIZOU — e, do outro lado da
// mesma moeda, se ele está economizando tempo demais.
//
// A métrica que protege o projeto é a TAXA DE RESGATE. Um agente que filtra demais
// parece ótimo nos números — pouca conversa chegando ao time — enquanto destrói o
// negócio em silêncio. Só o resgate (humano devolvendo à fila alguém que o agente
// descartou) mostra isso cedo. Se ela sobe, o agente está descartando gente demais.
//
// Não há gráfico de receita, ticket médio ou previsão de faturamento. Não é o que este
// time acompanha.

import type { Classificacao, Reclassificacao } from "@/lib/domain/types";
import { CLASSIFICACOES, CLASSIFICACOES_FILTRADAS, eFiltrada } from "@/lib/domain/types";
import type { LeadDaFila } from "@/lib/fila/ordenacao";
import { prazosPerdidos } from "@/lib/fila/ordenacao";

export interface Metricas {
  /** Recorte usado, em ISO — o rodapé da tela mostra para não haver dúvida. */
  periodo: { de: string; ate: string };
  atendidas: number;
  porIdioma: Array<{ idioma: string; total: number }>;
  /** O número que justifica o projeto: o que o time NÃO precisou olhar. */
  filtradas: { total: number; porClassificacao: Array<{ classificacao: Classificacao; total: number }> };
  /** O que efetivamente chegou ao time, por classificação. */
  qualificados: { total: number; porClassificacao: Array<{ classificacao: Classificacao; total: number }> };
  /** Filtrados que um humano devolveu à fila. Sobe = o agente está descartando demais. */
  resgate: { resgatados: number; base: number; taxa: number };
  /** Quanto o humano discorda da IA. */
  reclassificacao: { reclassificados: number; base: number; taxa: number };
  /**
   * Tempo até um humano assumir, em minutos. Medido separadamente para QUENTE_PRAZO —
   * a média geral esconde justamente o caso em que a demora custa o caso.
   */
  tempoAteHumano: { geralMin: number | null; quentePrazoMin: number | null; semAssumir: number };
  /** Precisa ser zero, e precisa estar visível. */
  prazosPerdidos: LeadDaFila[];

  /**
   * QUEM É ESSA GENTE — nacionalidade, onde está e o que procura.
   *
   * Não estava aqui, e a falta aparecia na primeira pergunta que qualquer sócio faz
   * olhando o painel: "de onde vem a maior parte dos casos?". A resposta existia no
   * banco desde sempre; o que faltava era alguém contar.
   */
  porNacionalidade: Array<{ label: string; total: number }>;
  porLocalizacao: Array<{ label: string; total: number }>;
  porModalidade: Array<{ label: string; total: number }>;

  /**
   * O DESFECHO. Quantos fecharam, quantos se perderam e por quê.
   *
   * "Perdido" com motivo é o dado mais barato de coletar e o mais caro de não ter: é a
   * única forma de responder por que os casos não viram atendimento sem reler cem
   * conversas.
   */
  desfecho: {
    fechados: number;
    perdidos: number;
    emAberto: number;
    /** Taxa de fechamento sobre o que teve desfecho no período. */
    taxaFechamento: number;
    motivos: Array<{ label: string; total: number }>;
  };

  /** Prazos confirmados no período, e quantos ainda correm. */
  prazos: { sinalizados: number; confirmados: number; correndo: number; taxaConfirmacao: number };
}

function noPeriodo(iso: string | null | undefined, de: Date, ate: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= de.getTime() && t <= ate.getTime();
}

function contar(leads: LeadDaFila[], quais: Classificacao[]) {
  return quais
    .map((c) => ({ classificacao: c, total: leads.filter((l) => l.classificacao === c).length }))
    .filter((r) => r.total > 0);
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Minutos entre a chegada do lead e o momento em que um humano assumiu. */
function minutosAteHumano(l: LeadDaFila): number | null {
  if (!l.assumidoEm) return null;
  const min = (Date.parse(l.assumidoEm) - Date.parse(l.createdAt)) / 60_000;
  return Number.isFinite(min) && min >= 0 ? min : null;
}

export function calcularMetricas(
  todosOsLeads: LeadDaFila[],
  reclassificacoes: Reclassificacao[],
  de: Date,
  ate: Date,
  agora: Date = new Date(),
): Metricas {
  // CONVERSA DE TESTE NÃO ENTRA NAS MÉTRICAS.
  //
  // Filtrado aqui, na entrada, e não em cada cálculo: todo número desta tela nasce de
  // `todosOsLeads`, e um filtro por cálculo seria esquecido no próximo número que
  // alguém acrescentasse. Sem isto, a primeira semana de testes envenena a taxa de
  // resgate, a de reclassificação e o tempo até o humano — justamente os três números
  // que existem para dizer se o agente pode ser confiado com gente de verdade.
  const reais = todosOsLeads.filter((l) => l.ambiente !== "teste");
  const leads = reais.filter((l) => noPeriodo(l.createdAt, de, ate));

  const filtradas = leads.filter((l) => eFiltrada(l.classificacao));
  const qualificados = leads.filter((l) => l.classificacao && !eFiltrada(l.classificacao));

  // Idioma desconhecido aparece como tal em vez de sumir: é ele que denuncia quando a
  // detecção parou de funcionar para alguma língua.
  const idiomas = new Map<string, number>();
  for (const l of leads) {
    const k = (l.idioma ?? "").trim().toLowerCase() || "—";
    idiomas.set(k, (idiomas.get(k) ?? 0) + 1);
  }

  // RESGATE. A base é tudo que o agente filtrou no período — inclusive o que já voltou.
  // Usar só o que continua filtrado faria a taxa cair justamente quando o resgate sobe.
  const resgatadosNoPeriodo = reais.filter((l) => noPeriodo(l.resgatadoEm, de, ate));
  const baseResgate = filtradas.length + resgatadosNoPeriodo.length;

  // RECLASSIFICAÇÃO. Base = leads que a IA classificou; numerador = os que um humano
  // mudou de classificação. Um mesmo lead reclassificado duas vezes conta uma vez.
  const baseReclass = leads.filter((l) => l.classificacaoIa).length;
  const idsNoPeriodo = new Set(leads.map((l) => l.id));
  const reclassificados = new Set(
    reclassificacoes.filter((r) => idsNoPeriodo.has(r.leadId)).map((r) => r.leadId),
  ).size;

  const temposGeral = leads.map(minutosAteHumano).filter((n): n is number => n !== null);
  const temposPrazo = leads
    .filter((l) => l.classificacao === "QUENTE_PRAZO" || l.temPrazoCorrendo)
    .map(minutosAteHumano)
    .filter((n): n is number => n !== null);

  // AGRUPAMENTOS DE LEITURA. Contam sobre `leads` (já recortados pelo período) e nunca
  // sobre `reais`: um número que ignora o filtro escolhido é pior do que número nenhum,
  // porque parece responder à pergunta que a pessoa fez.
  const agrupar = (
    valor: (l: LeadDaFila) => string | null | undefined,
    vazio = "não informado",
  ) => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const k = (valor(l) ?? "").trim() || vazio;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  };

  const fechados = leads.filter((l) => l.atendimentoStatus === "fechado").length;
  const perdidos = leads.filter((l) => l.atendimentoStatus === "perdido").length;
  const comDesfecho = fechados + perdidos;

  const sinalizados = leads.filter((l) => l.temPrazoCorrendo || l.prazoDataLimite).length;
  const confirmados = leads.filter((l) => !!l.prazoDataLimite).length;

  return {
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    atendidas: leads.length,
    porNacionalidade: agrupar((l) => l.nacionalidade ?? l.clientType, "nacionalidade não informada"),
    porLocalizacao: agrupar(
      (l) =>
        l.localizacao === "brasil"
          ? "no Brasil"
          : l.localizacao === "exterior"
            ? `no exterior${l.paisExterior ? ` — ${l.paisExterior}` : ""}`
            : null,
      "não se sabe onde está",
    ),
    porModalidade: agrupar((l) => l.modalidadeProvavel, "modalidade a definir"),
    desfecho: {
      fechados,
      perdidos,
      emAberto: leads.length - comDesfecho,
      taxaFechamento: comDesfecho ? fechados / comDesfecho : 0,
      // Só os perdidos entram aqui. Agrupar sobre todos os leads faria cada caso em
      // aberto virar um "sem motivo registrado" — e a lista de motivos passaria a
      // descrever o painel inteiro em vez das perdas.
      motivos: (() => {
        const m = new Map<string, number>();
        for (const l of leads.filter((x) => x.atendimentoStatus === "perdido")) {
          const k = (l.motivoPerda ?? "").trim() || "sem motivo registrado";
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return Array.from(m, ([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
      })(),
    },
    prazos: {
      sinalizados,
      confirmados,
      correndo: leads.filter((l) => l.prazoDataLimite && l.atendimentoStatus !== "fechado" && l.atendimentoStatus !== "perdido").length,
      taxaConfirmacao: sinalizados ? confirmados / sinalizados : 0,
    },
    porIdioma: Array.from(idiomas, ([idioma, total]) => ({ idioma, total })).sort(
      (a, b) => b.total - a.total,
    ),
    filtradas: {
      total: filtradas.length,
      porClassificacao: contar(filtradas, CLASSIFICACOES_FILTRADAS),
    },
    qualificados: {
      total: qualificados.length,
      porClassificacao: contar(
        qualificados,
        CLASSIFICACOES.filter((c) => !CLASSIFICACOES_FILTRADAS.includes(c)),
      ),
    },
    resgate: {
      resgatados: resgatadosNoPeriodo.length,
      base: baseResgate,
      taxa: baseResgate ? resgatadosNoPeriodo.length / baseResgate : 0,
    },
    reclassificacao: {
      reclassificados,
      base: baseReclass,
      taxa: baseReclass ? reclassificados / baseReclass : 0,
    },
    tempoAteHumano: {
      geralMin: media(temposGeral),
      quentePrazoMin: media(temposPrazo),
      semAssumir: leads.filter((l) => !l.assumidoEm && l.atendimentoStatus === "novo").length,
    },
    prazosPerdidos: prazosPerdidos(reais, agora),
  };
}
