// Busca do blog: filtra no navegador o índice de todos os artigos que vem na própria página.
const campo = document.getElementById("busca-blog") as HTMLInputElement | null;
const dados = document.getElementById("indice-blog");
if (campo && dados) {
  const indice: { s: string; t: string; d: string; k: string }[] = JSON.parse(dados.textContent!);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const res = document.getElementById("resultados")!, lista = document.getElementById("resultados-lista")!, n = document.getElementById("resultados-n")!, listagem = document.getElementById("listagem")!;
  campo.addEventListener("input", () => {
    const termos = norm(campo.value.trim()).split(/\s+/).filter(Boolean);
    res.hidden = termos.length === 0;
    listagem.hidden = termos.length > 0;
    if (!termos.length) return;
    const achados = indice.filter((p) => { const h = norm(`${p.t} ${p.d} ${p.k}`); return termos.every((t) => h.includes(t)); });
    n.textContent = achados.length ? `${achados.length} artigo(s) encontrado(s)` : "Nenhum artigo encontrado. Tente outra palavra.";
    lista.innerHTML = achados.map((p) => `<li><a class="servico-item" href="/${p.s}/"><span style="display:block"><strong>${esc(p.t)}</strong><span>${esc(p.d)}</span></span></a></li>`).join("");
  });
}
