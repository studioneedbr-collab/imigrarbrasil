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
 * TETO DE CARGA — quantos leads a fila busca no banco por vez.
 *
 * A ordenação da fila é feita em memória, em cima de TODOS os leads, porque a regra dos
 * três blocos não cabe num `order by` (ver lib/fila/ordenacao.ts). Isso é barato com
 * centenas de casos e deixa de ser com milhares. O teto segura o custo sem reescrever a
 * regra em SQL — e a tela AVISA quando corta, que é a única parte inegociável: uma
 * página que esconde metade dos casos em silêncio é pior do que uma página lenta.
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
