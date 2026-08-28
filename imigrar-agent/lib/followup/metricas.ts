// AS MÉTRICAS DO FOLLOW-UP — o que os toques dizem quando somados.
//
// Uma delas vale mais que todas as outras juntas, e é o motivo deste arquivo existir:
// A TAXA DE RESPOSTA POR IDIOMA.
//
// O projeto inteiro se apoia na promessa de atender em qualquer língua. Se essa promessa
// se quebrar, ela se quebra em silêncio: os modelos em português continuam funcionando,
// as pessoas que falam crioulo simplesmente param de responder, e nada na tela indica
// nada. Um idioma com taxa de resposta muito abaixo dos outros quase sempre significa
// tradução ruim ou tom errado — e é uma correção de uma tarde, se alguém souber.
//
// Puro de propósito: recebe os toques e devolve números. Sem banco, sem relógio.

import { MOTIVOS_DE_ESPERA, type MotivoEspera } from "@/lib/followup/motivos";
import type { Lead, ToqueDeFollowup } from "@/lib/domain/types";

export interface LinhaDeMetrica {
  chave: string;
  rotulo: string;
  enviados: number;
  responderam: number;
  /** Nula quando não houve envio: 0% e "sem dados" são respostas diferentes. */
  taxa: number | null;
}

export interface MetricasDeFollowup {
  enviados: number;
  responderam: number;
  taxaGeral: number | null;
  /** Escritos e recusados por quem aprovaria. Modelo pulado toda vez é modelo errado. */
  pulados: number;
  /** Viraram trabalho manual: sem modelo no idioma, ou prazo processual. */
  tarefas: number;
  porMotivo: LinhaDeMetrica[];
  porIdioma: LinhaDeMetrica[];
  /** Voltaram a responder depois de um toque. É o que o follow-up recuperou. */
  recuperados: number;
  /** Foram para PERDIDO por esgotamento da sequência. É o que ele não recuperou. */
  perdidosPorEsgotamento: number;
  /** Tempo médio de espera, em dias, por motivo — só dos casos ainda parados. */
  esperaMediaDias: { chave: MotivoEspera; rotulo: string; dias: number; casos: number }[];
}

const SEM_IDIOMA = "—";

export function metricasDeFollowup(
  toques: ToqueDeFollowup[],
  leads: Lead[],
  rotulos: { motivo: Record<string, string>; idioma: (c: string) => string },
  agora: Date = new Date(),
): MetricasDeFollowup {
  const enviados = toques.filter((t) => t.status === "enviado");
  const responderam = enviados.filter((t) => t.respondidoEm);

  return {
    enviados: enviados.length,
    responderam: responderam.length,
    taxaGeral: taxa(responderam.length, enviados.length),
    pulados: toques.filter((t) => t.status === "pulado").length,
    tarefas: toques.filter((t) => t.status === "tarefa" || t.status === "feito").length,

    porMotivo: agrupar(
      enviados,
      (t) => t.motivo,
      (chave) => rotulos.motivo[chave] ?? chave,
    ),
    // O idioma vem do toque e não do contato: é a língua em que a mensagem SAIU, que é o
    // que esta taxa está julgando. Se o contato mudou de idioma depois, isso não pode
    // reescrever o resultado de uma mensagem que já foi mandada em outra língua.
    porIdioma: agrupar(
      enviados,
      (t) => t.idioma || SEM_IDIOMA,
      (chave) => (chave === SEM_IDIOMA ? "idioma não identificado" : rotulos.idioma(chave)),
    ),

    // Recuperado = a pessoa voltou a falar depois de um toque. Contado por CASO e não por
    // toque: quem respondeu ao terceiro depois de ignorar dois foi recuperado uma vez, e
    // contá-lo três vezes inflaria justamente o número que se usa para justificar a régua.
    recuperados: new Set(responderam.map((t) => t.leadId).filter(Boolean)).size,
    perdidosPorEsgotamento: leads.filter(
      (l) => l.atendimentoStatus === "perdido" && l.motivoPerdaCategoria === "sumiu",
    ).length,

    esperaMediaDias: MOTIVOS_DE_ESPERA.map((m) => {
      const casos = leads.filter((l) => l.esperaMotivo === m && l.esperaDesde);
      const dias = casos.map(
        (l) => (agora.getTime() - Date.parse(l.esperaDesde!)) / 86_400_000,
      );
      return {
        chave: m,
        rotulo: rotulos.motivo[m] ?? m,
        dias: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
        casos: casos.length,
      };
    }).filter((l) => l.casos > 0),
  };
}

function agrupar(
  enviados: ToqueDeFollowup[],
  chaveDe: (t: ToqueDeFollowup) => string,
  rotuloDe: (chave: string) => string,
): LinhaDeMetrica[] {
  const mapa = new Map<string, { enviados: number; responderam: number }>();
  for (const t of enviados) {
    const k = chaveDe(t);
    const atual = mapa.get(k) ?? { enviados: 0, responderam: 0 };
    atual.enviados++;
    if (t.respondidoEm) atual.responderam++;
    mapa.set(k, atual);
  }
  return Array.from(mapa.entries())
    .map(([chave, v]) => ({
      chave,
      rotulo: rotuloDe(chave),
      enviados: v.enviados,
      responderam: v.responderam,
      taxa: taxa(v.responderam, v.enviados),
    }))
    .sort((a, b) => b.enviados - a.enviados);
}

/** Percentual inteiro, ou null quando não houve envio. Zero e "sem dados" são diferentes. */
function taxa(parte: number, total: number): number | null {
  return total === 0 ? null : Math.round((parte / total) * 100);
}
