"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, btnPrimary } from "@/components/dashboard/ui";

type Publicacao = { id: number; status: string; conclusao: string | null; criadaEm: string; url: string };

const ROTULO: Record<string, string> = {
  queued: "Na fila",
  in_progress: "Publicando…",
  success: "No ar",
  failure: "Falhou",
  cancelled: "Cancelada",
};

function estado(p: Publicacao) {
  if (p.status !== "completed") return { texto: ROTULO[p.status] ?? p.status, cor: "bg-ib-bruma text-ib-carimbo", andando: true };
  if (p.conclusao === "success") return { texto: ROTULO.success, cor: "bg-ib-success/12 text-[#15803D]", andando: false };
  return { texto: ROTULO[p.conclusao ?? ""] ?? "Falhou", cor: "bg-ib-danger/10 text-ib-danger", andando: false };
}

/**
 * O BOTÃO PUBLICAR e o andamento das últimas publicações.
 *
 * Enquanto houver publicação andando, a lista se atualiza sozinha a cada 8 segundos: a
 * pessoa clicou e quer ver "No ar", não ter que recarregar a página para descobrir.
 */
export default function Publicar({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Publicacao[]>([]);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/site/publicar", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { configurado: boolean; publicacoes: Publicacao[]; erro?: string };
    setConfigurado(d.configurado);
    setLista(d.publicacoes);
    if (d.erro) setMsg({ tipo: "erro", texto: `Não consegui ler o andamento no GitHub: ${d.erro}` });
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  const andando = lista.some((p) => p.status !== "completed");
  useEffect(() => {
    if (!andando) return;
    const t = setInterval(() => void carregar(), 8000);
    return () => clearInterval(t);
  }, [andando, carregar]);

  async function publicar() {
    setEnviando(true);
    setMsg(null);
    const r = await fetch("/api/site/publicar", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return setMsg({ tipo: "erro", texto: d.error ?? "Não foi possível publicar." });
    setMsg({ tipo: "ok", texto: "Publicação pedida. Em 1 a 2 minutos o site está atualizado." });
    // O GitHub leva alguns segundos para registrar a execução.
    setTimeout(() => void carregar(), 4000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ib-ink">Publicar no site</h2>
          <p className="text-sm text-ib-slate">Leva para o ar tudo o que foi salvo no blog, nos serviços e nas configurações.</p>
        </div>
        {podeEditar ? (
          <button type="button" className={btnPrimary} onClick={publicar} disabled={enviando || andando || configurado === false}>
            <Icon name="external" className="h-4 w-4" />
            {enviando ? "Pedindo…" : andando ? "Publicando…" : "Publicar agora"}
          </button>
        ) : null}
      </div>

      {configurado === false ? (
        <p className="rounded-xl bg-ib-warn/10 px-4 py-3 text-sm text-[#8a5308]">
          A publicação automática ainda não está configurada (falta <code>GITHUB_TOKEN</code> no painel). As edições ficam salvas e vão para o ar na próxima publicação.
        </p>
      ) : null}
      {msg ? (
        <p className={`rounded-xl px-4 py-3 text-sm ${msg.tipo === "ok" ? "bg-ib-success/10 text-[#15803D]" : "bg-ib-danger/10 text-ib-danger"}`} role="status">{msg.texto}</p>
      ) : null}

      {lista.length ? (
        <ul className="divide-y divide-ib-line rounded-xl border border-ib-line">
          {lista.map((p) => {
            const e = estado(p);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-ib-slate">{new Date(p.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.cor}`}>
                    {e.andando ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
                    {e.texto}
                  </span>
                  <a href={p.url} target="_blank" rel="noopener" className="text-xs font-semibold text-ib-mar hover:underline">detalhes</a>
                </span>
              </li>
            );
          })}
        </ul>
      ) : configurado ? (
        <p className="text-sm text-ib-slate">Nenhuma publicação ainda.</p>
      ) : null}
    </div>
  );
}
