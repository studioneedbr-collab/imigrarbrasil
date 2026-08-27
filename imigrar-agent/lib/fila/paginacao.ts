// PAGINAÇÃO — a regra, isolada e testável.
//
// Uma tela que rola sem fim parece funcionar até o dia em que funciona menos: o time
// entra às 8h, precisa varrer o que chegou, e o navegador está desenhando mil linhas
// para alguém que vai olhar as vinte primeiras.
//
// A regra que importa não é a aritmética — é ONDE ela pode ser aplicada. Os dois blocos
// de prazo da fila NÃO paginam, nunca: são pequenos por natureza e são exatamente o que
// não pode sumir atrás de um botão. Pagina o bloco 3, pagina Filtradas, paginam as
// colunas do kanban. Quem decide isso é a página; aqui mora só o corte.

/** Vinte e cinco cabe numa tela de trabalho sem rolar até o rodapé. */
export const POR_PAGINA = 25;

export interface Pagina<T> {
  itens: T[];
  /** Já normalizada: nunca menor que 1, nunca maior que `totalPaginas`. */
  pagina: number;
  totalPaginas: number;
  /** Quantos itens existem ao todo — é o que a legenda "25 de 312" mostra. */
  total: number;
  /** Índice humano do primeiro e do último item desta página (1-based). */
  de: number;
  ate: number;
}

/**
 * Corta a fatia da página pedida.
 *
 * Página fora do intervalo é PRESA no intervalo, não devolvida vazia: um link antigo com
 * `?p=9` numa lista que encolheu para duas páginas mostraria uma tela em branco, e quem
 * vê tela em branco acha que perdeu os dados, não que errou a página.
 */
export function paginar<T>(itens: T[], pagina: number, porPagina: number = POR_PAGINA): Pagina<T> {
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(Math.trunc(pagina) || 1, 1), totalPaginas);
  const inicio = (atual - 1) * porPagina;
  const fatia = itens.slice(inicio, inicio + porPagina);
  return {
    itens: fatia,
    pagina: atual,
    totalPaginas,
    total,
    de: total === 0 ? 0 : inicio + 1,
    ate: inicio + fatia.length,
  };
}

/** Lê `?p=` da URL sem confiar no que veio: qualquer lixo vira página 1. */
export function paginaDaBusca(valor: string | string[] | undefined): number {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  const n = Number.parseInt(bruto ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * A PÁGINA QUE O BANCO JÁ CORTOU.
 *
 * `paginar` recebe a lista inteira e fatia; esta recebe a fatia pronta e só descreve onde
 * ela está. É a diferença entre as duas paginações que existem no painel — e a razão de
 * ambas existirem: as telas pequenas (Filtradas) continuam carregando tudo e cortando na
 * memória, porque é mais simples e funciona; a Fila não pode, porque um lead que não
 * coube é um prazo que ninguém viu.
 *
 * `total` vem do banco, e é o número honesto: quantos existem NAQUELE BLOCO, já sem
 * ensaio, sem conversa filtrada e sem caso encerrado. Era exatamente essa distinção que
 * faltava quando a tela dizia "42 atendimentos mais recentes, de 43" sem nada ter sido
 * cortado.
 */
export function paginaDoServidor<T>(
  itens: T[],
  pagina: number,
  porPagina: number,
  total: number,
): Pagina<T> {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(Math.trunc(pagina) || 1, 1), totalPaginas);
  const inicio = (atual - 1) * porPagina;
  return {
    itens,
    pagina: atual,
    totalPaginas,
    total,
    de: total === 0 ? 0 : inicio + 1,
    ate: inicio + itens.length,
  };
}

/**
 * TETO DE CARGA — quantos leads a fila busca no banco por vez.
 *
 * A ordenação da fila é feita em memória, em cima dos leads carregados, porque a regra
 * dos três blocos não cabe num `order by` (ver lib/fila/ordenacao.ts). Isso é barato com
 * centenas de casos e deixa de ser com milhares. O teto segura o custo sem reescrever a
 * regra em SQL — e a tela AVISA quando corta, que é a única parte inegociável: uma
 * página que esconde metade dos casos em silêncio é pior do que uma página lenta.
 *
 * A TELA INICIAL NÃO USA MAIS ISTO. Lá o corte passou a ser feito pelo banco, com os
 * blocos de prazo fora da paginação — ver `paginaDoServidor` e `listLeadsDaFila`. O teto
 * continua valendo para as telas que precisam da lista inteira em memória (Filtradas, o
 * quadro), onde um caso que não coube é um card fora de lugar, não um prazo perdido.
 */
export const TETO_DE_CARGA = 500;

export interface Corte {
  cortou: boolean;
  carregados: number;
  total: number;
}

export function avaliarCorte(carregados: number, total: number): Corte {
  return { cortou: total > carregados, carregados, total };
}
