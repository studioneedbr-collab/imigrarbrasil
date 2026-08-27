// O CUSTO, DO JEITO QUE SE DECIDE COM ELE.
//
// "4.76 USD" não é uma métrica — é um número solto. Não diz do quê, nem de quando, nem
// se é muito. O número que decide alguma coisa é o CUSTO MÉDIO POR CONVERSA: é ele que
// fecha a precificação com o cliente, é ele que diz se o atendimento se paga, e é o
// único que continua significando a mesma coisa quando o volume dobra.
//
// Junto dele, duas quebras que não são enfeite:
//
//   · POR IDIOMA, porque não custam o mesmo. Conversa em crioulo haitiano passa por
//     transcrição com mais frequência (quem escreve pouco manda áudio) e gasta mais
//     token por resposta. Uma média só esconde isso, e é justamente o público de quem
//     este atendimento existe.
//   · POR MODELO E POR TIPO DE CHAMADA, porque é o único jeito de verificar se a
//     separação entre modelo pequeno e modelo grande está acontecendo de fato. Sem a
//     quebra, "classificamos com o modelo barato" é uma intenção, não um fato.
//
// Tudo aqui é função pura sobre a lista de chamadas: a tela só desenha.

import type { ChamadaLlm, TipoChamadaLlm } from "@/lib/domain/types";

export interface LinhaDeCusto {
  chave: string;
  chamadas: number;
  custoUsd: number;
  /** Chamadas cujo modelo não está na tabela de preços. O custo delas não entrou. */
  semPreco: number;
}

export interface ResumoDeCustos {
  periodo: { de: string; ate: string };
  totalUsd: number;
  chamadas: number;
  /**
   * Chamadas sem preço conhecido no período. Aparece na tela como aviso: enquanto for
   * maior que zero, o total é um PISO, não o custo.
   */
  semPreco: number;
  /** Conversas que tiveram ao menos uma chamada no período. É o denominador da média. */
  conversas: number;
  /** O número que fecha preço com cliente. Nulo quando não houve conversa no período. */
  mediaPorConversaUsd: number | null;
  porIdioma: Array<LinhaDeCusto & { conversas: number; mediaUsd: number }>;
  porModelo: LinhaDeCusto[];
  porTipo: Array<LinhaDeCusto & { tipo: TipoChamadaLlm }>;
}

/** O idioma de cada conversa, para a quebra por idioma. */
export type IdiomaPorConversa = ReadonlyMap<string, string | null | undefined>;

function noPeriodo(iso: string, de: Date, ate: Date): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= de.getTime() && t <= ate.getTime();
}

function agrupar<T>(
  itens: T[],
  chaveDe: (t: T) => string,
  custoDe: (t: T) => number,
  semPrecoDe: (t: T) => boolean,
): LinhaDeCusto[] {
  const mapa = new Map<string, LinhaDeCusto>();
  for (const item of itens) {
    const chave = chaveDe(item);
    const linha = mapa.get(chave) ?? { chave, chamadas: 0, custoUsd: 0, semPreco: 0 };
    linha.chamadas += 1;
    linha.custoUsd += custoDe(item);
    if (semPrecoDe(item)) linha.semPreco += 1;
    mapa.set(chave, linha);
  }
  return Array.from(mapa.values()).sort((a, b) => b.custoUsd - a.custoUsd || b.chamadas - a.chamadas);
}

export function resumirCustos(
  todas: ChamadaLlm[],
  idiomaPorConversa: IdiomaPorConversa,
  de: Date,
  ate: Date,
): ResumoDeCustos {
  // A CHAMADA QUE FALHOU CONTINUA CONTANDO.
  //
  // Provedor cobra tentativa, não sucesso: um timeout depois de gerar 800 tokens custa
  // os 800 tokens. Tirar as falhas daqui faria o custo cair justamente no dia em que o
  // provedor está instável — o dia em que ele mais custa.
  const chamadas = todas.filter((c) => noPeriodo(c.criadoEm, de, ate));

  const total = chamadas.reduce((s, c) => s + (c.precoConhecido ? c.custoUsd : 0), 0);
  const semPreco = chamadas.filter((c) => !c.precoConhecido).length;

  // SÓ O QUE PERTENCE A UM ATENDIMENTO entra na média por conversa. Embedding de busca
  // feita por alguém do time no painel é custo real, entra no total — mas dividir por
  // conversa incluindo esse trabalho inventaria um custo de atendimento que não existe.
  const deConversa = chamadas.filter((c) => c.conversationId);
  const conversas = new Set(deConversa.map((c) => c.conversationId as string));
  const custoDeConversas = deConversa.reduce((s, c) => s + (c.precoConhecido ? c.custoUsd : 0), 0);

  const custoDe = (c: ChamadaLlm) => (c.precoConhecido ? c.custoUsd : 0);
  const semPrecoDe = (c: ChamadaLlm) => !c.precoConhecido;

  // Idioma não detectado aparece como "—" em vez de sumir: é ele que denuncia quando a
  // detecção parou de funcionar para alguma língua — e essas conversas custam também.
  const idiomaDe = (c: ChamadaLlm) =>
    (idiomaPorConversa.get(c.conversationId as string) ?? "").trim().toLowerCase() || "—";

  const porIdioma = agrupar(deConversa, idiomaDe, custoDe, semPrecoDe).map((linha) => {
    const conversasDoIdioma = new Set(
      deConversa.filter((c) => idiomaDe(c) === linha.chave).map((c) => c.conversationId as string),
    ).size;
    return {
      ...linha,
      conversas: conversasDoIdioma,
      mediaUsd: conversasDoIdioma ? linha.custoUsd / conversasDoIdioma : 0,
    };
  });

  return {
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    totalUsd: total,
    chamadas: chamadas.length,
    semPreco,
    conversas: conversas.size,
    mediaPorConversaUsd: conversas.size ? custoDeConversas / conversas.size : null,
    porIdioma,
    porModelo: agrupar(chamadas, (c) => c.modelo, custoDe, semPrecoDe),
    porTipo: agrupar(chamadas, (c) => c.tipo, custoDe, semPrecoDe).map((l) => ({
      ...l,
      tipo: l.chave as TipoChamadaLlm,
    })),
  };
}

/**
 * A SAÚDE DE UM PROVEDOR, lida das chamadas que ele atendeu. Alimenta a tela de
 * Integrações — e é o que responde a pergunta que a tela antiga não respondia: a
 * credencial está configurada, mas ele está sendo USADO?
 */
export interface SaudeDoProvedor {
  chamadas24h: number;
  falhas24h: number;
  ultimaOk: string | null;
  ultimaFalha: string | null;
  /** Para que ele está sendo usado hoje, deduzido do que foi chamado de fato. */
  usos: TipoChamadaLlm[];
  modelos: string[];
}

export function saudeDoProvedor(
  todas: ChamadaLlm[],
  provedor: string,
  desde: Date,
): SaudeDoProvedor {
  const doProvedor = todas.filter((c) => c.provedor === provedor);
  const recentes = doProvedor.filter((c) => Date.parse(c.criadoEm) >= desde.getTime());
  const maisRecente = (lista: ChamadaLlm[]) =>
    lista.map((c) => c.criadoEm).sort().at(-1) ?? null;

  return {
    chamadas24h: recentes.length,
    falhas24h: recentes.filter((c) => !c.ok).length,
    // A última chamada BEM-SUCEDIDA não se limita a 24h de propósito: "a última vez que
    // funcionou foi há seis dias" é uma informação, e ela desaparece se a janela cortar.
    ultimaOk: maisRecente(doProvedor.filter((c) => c.ok)),
    ultimaFalha: maisRecente(doProvedor.filter((c) => !c.ok)),
    usos: Array.from(new Set(recentes.filter((c) => c.ok).map((c) => c.tipo))),
    modelos: Array.from(new Set(recentes.map((c) => c.modelo))).sort(),
  };
}
