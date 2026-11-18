/**
 * PARA ONDE IR DEPOIS DO LOGIN — e só para dentro do painel.
 *
 * O `?next=` é escrito pelo middleware, mas chega pela URL, então qualquer um monta um
 * link com o valor que quiser. A checagem antiga era `começa com "/" e não com "//"`, e
 * isso deixava passar `/\site.com` e `/<tab>/site.com`: o navegador trata `\` como `/` e
 * descarta tab e quebra de linha ao interpretar a URL, e os dois viram `//site.com` —
 * outro site. O resultado era um link do painel de verdade que, depois da senha certa,
 * entregava a pessoa a uma página de terceiros (a tela de "sessão expirada" falsa).
 *
 * Em vez de adivinhar cada truque, pergunta-se ao próprio interpretador de URL: se o
 * caminho, resolvido contra uma origem qualquer, sai dessa origem, ele não é interno.
 *
 * Sem `@/` e sem dependência: é importado por componente cliente.
 */
const ORIGEM_DE_PROVA = "http://interno.invalid";

export function caminhoInterno(raw: string | null | undefined, padrao = "/dashboard"): string {
  if (!raw || !raw.startsWith("/")) return padrao;
  try {
    const url = new URL(raw, ORIGEM_DE_PROVA);
    if (url.origin !== ORIGEM_DE_PROVA) return padrao;
    // Devolve a forma já normalizada, e não o texto cru: o que foi conferido é o que navega.
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}
