"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary } from "@/components/dashboard/ui";
import EditorHtml from "./editor-html";
import CampoImagem from "./campo-imagem";
import PreviaGoogle from "./previa-google";
import { slugDoTitulo, rotulo, campo } from "./form-post";
import { CATEGORIAS_SITE } from "@/lib/site/categorias";
import type { ServicoSite } from "@/lib/site/conteudo";

export default function FormServico({ inicial, publicadoInicial, podeEditar }: { inicial: ServicoSite | null; publicadoInicial: boolean; podeEditar: boolean }) {
  const router = useRouter();
  const novo = !inicial;
  const [s, setS] = useState<ServicoSite>(
    inicial ?? { slug: "", title: "", seoTitle: "", description: "", image: null, categoria: CATEGORIAS_SITE[0], html: "", beneficios: [], paraQuem: null, fechamento: null, published: null, modified: null },
  );
  const [publicado, setPublicado] = useState(publicadoInicial || novo);
  const [slugManual, setSlugManual] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const mudar = <K extends keyof ServicoSite>(k: K, v: ServicoSite[K]) => setS((x) => ({ ...x, [k]: v }));
  const beneficio = (i: number, k: "titulo" | "texto", v: string) =>
    mudar("beneficios", s.beneficios.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const dados: ServicoSite = { ...s, beneficios: s.beneficios.filter((b) => b.titulo.trim()), modified: new Date().toISOString() };
    const r = await fetch(novo ? "/api/site/conteudo/servico" : `/api/site/conteudo/servico/${inicial!.slug}`, {
      method: novo ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dados, publicado }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setMsg({ tipo: "erro", texto: d.error ?? "Não foi possível salvar." });
    setMsg({ tipo: "ok", texto: d.mudouEndereco ? `Salvo. O endereço antigo /servico/${d.enderecoAntigo}/ vai dar 404 — avise para criar o redirecionamento.` : "Salvo. Clique em Publicar na Visão geral para levar ao site." });
    if (novo || d.mudouEndereco) router.replace(`/dashboard/site/servicos/${dados.slug}`);
    router.refresh();
  }

  async function apagar() {
    if (!inicial || !confirm(`Apagar "${inicial.title}"? A página sai do site na próxima publicação.`)) return;
    const r = await fetch(`/api/site/conteudo/servico/${inicial.slug}`, { method: "DELETE" });
    if (r.ok) { router.push("/dashboard/site/servicos"); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/site/servicos" className="text-sm font-semibold text-ib-mar hover:underline">← Serviços</Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ib-ink">{novo ? "Novo serviço" : "Editar serviço"}</h1>
        </div>
        {podeEditar ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-2 inline-flex items-center gap-2 text-sm font-semibold text-ib-ink">
              <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} className="h-4 w-4 accent-ib-selo" /> Publicado
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
            <label className={rotulo} htmlFor="nome">Nome do serviço</label>
            <input id="nome" className={`${campo} text-lg font-semibold`} value={s.title}
              onChange={(e) => { mudar("title", e.target.value); if (!slugManual) mudar("slug", slugDoTitulo(e.target.value)); }} />
          </div>
          <div>
            <label className={rotulo} htmlFor="slug">Endereço</label>
            <div className="mt-1.5 flex items-center rounded-lg border border-ib-line bg-ib-papel font-mono text-sm">
              <span className="px-3 text-ib-slate">imigrarbrasil.com/servico/</span>
              <input id="slug" className="min-w-0 flex-1 rounded-r-lg bg-white px-2 py-2 text-ib-ink focus:outline-none" value={s.slug}
                onChange={(e) => { setSlugManual(true); mudar("slug", e.target.value.toLowerCase()); }} />
            </div>
          </div>
          <div>
            <span className={rotulo}>Benefícios <span className="font-normal text-ib-slate">(os três destaques do topo da página)</span></span>
            <div className="mt-1.5 flex flex-col gap-2">
              {s.beneficios.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-ib-line p-3 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
                  <input className={campo + " mt-0"} value={b.titulo} placeholder="Enquadramento correto" onChange={(e) => beneficio(i, "titulo", e.target.value)} />
                  <input className={campo + " mt-0"} value={b.texto} placeholder="Você evita usar o visto errado para o seu objetivo." onChange={(e) => beneficio(i, "texto", e.target.value)} />
                  <button type="button" className="text-xs font-semibold text-ib-danger" onClick={() => mudar("beneficios", s.beneficios.filter((_, j) => j !== i))}>remover</button>
                </div>
              ))}
              {s.beneficios.length < 6 ? (
                <button type="button" className="w-fit text-sm font-semibold text-ib-mar hover:underline" onClick={() => mudar("beneficios", [...s.beneficios, { titulo: "", texto: "" }])}>+ benefício</button>
              ) : null}
            </div>
          </div>
          <div>
            <span className={rotulo}>Texto principal</span>
            <div className="mt-1.5"><EditorHtml valor={s.html} aoMudar={(h) => mudar("html", h)} rotulo="Texto do serviço" altura={320} /></div>
          </div>
          <div>
            <span className={rotulo}>Para quem é</span>
            <div className="mt-1.5"><EditorHtml valor={s.paraQuem ?? ""} aoMudar={(h) => mudar("paraQuem", h || null)} rotulo="Para quem é" altura={140} /></div>
          </div>
          <div>
            <span className={rotulo}>Fechamento <span className="font-normal text-ib-slate">(texto antes do contato)</span></span>
            <div className="mt-1.5"><EditorHtml valor={s.fechamento ?? ""} aoMudar={(h) => mudar("fechamento", h || null)} rotulo="Fechamento" altura={120} /></div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <PreviaGoogle titulo={s.seoTitle || s.title} descricao={s.description} caminho={`/servico/${s.slug}/`} />
          <div>
            <label className={rotulo} htmlFor="cat">Categoria</label>
            <select id="cat" className={campo} value={s.categoria} onChange={(e) => mudar("categoria", e.target.value)}>
              {CATEGORIAS_SITE.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="desc">Descrição (Google e cards do site)</label>
            <textarea id="desc" rows={3} className={campo} value={s.description} onChange={(e) => mudar("description", e.target.value)} />
          </div>
          <div>
            <label className={rotulo} htmlFor="seo">Título para o Google <span className="font-normal text-ib-slate">(opcional)</span></label>
            <input id="seo" className={campo} value={s.seoTitle ?? ""} onChange={(e) => mudar("seoTitle", e.target.value)} />
          </div>
          <div>
            <span className={rotulo}>Imagem</span>
            <div className="mt-1.5"><CampoImagem valor={s.image} aoMudar={(v) => mudar("image", v)} nome={s.slug} /></div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
