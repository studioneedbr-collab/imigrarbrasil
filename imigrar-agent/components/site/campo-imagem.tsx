"use client";

import { useState } from "react";

/** Imagem de capa: envio para o Storage ou endereço colado, com pré-visualização. */
export default function CampoImagem({ valor, aoMudar, nome }: { valor: string | null; aoMudar: (url: string | null) => void; nome: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Caminho do site ("/wp-content/…") é mostrado a partir do site publicado.
  const previa = valor ? (valor.startsWith("/") ? `https://imigrarbrasil.com${valor}` : valor) : null;

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviando(true);
    setErro(null);
    const fd = new FormData();
    fd.append("arquivo", f);
    fd.append("nome", nome || f.name);
    const r = await fetch("/api/site/imagem", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return setErro(d.error ?? "O envio falhou.");
    aoMudar(d.url);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-ib-papel ring-1 ring-ib-line sm:w-56">
        {/* <img> e não next/image: a prévia aceita qualquer endereço colado, e o otimizador
            do Next só serve domínios cadastrados em next.config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previa ? <img src={previa} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-ib-slate">sem imagem</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-ib-line bg-white px-3 py-1.5 text-sm font-semibold text-ib-ink hover:border-ib-mar/40 hover:bg-ib-bruma">
          {enviando ? "Enviando…" : "Enviar imagem"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={enviar} />
        </label>
        <input value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} placeholder="ou cole o endereço: https://… ou /wp-content/…"
          className="w-full rounded-lg border border-ib-line px-3 py-2 font-mono text-xs text-ib-ink" />
        <p className="text-xs text-ib-slate">Proporção 16:9, até 5 MB. JPG, PNG ou WebP.</p>
        {erro ? <p className="text-xs text-ib-danger">{erro}</p> : null}
      </div>
    </div>
  );
}
