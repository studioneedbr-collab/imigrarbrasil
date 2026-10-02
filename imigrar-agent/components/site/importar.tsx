"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary } from "@/components/dashboard/ui";

/**
 * TRAZER O CONTEÚDO QUE JÁ ESTÁ NO SITE.
 *
 * Aparece enquanto o painel não tem posts nem serviços. Com GITHUB_TOKEN, lê direto do
 * repositório; sem ele, aceita os três arquivos de site/src/data/ enviados aqui.
 */
export default function Importar({ temGithub }: { temGithub: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"parado" | "indo" | "feito">("parado");
  const [msg, setMsg] = useState<string | null>(null);

  async function enviar(corpo: object) {
    setEstado("indo");
    setMsg(null);
    const r = await fetch("/api/site/importar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setEstado("parado"); return setMsg(d.error ?? "A importação falhou."); }
    setEstado("feito");
    setMsg(`${d.importados} itens importados${d.mantidos ? `, ${d.mantidos} já existiam` : ""}${d.recusados?.length ? `. Recusados: ${d.recusados.join("; ")}` : "."}`);
    router.refresh();
  }

  async function arquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const corpo: Record<string, unknown> = {};
    for (const f of Array.from(e.target.files ?? [])) {
      const json = JSON.parse(await f.text());
      if (f.name.startsWith("posts")) corpo.posts = json;
      else if (f.name.startsWith("servicos")) corpo.servicos = json;
      else if (f.name.startsWith("site")) corpo.config = json;
    }
    if (!Object.keys(corpo).length) return setMsg("Escolha posts.json, servicos.json e site.json (pasta site/src/data/).");
    await enviar(corpo);
  }

  return (
    <div className="rounded-2xl border border-dashed border-ib-mar/40 bg-ib-bruma/40 p-5">
      <h2 className="font-display text-lg font-semibold text-ib-ink">Trazer o conteúdo atual do site</h2>
      <p className="mt-1 text-sm text-ib-slate">
        O painel ainda está vazio. Importe os {temGithub ? "posts, serviços e configurações que já estão no site" : "arquivos da pasta site/src/data/"} uma vez; depois disso, tudo se edita por aqui.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {temGithub ? (
          <button type="button" className={btnPrimary} disabled={estado === "indo"} onClick={() => enviar({})}>
            {estado === "indo" ? "Importando…" : "Importar do site"}
          </button>
        ) : (
          <label className={btnPrimary + " cursor-pointer"}>
            {estado === "indo" ? "Importando…" : "Escolher os arquivos"}
            <input type="file" accept="application/json" multiple className="sr-only" onChange={arquivos} />
          </label>
        )}
      </div>
      {msg ? <p className="mt-3 text-sm text-ib-ink" role="status">{msg}</p> : null}
    </div>
  );
}
