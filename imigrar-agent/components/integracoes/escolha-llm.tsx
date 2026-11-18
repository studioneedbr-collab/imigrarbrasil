"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, btnPrimary } from "@/components/dashboard/ui";

/**
 * QUEM ESCREVE AS RESPOSTAS — a troca de provedor, feita aqui.
 *
 * Duas decisões:
 *
 *   · A TROCA É TESTADA ANTES DE VALER. O servidor faz uma chamada mínima ao provedor
 *     escolhido e só grava se ele responder. Trocar para uma chave errada não quebraria
 *     nada à vista — a reserva assumiria calada —, e é por isso que não é aceito.
 *   · A CHAVE ENTRA E NÃO VOLTA. O campo serve para colar uma chave nova; a que está
 *     salva nunca é reenviada ao navegador, nem em parte.
 */

type Provedor = "deepseek" | "openai";

interface Estado {
  ativo: Provedor;
  provedores: {
    provedor: Provedor;
    nome: string;
    modelo: string;
    configurado: boolean;
    origemDaChave: "painel" | "ambiente" | null;
  }[];
}

// Só sugestões: o campo aceita qualquer modelo de chat da conta, e o teste diz se existe.
const SUGESTOES_OPENAI = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o", "gpt-5-mini"];

const inputClass =
  "w-full rounded-xl border border-ib-line bg-white px-3 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:border-ib-mar focus:outline-none focus:ring-2 focus:ring-ib-mar/20";

const DESCRICAO: Record<Provedor, string> = {
  deepseek: "Mais barato por conversa. É quem respondia até aqui.",
  openai: "O modelo do ChatGPT, pela API da OpenAI. Custa mais por conversa.",
};

export default function EscolhaLlm({ onMudou }: { onMudou?: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [escolha, setEscolha] = useState<Provedor>("deepseek");
  const [chave, setChave] = useState("");
  const [modelo, setModelo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/llm", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as Estado;
      setEstado(d);
      setEscolha(d.ativo);
      setModelo(d.provedores.find((p) => p.provedor === "openai")?.modelo ?? "");
    } catch {
      /* o cartão fica como está */
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!estado) return null;

  const de = (qual: Provedor) => estado.provedores.find((p) => p.provedor === qual);
  const openai = de("openai");
  const mudou =
    escolha !== estado.ativo || Boolean(chave.trim()) || modelo.trim() !== (openai?.modelo ?? "");

  async function salvar() {
    setAviso(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/integrations/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: escolha,
          openaiApiKey: chave.trim() || undefined,
          openaiModel: modelo.trim() || undefined,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        modelo?: string;
        teste?: { latenciaMs: number } | null;
      };
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setChave("");
      setAviso({
        ok: true,
        texto:
          `Salvo. Quem responde agora: ${escolha === "openai" ? "ChatGPT" : "DeepSeek"} (${d.modelo}).` +
          (d.teste ? ` O teste respondeu em ${d.teste.latenciaMs} ms.` : ""),
      });
      await carregar();
      onMudou?.();
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ib-line bg-ib-papel/40 p-4">
      <p className="text-sm font-semibold text-ib-ink">Quem escreve as respostas da agente</p>
      <p className="mt-1 text-sm leading-relaxed text-ib-slate">
        O escolhido responde; o outro, se tiver credencial, fica de reserva e assume sozinho
        quando o escolhido falha. O treino da agente é o mesmo para os dois.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Provedor da agente">
        {(["deepseek", "openai"] as const).map((qual) => {
          const p = de(qual);
          const marcado = escolha === qual;
          return (
            <button
              key={qual}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => setEscolha(qual)}
              className={`rounded-xl border p-3 text-left transition ${
                marcado
                  ? "border-ib-mar bg-white ring-2 ring-ib-mar/20"
                  : "border-ib-line bg-white hover:border-ib-mar/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    marcado ? "border-ib-mar" : "border-ib-line"
                  }`}
                >
                  {marcado ? <span className="h-2 w-2 rounded-full bg-ib-mar" /> : null}
                </span>
                <span className="font-semibold text-ib-ink">{p?.nome ?? qual}</span>
                {estado.ativo === qual ? (
                  <span className="rounded-full bg-ib-success/10 px-2 py-0.5 text-[11px] font-medium text-[#15803D]">
                    respondendo
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-ib-slate">{DESCRICAO[qual]}</span>
              <span className="mt-1.5 block text-xs text-ib-slate">
                {p?.configurado
                  ? `Credencial configurada (${p.origemDaChave === "painel" ? "pelo painel" : "no servidor"})`
                  : "Sem credencial"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="llm-openai-chave" className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">
            Chave de API da OpenAI
          </label>
          <input
            id="llm-openai-chave"
            type="password"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={openai?.configurado ? "•••••••• (cole para substituir)" : "Cole a chave (platform.openai.com)"}
            className={`${inputClass} mt-1.5`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="llm-openai-modelo" className="text-xs font-semibold uppercase tracking-[0.08em] text-ib-slate">
            Modelo do ChatGPT
          </label>
          <input
            id="llm-openai-modelo"
            list="llm-openai-modelos"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="gpt-4.1-mini"
            className={`${inputClass} mt-1.5 font-mono`}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="llm-openai-modelos">
            {SUGESTOES_OPENAI.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={salvar} disabled={salvando || !mudou} className={btnPrimary}>
          <Icon name="check" className="h-4 w-4" />
          {salvando ? "Testando e salvando…" : "Salvar escolha"}
        </button>
        <p className="text-xs text-ib-slate">
          A troca só vale se o provedor responder a um teste. A chave não é exibida depois de salva.
        </p>
      </div>

      {aviso ? (
        <p
          role="status"
          className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
            aviso.ok
              ? "border border-ib-success/25 bg-ib-success/8 text-[#15803D]"
              : "border border-ib-danger/20 bg-ib-danger/5 text-ib-danger"
          }`}
        >
          <Icon name={aviso.ok ? "check" : "bolt"} className="h-3.5 w-3.5 shrink-0" />
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
