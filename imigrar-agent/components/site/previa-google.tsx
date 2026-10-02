/** Como o item aparece no Google — e se título e descrição cabem sem corte. */
export default function PreviaGoogle({ titulo, descricao, caminho }: { titulo: string; descricao: string; caminho: string }) {
  const t = titulo.length, d = descricao.length;
  return (
    <div className="rounded-xl border border-ib-line bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ib-slate">Como aparece no Google</p>
      <div className="mt-3 max-w-[600px]">
        <p className="truncate text-xs text-[#202124]">imigrarbrasil.com › {caminho.replace(/^\/|\/$/g, "").replace(/\//g, " › ")}</p>
        <p className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab]">{titulo || "Título do artigo"}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156]">{descricao || "A descrição aparece aqui."}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className={t > 60 ? "text-ib-warn" : "text-ib-slate"}>Título: {t}/60 {t > 60 ? "— o Google corta" : ""}</span>
        <span className={d < 70 || d > 160 ? "text-ib-warn" : "text-ib-slate"}>Descrição: {d}/160 {d > 160 ? "— o Google corta" : d < 70 ? "— curta demais" : ""}</span>
      </div>
    </div>
  );
}
