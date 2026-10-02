"use client";

/**
 * CHECKLIST DE SEO DO ARTIGO, ao vivo enquanto se escreve.
 *
 * Os critérios são os que o site novo já cumpre nos 50 artigos migrados — títulos em h2,
 * descrição no tamanho do Google, imagem com texto alternativo, link para um serviço. Um
 * artigo novo que passe aqui chega ao Google no mesmo padrão dos que já estão
 * posicionados. Nada aqui impede de salvar: é orientação, não trava.
 */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

type Item = { ok: boolean; aviso?: boolean; rotulo: string; dica: string };

export function avaliarSeo(p: { title: string; seoTitle?: string; description: string; slug: string; html: string; keywords: string[]; image: string | null; imageAlt: string | null }): Item[] {
  const titulo = p.seoTitle || p.title;
  const palavras = texto(p.html).split(" ").filter(Boolean).length;
  const h2 = (p.html.match(/<h2[\s>]/gi) ?? []).length;
  const imgs = p.html.match(/<img\b[^>]*>/gi) ?? [];
  const semAlt = imgs.filter((i) => !/\balt\s*=\s*"[^"]+"/i.test(i)).length;
  const linksInternos = (p.html.match(/href\s*=\s*"(\/|https:\/\/(www\.)?imigrarbrasil\.com)/gi) ?? []).length;
  const linkServico = /href\s*=\s*"(https:\/\/(www\.)?imigrarbrasil\.com)?\/servico\//i.test(p.html);
  const principal = norm(p.keywords[0] ?? "");
  const primeiroParagrafo = norm(texto(p.html.match(/<p[\s>][\s\S]*?<\/p>/i)?.[0] ?? ""));

  return [
    { ok: titulo.length >= 30 && titulo.length <= 60, aviso: titulo.length > 60 && titulo.length <= 70, rotulo: `Título com ${titulo.length} caracteres`, dica: "Entre 30 e 60: acima disso o Google corta." },
    { ok: p.description.length >= 120 && p.description.length <= 160, aviso: p.description.length >= 70, rotulo: `Descrição com ${p.description.length} caracteres`, dica: "Entre 120 e 160. É o texto que aparece embaixo do título no Google." },
    { ok: !!p.slug && p.slug.length <= 75, rotulo: "Endereço curto", dica: "Até 75 caracteres, só as palavras que importam." },
    { ok: palavras >= 600, aviso: palavras >= 300, rotulo: `${palavras} palavras`, dica: "600 ou mais. Os artigos que posicionam no blog têm entre 1.500 e 3.000." },
    { ok: h2 >= 2, rotulo: `${h2} títulos de seção`, dica: "Use o botão “Título” para dividir o texto. Eles viram o índice do artigo." },
    { ok: !!p.image && !!p.imageAlt, aviso: !!p.image, rotulo: "Capa com texto alternativo", dica: "Envie uma capa 16:9 e descreva a imagem em poucas palavras." },
    { ok: semAlt === 0, rotulo: imgs.length ? `${imgs.length - semAlt}/${imgs.length} imagens com descrição` : "Imagens do texto", dica: "Toda imagem precisa de descrição (texto alternativo)." },
    // Recomendação, não falha: o site já põe a caixa do serviço relacionado no fim de todo
    // artigo (site/src/lib/blog.ts). Um link no meio do texto reforça.
    { ok: linkServico, aviso: true, rotulo: linkServico ? "Link para um serviço no texto" : `${linksInternos} links internos no texto`, dica: "O site já mostra o serviço relacionado no fim. Um link no meio do texto (/servico/…) reforça." },
    { ok: p.keywords.length >= 3, rotulo: `${p.keywords.length} palavras-chave`, dica: "Ao menos 3. A primeira é a principal." },
    {
      ok: !!principal && norm(titulo).includes(principal) && norm(p.description).includes(principal),
      aviso: !!principal && (norm(titulo).includes(principal) || norm(p.description).includes(principal)),
      rotulo: principal ? `“${p.keywords[0]}” no título e na descrição` : "Palavra-chave principal",
      dica: "A primeira palavra-chave deve aparecer no título e na descrição.",
    },
    { ok: !!principal && primeiroParagrafo.includes(principal), rotulo: "Palavra-chave no primeiro parágrafo", dica: "O Google dá peso ao começo do texto." },
  ];
}

export default function ChecklistSeo({ itens }: { itens: Item[] }) {
  const feitos = itens.filter((i) => i.ok).length;
  const nota = Math.round((feitos / itens.length) * 100);
  const cor = nota >= 80 ? "text-[#15803D]" : nota >= 50 ? "text-[#8a5308]" : "text-ib-danger";
  return (
    <div className="rounded-xl border border-ib-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">SEO do artigo</p>
        <p className={`font-mono text-sm font-bold ${cor}`}>{feitos}/{itens.length}</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-ib-papel">
        <div className={`h-1.5 rounded-full transition-all ${nota >= 80 ? "bg-ib-success" : nota >= 50 ? "bg-ib-warn" : "bg-ib-danger"}`} style={{ width: `${nota}%` }} />
      </div>
      <ul className="mt-3 space-y-2">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex gap-2 text-[13px] leading-snug">
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${i.ok ? "bg-ib-success" : i.aviso ? "bg-ib-warn" : "bg-slate-300"}`} aria-hidden>{i.ok ? "✓" : "!"}</span>
            <span><span className="font-semibold text-ib-ink">{i.rotulo}</span>{i.ok ? null : <span className="block text-ib-slate">{i.dica}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
