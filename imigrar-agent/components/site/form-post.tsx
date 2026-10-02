"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import EditorHtml from "./editor-html";
import CampoImagem from "./campo-imagem";
import PreviaGoogle from "./previa-google";
import ChecklistSeo, { avaliarSeo } from "./checklist-seo";
import type { PostSite } from "@/lib/site/conteudo";

const AUTORES = ["Walter Gama", "Sérgio Reis"];

export const slugDoTitulo = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-+$/, "");

/** "2026-07-21T20:15" no fuso de Brasília, para o <input type="datetime-local">. */
function paraCampoData(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return p.replace(" ", "T");
}
const doCampoData = (v: string) => new Date(`${v}:00-03:00`).toISOString();

export const rotulo = "block text-[13px] font-semibold text-ib-ink";
export const campo = "mt-1.5 w-full rounded-lg border border-ib-line bg-white px-3 py-2 text-sm text-ib-ink focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/15";

export default function FormPost({ inicial, publicadoInicial, podeEditar }: { inicial: PostSite | null; publicadoInicial: boolean; podeEditar: boolean }) {
  const router = useRouter();
  const novo = !inicial;
  const [p, setP] = useState<PostSite>(
    inicial ?? { slug: "", title: "", seoTitle: "", description: "", image: null, imageAlt: null, author: AUTORES[0], keywords: [], html: "", published: new Date().toISOString(), modified: null },
  );
  const [publicado, setPublicado] = useState(publicadoInicial || novo);
  const [slugManual, setSlugManual] = useState(!novo);
  const [chaves, setChaves] = useState((inicial?.keywords ?? []).join(", "));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const mudar = <K extends keyof PostSite>(k: K, v: PostSite[K]) => setP((x) => ({ ...x, [k]: v }));
  const mudouEndereco = !novo && inicial && p.slug !== inicial.slug;

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const dados: PostSite = {
      ...p,
      keywords: chaves.split(",").map((k) => k.trim()).filter(Boolean),
      modified: novo ? null : new Date().toISOString(),
    };
    const r = await fetch(novo ? "/api/site/conteudo/post" : `/api/site/conteudo/post/${inicial!.slug}`, {
      method: novo ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dados, publicado }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setMsg({ tipo: "erro", texto: d.error ?? "Não foi possível salvar." });
    setMsg({ tipo: "ok", texto: d.mudouEndereco ? `Salvo. O endereço antigo /${d.enderecoAntigo}/ vai dar 404 no site — avise para criar o redirecionamento.` : "Salvo. Clique em Publicar na Visão geral para levar ao site." });
    if (novo || d.mudouEndereco) router.replace(`/dashboard/site/blog/${dados.slug}`);
    router.refresh();
  }

  async function apagar() {
    if (!inicial || !confirm(`Apagar "${inicial.title}"? Ele sai do site na próxima publicação, e o endereço passa a dar 404.`)) return;
    const r = await fetch(`/api/site/conteudo/post/${inicial.slug}`, { method: "DELETE" });
    if (r.ok) { router.push("/dashboard/site/blog"); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/site/blog" className="text-sm font-semibold text-ib-mar hover:underline">← Blog</Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ib-ink">{novo ? "Novo artigo" : "Editar artigo"}</h1>
        </div>
        {podeEditar ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-2 inline-flex items-center gap-2 text-sm font-semibold text-ib-ink">
              <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} className="h-4 w-4 accent-ib-selo" />
              Publicado
            </label>
            {!novo ? <button type="button" className={btnGhost} onClick={apagar}>Apagar</button> : null}
            <button type="button" className={btnPrimary} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        ) : null}
      </div>
      {msg ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${msg.tipo === "ok" ? "bg-ib-success/10 text-[#15803D]" : "bg-ib-danger/10 text-ib-danger"}`}>{msg.texto}</p> : null}

      <fieldset disabled={!podeEditar} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <label className={rotulo} htmlFor="titulo">Título</label>
            <input id="titulo" className={`${campo} text-lg font-semibold`} value={p.title}
              onChange={(e) => { mudar("title", e.target.value); if (!slugManual) mudar("slug", slugDoTitulo(e.target.value)); }} />
          </div>
          <div>
            <label className={rotulo} htmlFor="slug">Endereço</label>
            <div className="mt-1.5 flex items-center rounded-lg border border-ib-line bg-ib-papel font-mono text-sm">
              <span className="px-3 text-ib-slate">imigrarbrasil.com/</span>
              <input id="slug" className="min-w-0 flex-1 rounded-r-lg bg-white px-2 py-2 text-ib-ink focus:outline-none" value={p.slug}
                onChange={(e) => { setSlugManual(true); mudar("slug", e.target.value.toLowerCase()); }} />
            </div>
            {mudouEndereco ? <p className="mt-1.5 text-xs text-ib-warn">Mudar o endereço de um artigo publicado faz o antigo dar 404 — e perde o que ele tinha de posição no Google.</p> : null}
          </div>
          <div>
            <span className={rotulo}>Texto</span>
            <div className="mt-1.5"><EditorHtml valor={p.html} aoMudar={(h) => mudar("html", h)} rotulo="Texto do artigo" /></div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <PreviaGoogle titulo={p.seoTitle || p.title} descricao={p.description} caminho={`/${p.slug}/`} />
          <ChecklistSeo itens={avaliarSeo({ ...p, keywords: chaves.split(",").map((k) => k.trim()).filter(Boolean) })} />
          <div>
            <label className={rotulo} htmlFor="desc">Descrição (Google e redes sociais)</label>
            <textarea id="desc" rows={3} className={campo} value={p.description} onChange={(e) => mudar("description", e.target.value)} />
          </div>
          <div>
            <label className={rotulo} htmlFor="seo">Título para o Google <span className="font-normal text-ib-slate">(opcional — se vazio, usa o título)</span></label>
            <input id="seo" className={campo} value={p.seoTitle ?? ""} onChange={(e) => mudar("seoTitle", e.target.value)} />
          </div>
          <div>
            <label className={rotulo} htmlFor="chaves">Palavras-chave <span className="font-normal text-ib-slate">(separadas por vírgula)</span></label>
            <textarea id="chaves" rows={2} className={campo} value={chaves} onChange={(e) => setChaves(e.target.value)} placeholder="naturalização, Lei de Migração, Polícia Federal" />
          </div>
          <div>
            <span className={rotulo}>Imagem de capa</span>
            <div className="mt-1.5"><CampoImagem valor={p.image} aoMudar={(v) => mudar("image", v)} nome={p.slug} /></div>
            <input className={`${campo} mt-2`} value={p.imageAlt ?? ""} onChange={(e) => mudar("imageAlt", e.target.value || null)} placeholder="Descrição da imagem (texto alternativo)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo} htmlFor="autor">Autor</label>
              <select id="autor" className={campo} value={p.author} onChange={(e) => mudar("author", e.target.value)}>
                {AUTORES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="data">Data</label>
              <input id="data" type="datetime-local" className={campo} value={paraCampoData(p.published)} onChange={(e) => e.target.value && mudar("published", doCampoData(e.target.value))} />
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
