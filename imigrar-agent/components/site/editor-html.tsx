"use client";

import { useEffect, useRef, useState } from "react";

/**
 * EDITOR DO TEXTO DOS ARTIGOS E SERVIÇOS.
 *
 * Visual por padrão (o que se vê é o que vai para o site), com uma aba "HTML" para quem
 * precisa colar ou ajustar código. Os botões geram só o que o site sabe estilizar: h2,
 * h3, parágrafo, negrito, itálico, listas, link, citação e imagem. Os h2 viram o índice
 * lateral do artigo no site — por isso o botão de título é o primeiro.
 *
 * O HTML ainda passa por limparHtmlDoSite no servidor ao salvar.
 */
type Props = { valor: string; aoMudar: (html: string) => void; altura?: number; rotulo: string };

const BOTOES: { cmd: string; arg?: string; rotulo: string; titulo: string }[] = [
  { cmd: "formatBlock", arg: "h2", rotulo: "Título", titulo: "Título de seção (vira o índice do artigo)" },
  { cmd: "formatBlock", arg: "h3", rotulo: "Subtítulo", titulo: "Subtítulo" },
  { cmd: "formatBlock", arg: "p", rotulo: "¶", titulo: "Parágrafo normal" },
  { cmd: "bold", rotulo: "N", titulo: "Negrito" },
  { cmd: "italic", rotulo: "I", titulo: "Itálico" },
  { cmd: "insertUnorderedList", rotulo: "• Lista", titulo: "Lista com marcadores" },
  { cmd: "insertOrderedList", rotulo: "1. Lista", titulo: "Lista numerada" },
  { cmd: "formatBlock", arg: "blockquote", rotulo: "“ ”", titulo: "Citação / destaque" },
];

/**
 * COLAR DO WORD OU DO GOOGLE DOCS.
 *
 * O que vem de lá traz fonte, cor, tamanho e um <span> em cada palavra — e isso iria para
 * o site, brigando com o estilo dele. Aqui fica só a estrutura: títulos (h1 vira h2, que é
 * o título de seção do artigo), parágrafos, negrito, itálico, listas, links e citações.
 */
const MANTER = new Set(["H2", "H3", "H4", "P", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "A", "BLOCKQUOTE", "BR", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
export function limparColado(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const visitar = (no: Element) => {
    for (const filho of Array.from(no.children)) {
      visitar(filho);
      let el = filho;
      if (el.tagName === "H1") { const h = doc.createElement("h2"); h.innerHTML = el.innerHTML; el.replaceWith(h); el = h; }
      // Google Docs embrulha tudo num <b style="font-weight:normal">: não é negrito.
      const negritoFalso = el.tagName === "B" && /font-weight:\s*normal/i.test(el.getAttribute("style") ?? "");
      if (!MANTER.has(el.tagName) || negritoFalso) {
        if (el.tagName === "DIV" && el.textContent?.trim()) { const p = doc.createElement("p"); p.innerHTML = el.innerHTML; el.replaceWith(p); el = p; }
        else { el.replaceWith(...Array.from(el.childNodes)); continue; }
      }
      for (const a of Array.from(el.attributes)) {
        const fica = (el.tagName === "A" && a.name === "href") || (el.tagName === "IMG" && (a.name === "src" || a.name === "alt"));
        if (!fica) el.removeAttribute(a.name);
      }
    }
  };
  visitar(doc.body);
  doc.body.querySelectorAll("p, li, h2, h3").forEach((e) => { if (!e.textContent?.trim() && !e.querySelector("img")) e.remove(); });
  return doc.body.innerHTML.replace(/&nbsp;/g, " ");
}

export default function EditorHtml({ valor, aoMudar, altura = 420, rotulo }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<"visual" | "html">("visual");
  const [enviando, setEnviando] = useState(false);

  // Só escreve no contentEditable quando o valor muda POR FORA (carregar, trocar de modo).
  // Reescrever a cada tecla jogaria o cursor para o começo.
  useEffect(() => {
    if (modo === "visual" && area.current && area.current.innerHTML !== valor) area.current.innerHTML = valor;
  }, [valor, modo]);

  const exec = (cmd: string, arg?: string) => {
    area.current?.focus();
    document.execCommand(cmd, false, arg);
    if (area.current) aoMudar(area.current.innerHTML);
  };

  function link() {
    const url = prompt("Endereço do link (https://… ou /servico/…)");
    if (url) exec("createLink", url);
  }

  async function imagem(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviando(true);
    const fd = new FormData();
    fd.append("arquivo", f);
    fd.append("nome", f.name.replace(/\.[^.]+$/, ""));
    const r = await fetch("/api/site/imagem", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return alert(d.error ?? "O envio falhou.");
    const alt = prompt("Descreva a imagem em poucas palavras (para o Google e para leitores de tela):") ?? "";
    exec("insertHTML", `<img src="${d.url}" alt="${alt.replace(/"/g, "&quot;")}" />`);
  }

  const botao = "rounded-md px-2 py-1 text-[13px] font-semibold text-ib-ink hover:bg-ib-bruma";
  return (
    <div className="rounded-xl border border-ib-line bg-white focus-within:border-ib-mar focus-within:ring-2 focus-within:ring-ib-mar/15">
      <div className="flex flex-wrap items-center gap-1 border-b border-ib-line p-1.5" role="toolbar" aria-label={`Formatação: ${rotulo}`}>
        {modo === "visual" ? (
          <>
            {BOTOES.map((b) => (
              <button key={b.rotulo} type="button" className={botao} title={b.titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => exec(b.cmd, b.arg)}>
                {b.rotulo}
              </button>
            ))}
            <button type="button" className={botao} title="Link" onMouseDown={(e) => e.preventDefault()} onClick={link}>Link</button>
            <label className={`${botao} cursor-pointer`} title="Enviar imagem">
              {enviando ? "Enviando…" : "Imagem"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={imagem} />
            </label>
            <button type="button" className={botao} title="Desfazer" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("undo")}>↶</button>
          </>
        ) : (
          <span className="px-2 text-xs text-ib-slate">Editando o HTML. Volte ao visual para conferir como fica.</span>
        )}
        <span className="ml-auto inline-flex rounded-lg bg-ib-papel p-0.5">
          {(["visual", "html"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${modo === m ? "bg-white text-ib-ink shadow-sm" : "text-ib-slate"}`}>
              {m === "visual" ? "Visual" : "HTML"}
            </button>
          ))}
        </span>
      </div>
      {modo === "visual" ? (
        <div
          ref={area}
          contentEditable
          suppressContentEditableWarning
          aria-label={rotulo}
          onInput={() => area.current && aoMudar(area.current.innerHTML)}
          onPaste={(e) => {
            const html = e.clipboardData.getData("text/html");
            if (!html) return; // texto puro: o navegador já cola sem formatação
            e.preventDefault();
            document.execCommand("insertHTML", false, limparColado(html));
            if (area.current) aoMudar(area.current.innerHTML);
          }}
          className="conteudo-site max-w-none overflow-y-auto px-5 py-4 text-[15px] leading-relaxed text-ib-ink outline-none"
          style={{ minHeight: altura, maxHeight: altura * 2 }}
        />
      ) : (
        <textarea value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={`${rotulo} (HTML)`} spellCheck={false}
          className="block w-full resize-y rounded-b-xl px-4 py-3 font-mono text-xs leading-relaxed text-ib-ink outline-none" style={{ minHeight: altura }} />
      )}
    </div>
  );
}
