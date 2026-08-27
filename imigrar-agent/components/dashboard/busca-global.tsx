"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/ui";
import { CLASSIFICACAO_LABEL } from "@/lib/domain/rotulos";
import type { Classificacao } from "@/lib/domain/types";

type Resultado = {
  id: string;
  nome: string;
  idioma?: string | null;
  idiomaNome?: string | null;
  nacionalidade: string | null;
  classificacao: Classificacao | null;
  temPrazo: boolean;
  contexto: string | null;
};

/**
 * A busca ocupa o lugar que era do motivo decorativo de passaporte.
 *
 * O atalho existe porque esta é a ação mais repetida de quem usa o painel o dia inteiro,
 * e tirar a mão do teclado trinta vezes por dia é caro. `/` porque é o que a memória
 * muscular de quem usa ferramenta de trabalho já espera.
 */
export default function BuscaGlobal() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !digitando) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Espera a pessoa parar de digitar. Cada tecla disparando uma varredura do banco
  // deixaria a busca mais lenta justamente para quem digita rápido.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/busca?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const d = await r.json();
        setResultados(d.resultados ?? []);
        setFoco(0);
        setAberto(true);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function abrir(r: Resultado) {
    setAberto(false);
    setQ("");
    router.push(`/dashboard/leads/${r.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!resultados?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => (f + 1) % resultados.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => (f - 1 + resultados.length) % resultados.length); }
    if (e.key === "Enter") { e.preventDefault(); abrir(resultados[foco]); }
  }

  return (
    <div ref={caixaRef} className="relative min-w-0 flex-1 sm:max-w-md">
      <div className="flex items-center gap-2 rounded-lg border border-ib-line bg-white px-2.5 py-1.5 focus-within:border-ib-mar focus-within:ring-2 focus-within:ring-ib-mar/15">
        <Icon name="search" className="h-4 w-4 shrink-0 text-ib-slate" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => resultados && setAberto(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar por nome, telefone, nacionalidade ou trecho da conversa"
          aria-label="Buscar"
          className="min-w-0 flex-1 bg-transparent text-sm text-ib-ink outline-none placeholder:text-ib-slate/70"
        />
        <kbd className="hidden shrink-0 rounded border border-ib-line px-1.5 font-mono text-[10px] text-ib-slate sm:block">
          /
        </kbd>
      </div>

      {aberto && resultados ? (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-ib-line bg-white shadow-xl">
          {resultados.length === 0 ? (
            <p className="px-4 py-4 text-sm leading-relaxed text-ib-slate">
              {buscando
                ? "Procurando…"
                : `Ninguém encontrado com "${q}". A busca cobre nome, telefone, nacionalidade, a ficha e o texto das conversas.`}
            </p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {resultados.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setFoco(i)}
                    onClick={() => abrir(r)}
                    className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition ${
                      i === foco ? "bg-ib-bruma" : "hover:bg-ib-papel"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {r.idioma ? (
                        <span
                          title={r.idiomaNome ?? undefined}
                          className="rounded bg-slate-100 px-1 font-mono text-[10px] font-semibold uppercase text-ib-slate"
                        >
                          {r.idioma}
                        </span>
                      ) : null}
                      <span className="truncate text-sm font-medium text-ib-ink">{r.nome}</span>
                      {r.nacionalidade ? (
                        <span className="shrink-0 text-xs text-ib-slate">{r.nacionalidade}</span>
                      ) : null}
                      {r.temPrazo ? (
                        <span className="shrink-0 rounded-full bg-ib-danger/10 px-1.5 text-[10px] font-semibold text-ib-danger">
                          prazo
                        </span>
                      ) : r.classificacao ? (
                        <span className="shrink-0 text-[10px] text-ib-slate">
                          {CLASSIFICACAO_LABEL[r.classificacao]}
                        </span>
                      ) : null}
                    </span>
                    {r.contexto ? (
                      <span className="line-clamp-1 text-xs text-ib-slate">{r.contexto}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
