import Link from "next/link";
import type { Corte, Pagina } from "@/lib/fila/paginacao";

/**
 * PAGINAÇÃO POR LINK, não por estado de cliente.
 *
 * A Fila e as Filtradas são componentes de servidor: paginar por `?p=` mantém as duas
 * assim, sem transformar a tela inteira em client component só para guardar um número.
 * De quebra, a página vira endereço — dá para mandar "olha a página 3" no WhatsApp do
 * time, e o botão voltar do navegador funciona.
 */
export function Paginacao<T>({
  pagina,
  base,
  rotulo = "itens",
  manter,
}: {
  pagina: Pagina<T>;
  /** Caminho da página, sem query. O parâmetro `p` é acrescentado aqui. */
  base: string;
  rotulo?: string;
  /**
   * OS OUTROS PARÂMETROS DA URL, que precisam sobreviver à troca de página.
   *
   * O link era montado só com `?p=`, o que descarta tudo o mais que estivesse na barra
   * de endereço. Hoje nenhuma tela paginada tem outro filtro, então isso não machuca
   * ninguém — e é exatamente por isso que é perigoso: no dia em que a Fila ganhar um
   * filtro (de origem, de responsável, de idioma), ir para a página 2 vai devolver a
   * lista inteira sem nenhum aviso, e quem estiver usando vai achar que o filtro é que
   * está quebrado.
   *
   * A tela passa o seu próprio `searchParams`; o `p` daqui vence o que vier nele.
   */
  manter?: Record<string, string | string[] | undefined>;
}) {
  if (pagina.totalPaginas <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [chave, valor] of Object.entries(manter ?? {})) {
      if (chave === "p" || valor === undefined) continue;
      // Array acontece quando o mesmo parâmetro aparece duas vezes na URL. O primeiro
      // vale — é o que o Next entrega para a página, e a lista foi montada com ele.
      const v = Array.isArray(valor) ? valor[0] : valor;
      if (v) q.set(chave, v);
    }
    if (p > 1) q.set("p", String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const anterior = pagina.pagina > 1 ? pagina.pagina - 1 : null;
  const proxima = pagina.pagina < pagina.totalPaginas ? pagina.pagina + 1 : null;

  return (
    <nav
      aria-label={`Paginação de ${rotulo}`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-ib-line bg-ib-papel/60 px-5 py-2.5"
    >
      <p className="font-mono text-xs tabular-nums text-ib-slate">
        {pagina.de}–{pagina.ate} de {pagina.total} {rotulo}
      </p>
      <div className="flex items-center gap-1">
        <Passo href={anterior === null ? null : href(anterior)} rotulo="Anterior" />
        <span className="px-2 font-mono text-xs tabular-nums text-ib-slate">
          {pagina.pagina} / {pagina.totalPaginas}
        </span>
        <Passo href={proxima === null ? null : href(proxima)} rotulo="Próxima" />
      </div>
    </nav>
  );
}

/** Ponta da lista é `span`, não link morto: link que não vai a lugar nenhum irrita. */
function Passo({ href, rotulo }: { href: string | null; rotulo: string }) {
  const estilo = "rounded-md px-2.5 py-1 text-xs font-medium";
  if (!href) return <span className={`${estilo} text-ib-line`}>{rotulo}</span>;
  return (
    <Link
      href={href}
      className={`${estilo} text-ib-carimbo ring-1 ring-inset ring-ib-line transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar`}
    >
      {rotulo}
    </Link>
  );
}

/**
 * O AVISO DE CORTE.
 *
 * Só aparece quando o teto de carga cortou de verdade. É a metade inegociável da
 * paginação: uma tela que esconde metade dos casos em silêncio é pior do que uma tela
 * lenta, porque a lenta pelo menos se percebe.
 */
export function AvisoDeCorte({ corte }: { corte: Corte }) {
  if (!corte.cortou) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-ib-warn/30 bg-ib-warn/[0.07] px-4 py-3 text-sm text-[#9A6212]"
    >
      Mostrando os <strong>{corte.carregados}</strong> atendimentos mais recentes, de{" "}
      <strong>{corte.total}</strong>. Os mais antigos não estão nesta tela — use a busca
      ou a exportação para chegar neles.
    </div>
  );
}
