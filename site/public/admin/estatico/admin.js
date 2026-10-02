// O comportamento do /admin: busca na lista, editor de texto, capa, prévia do Google,
// checklist de SEO e o salvar. Sem framework e sem build: é servido como está.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const csrf = JSON.parse($("#csrf")?.textContent || '""');
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Confirmação antes de apagar.
  $$("form[data-confirmar]").forEach((f) => f.addEventListener("submit", (e) => { if (!confirm(f.dataset.confirmar)) e.preventDefault(); }));

  // ── lista ───────────────────────────────────────────────────────────────────
  const filtro = $("#filtro");
  if (filtro) {
    filtro.addEventListener("input", () => {
      const termos = norm(filtro.value.trim()).split(/\s+/).filter(Boolean);
      let n = 0;
      $$("#lista li").forEach((li) => { const ok = termos.every((t) => li.dataset.busca.includes(t)); li.hidden = !ok; n += ok; });
      $("#vazio").hidden = n > 0;
    });
  }

  const form = $("#editor");
  if (!form) return;

  // ── editor de texto ─────────────────────────────────────────────────────────
  const area = $("#texto");
  const html = $("#texto-html");
  let modo = "visual";
  let mudou = false;
  const marcar = () => { mudou = true; atualizar(); };
  const textoAtual = () => (modo === "visual" ? area.innerHTML : html.value);

  const exec = (cmd, arg) => {
    area.focus();
    document.execCommand(cmd, false, arg);
    marcar();
  };

  $$(".ferramentas [data-cmd]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => exec(b.dataset.cmd, b.dataset.arg));
  });

  $$(".modo button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.modo === modo) return;
    if (b.dataset.modo === "html") { html.value = area.innerHTML.replace(/<\/(p|h2|h3|h4|ul|ol|li|blockquote|table|tr)>/g, "</$1>\n"); }
    else { area.innerHTML = html.value; }
    modo = b.dataset.modo;
    area.hidden = modo !== "visual";
    html.hidden = modo !== "html";
    $$(".ferramentas [data-cmd], .ferramentas [data-acao]").forEach((x) => (x.disabled = modo !== "visual"));
    $$(".modo button").forEach((x) => x.classList.toggle("ativo", x === b));
  }));
  area.addEventListener("input", marcar);
  html.addEventListener("input", marcar);

  // Colar do Word / Google Docs: fica só a estrutura (ver lib/limpar.php, que repete no servidor).
  const MANTER = new Set(["H2", "H3", "H4", "P", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "A", "BLOCKQUOTE", "BR", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
  function limparColado(h) {
    const doc = new DOMParser().parseFromString(h, "text/html");
    const visitar = (no) => {
      for (const filho of [...no.children]) {
        visitar(filho);
        let el = filho;
        if (el.tagName === "H1") { const n = doc.createElement("h2"); n.innerHTML = el.innerHTML; el.replaceWith(n); el = n; }
        // O Google Docs embrulha tudo num <b style="font-weight:normal">: não é negrito.
        const negritoFalso = el.tagName === "B" && /font-weight:\s*normal/i.test(el.getAttribute("style") || "");
        if (!MANTER.has(el.tagName) || negritoFalso) {
          if (el.tagName === "DIV" && el.textContent.trim()) { const p = doc.createElement("p"); p.innerHTML = el.innerHTML; el.replaceWith(p); el = p; }
          else { el.replaceWith(...el.childNodes); continue; }
        }
        for (const a of [...el.attributes]) {
          const fica = (el.tagName === "A" && a.name === "href") || (el.tagName === "IMG" && (a.name === "src" || a.name === "alt"));
          if (!fica) el.removeAttribute(a.name);
        }
      }
    };
    visitar(doc.body);
    doc.body.querySelectorAll("p, li, h2, h3").forEach((e) => { if (!e.textContent.trim() && !e.querySelector("img")) e.remove(); });
    // Imagem colada de outro site não fica no servidor: some.
    doc.body.querySelectorAll("img").forEach((i) => { if (!/^\/uploads\//.test(i.getAttribute("src") || "")) i.remove(); });
    return doc.body.innerHTML.replace(/&nbsp;/g, " ");
  }
  area.addEventListener("paste", (e) => {
    const h = e.clipboardData.getData("text/html");
    if (!h) return; // texto puro: o navegador já cola sem formatação
    e.preventDefault();
    document.execCommand("insertHTML", false, limparColado(h));
    marcar();
  });

  $('[data-acao="link"]').addEventListener("mousedown", (e) => e.preventDefault());
  $('[data-acao="link"]').addEventListener("click", () => {
    const url = prompt("Endereço do link (https://… ou /servico/…)");
    if (url) exec("createLink", url.trim());
  });

  async function enviarImagem(arquivo, nome) {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("nome", nome);
    const r = await fetch("/admin/imagem", { method: "POST", body: fd, headers: { "X-CSRF": csrf } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || "O envio falhou.");
    return d.url;
  }

  // Imagem no meio do texto.
  let selecao = null;
  $('[data-acao="imagem"]').addEventListener("mousedown", (e) => { e.preventDefault(); const s = getSelection(); selecao = s.rangeCount ? s.getRangeAt(0) : null; });
  $('[data-acao="imagem"]').addEventListener("click", () => $("#arquivo-texto").click());
  $("#arquivo-texto").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const b = $('[data-acao="imagem"]');
    b.textContent = "Enviando…";
    try {
      const url = await enviarImagem(f, form.slug.value || f.name.replace(/\.[^.]+$/, ""));
      const alt = prompt("Descreva a imagem em poucas palavras (para o Google e para leitores de tela):") || "";
      area.focus();
      if (selecao) { const s = getSelection(); s.removeAllRanges(); s.addRange(selecao); }
      exec("insertHTML", `<img src="${esc(url)}" alt="${esc(alt)}">`);
    } catch (err) { alert(err.message); }
    b.textContent = "Imagem";
  });

  // ── capa ────────────────────────────────────────────────────────────────────
  const capa = $("#capa");
  const mostrarCapa = (url) => {
    form.image.value = url || "";
    capa.innerHTML = url ? `<img src="${esc(url)}" alt="">` : "<span>Sem capa. Use uma imagem horizontal (16:9), de pelo menos 1200 px.</span>";
    $('[data-acao="capa"]').textContent = url ? "Trocar capa" : "Enviar capa";
    $('[data-acao="tirar-capa"]').hidden = !url;
    marcar();
  };
  $('[data-acao="capa"]').addEventListener("click", () => $("#arquivo-capa").click());
  $('[data-acao="tirar-capa"]').addEventListener("click", () => mostrarCapa(""));
  $("#arquivo-capa").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    capa.classList.add("enviando");
    try { mostrarCapa(await enviarImagem(f, form.slug.value || form.title.value || "capa")); }
    catch (err) { alert(err.message); }
    capa.classList.remove("enviando");
  });

  // ── título → endereço ───────────────────────────────────────────────────────
  const slugify = (t) => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-+$/, "");
  const original = form.dataset.original;
  form.title.addEventListener("input", () => { if (form.slug.dataset.manual === "0") form.slug.value = slugify(form.title.value); });
  form.slug.addEventListener("input", () => {
    form.slug.dataset.manual = "1";
    form.slug.value = form.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-");
    const alerta = $("#alerta-endereco");
    if (alerta) alerta.hidden = form.slug.value === original;
  });
  $$("input, textarea, select", form).forEach((c) => c.addEventListener("input", marcar));

  // ── prévia do Google e checklist de SEO ─────────────────────────────────────
  // Os critérios são os que os 50 artigos do site já cumprem.
  const textoPuro = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const chaves = () => form.keywords.value.split(",").map((k) => k.trim()).filter(Boolean);
  function avaliar() {
    const h = textoAtual();
    const titulo = form.seoTitle.value.trim() || form.title.value.trim();
    const desc = form.description.value.trim();
    const palavras = textoPuro(h).split(" ").filter(Boolean).length;
    const h2 = (h.match(/<h2[\s>]/gi) || []).length;
    const imgs = h.match(/<img\b[^>]*>/gi) || [];
    const semAlt = imgs.filter((i) => !/\balt\s*=\s*"[^"]+"/i.test(i)).length;
    const linkServico = /href\s*=\s*"(https:\/\/(www\.)?imigrarbrasil\.com)?\/servico\//i.test(h);
    const k = chaves();
    const principal = norm(k[0] || "");
    const primeiro = norm(textoPuro((h.match(/<p[\s>][\s\S]*?<\/p>/i) || [""])[0]));
    return [
      { ok: titulo.length >= 30 && titulo.length <= 60, aviso: titulo.length > 60 && titulo.length <= 70, rotulo: `Título com ${titulo.length} caracteres`, dica: "Entre 30 e 60: acima disso o Google corta." },
      { ok: desc.length >= 120 && desc.length <= 160, aviso: desc.length >= 70, rotulo: `Descrição com ${desc.length} caracteres`, dica: "Entre 120 e 160. É o texto embaixo do título no Google." },
      { ok: !!form.slug.value && form.slug.value.length <= 75, rotulo: "Endereço curto", dica: "Até 75 caracteres, só as palavras que importam." },
      { ok: palavras >= 600, aviso: palavras >= 300, rotulo: `${palavras} palavras`, dica: "600 ou mais. Os artigos que posicionam no blog têm entre 1.500 e 3.000." },
      { ok: h2 >= 2, rotulo: `${h2} títulos de seção`, dica: "Use o botão “Título” para dividir o texto. Eles viram o índice do artigo." },
      { ok: !!form.image.value && !!form.imageAlt.value.trim(), aviso: !!form.image.value, rotulo: "Capa com descrição", dica: "Envie uma capa 16:9 e descreva a imagem em poucas palavras." },
      { ok: semAlt === 0, rotulo: imgs.length ? `${imgs.length - semAlt}/${imgs.length} imagens do texto com descrição` : "Imagens do texto", dica: "Toda imagem precisa de descrição." },
      { ok: linkServico, aviso: true, rotulo: linkServico ? "Link para um serviço no texto" : "Sem link para serviço no texto", dica: "O site já mostra o serviço relacionado no fim. Um link no meio do texto (/servico/…) reforça." },
      { ok: k.length >= 3, rotulo: `${k.length} palavras-chave`, dica: "Ao menos 3. A primeira é a principal." },
      { ok: !!principal && norm(titulo).includes(principal) && norm(desc).includes(principal), aviso: !!principal && (norm(titulo).includes(principal) || norm(desc).includes(principal)), rotulo: principal ? `“${k[0]}” no título e na descrição` : "Palavra-chave principal", dica: "A primeira palavra-chave deve aparecer no título e na descrição." },
      { ok: !!principal && primeiro.includes(principal), rotulo: "Palavra-chave no primeiro parágrafo", dica: "O Google dá peso ao começo do texto." },
    ];
  }
  function atualizar() {
    const titulo = form.seoTitle.value.trim() || form.title.value.trim() || "Título do artigo";
    $("#g-titulo").textContent = `${titulo} | Imigrar Brasil`;
    $("#g-desc").textContent = form.description.value.trim() || "Escreva a descrição: é o texto que aparece aqui, embaixo do título.";
    $("#g-slug").textContent = form.slug.value || "endereco-do-artigo";
    const n = form.description.value.trim().length;
    $("#conta-desc").textContent = `${n} caracteres${n && (n < 120 || n > 160) ? " — o ideal é entre 120 e 160" : ""}`;
    const itens = avaliar();
    const feitos = itens.filter((i) => i.ok).length;
    const nota = Math.round((feitos / itens.length) * 100);
    $("#seo-nota").textContent = `${feitos}/${itens.length}`;
    $("#seo-nota").className = nota >= 80 ? "bom" : nota >= 50 ? "medio" : "ruim";
    $("#seo-barra").style.width = `${nota}%`;
    $("#seo-barra").className = $("#seo-nota").className;
    $("#seo").innerHTML = itens.map((i) => `<li class="${i.ok ? "ok" : i.aviso ? "aviso" : "falta"}"><b>${i.ok ? "✓" : "!"}</b><span><strong>${esc(i.rotulo)}</strong>${i.ok ? "" : `<small>${esc(i.dica)}</small>`}</span></li>`).join("");
  }
  atualizar();
  mudou = false;

  // ── salvar ──────────────────────────────────────────────────────────────────
  const msg = $("#mensagem");
  const avisar = (tipo, texto) => { msg.hidden = false; msg.className = `aviso aviso-${tipo}`; msg.textContent = texto; msg.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.form !== form) return;
    if (!form.title.value.trim()) return avisar("erro", "Escreva o título.");
    if (!form.slug.value) form.slug.value = slugify(form.title.value);
    const botao = $("#salvar");
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Publicando…";
    const post = {
      title: form.title.value, slug: form.slug.value, seoTitle: form.seoTitle.value, description: form.description.value,
      image: form.image.value, imageAlt: form.imageAlt.value, author: form.author.value, keywords: chaves(),
      published: form.published.value, html: textoAtual(), rascunho: form.rascunho.checked,
    };
    try {
      const r = await fetch("/admin/salvar", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF": csrf }, body: JSON.stringify({ original, post }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Não foi possível salvar.");
      mudou = false;
      location.href = `/admin/artigo?slug=${encodeURIComponent(d.slug)}&salvo=1${d.mudouEndereco ? `&antigo=${encodeURIComponent(d.mudouEndereco)}` : ""}`;
    } catch (err) {
      avisar("erro", err.message);
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  });
  addEventListener("beforeunload", (e) => { if (mudou) e.preventDefault(); });
  $("#form-excluir")?.addEventListener("submit", () => { mudou = false; });
})();
