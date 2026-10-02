// Marca no índice lateral do artigo a seção que está na tela.
const links = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>(".indice a").forEach((a) => links.set(a.hash.slice(1), a));
if (links.size) {
  const obs = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.classList.remove("ativo"));
    links.get(e.target.id)?.classList.add("ativo");
  }), { rootMargin: "-20% 0px -70% 0px" });
  document.querySelectorAll(".prosa h2[id]").forEach((h) => obs.observe(h));
}
