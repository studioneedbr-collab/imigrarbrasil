"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * O SIMULADOR.
 *
 * Era um mock de WhatsApp — verde do app, balão verde-claro, "Tool calls (debug)" numa
 * barra lateral e um link "Abrir proposta em PDF ↗" que só existia no produto de portaria
 * terceirizada que originou este código. Uma tela que mostra ferramenta de outro negócio
 * ensina errado quem está aprendendo a operar este.
 *
 * O que ficou é o que se usa: a MESMA engine do WhatsApp numa conversa isolada (ver
 * /api/simulate — ela nasce marcada como ensaio e nunca entra na fila, no CRM ou nas
 * métricas), e, do lado, O QUE O AGENTE ENTENDEU. Essa segunda parte é o teste de verdade:
 * a resposta pode soar ótima e a ficha sair vazia, e é a ficha que vira trabalho para o
 * time — quem testa um prompt precisa ver as duas coisas na mesma tela.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface ToolCall {
  name: string;
  input: unknown;
  result: unknown;
}

const CENARIOS = [
  "Recebi uma multa migratória, o que faço?",
  "Estou na Venezuela e quero ir para o Brasil trabalhar",
  "Meu CRNM vence mês que vem",
  "Quanto vocês cobram?",
  "Preciso falar com uma pessoa",
];

export default function SimulatePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function post(text: string, convId: string | undefined) {
    return fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convId ? { conversationId: convId, message: text } : { message: text }),
    });
  }

  async function send(texto?: string) {
    const text = (texto ?? input).trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      let res = await post(text, conversationId);

      // Conversa perdida (hot-reload zerou o store, ou instância reciclada): limpa o ID e
      // reenvia a mesma mensagem como conversa nova. Retry único — sem conversationId a
      // segunda chamada não pode dar 404.
      if (res.status === 404) {
        const err = await res.json().catch(() => ({}));
        if (err?.error === "conversation_not_found") {
          setConversationId(undefined);
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "⚠️ Conversa reiniciada — o servidor perdeu o contexto." },
          ]);
          res = await post(text, undefined);
        }
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "(sem resposta)" }]);
      if (data.toolCalls?.length) setTools((t) => [...t, ...data.toolCalls]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Erro de conexão." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ib-papel p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ib-selo">
              Simulador
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ib-ink">
              Converse com o agente
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ib-slate">
              A mesma engine do WhatsApp, numa conversa de teste isolada: ela nasce marcada
              como ensaio e não entra na fila, no CRM nem nas métricas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setTools([]);
                  setConversationId(undefined);
                }}
                className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel"
              >
                Nova conversa
              </button>
            ) : null}
            <Link
              href="/dashboard"
              className="rounded-xl border border-ib-line bg-white px-4 py-2 text-sm font-medium text-ib-ink transition hover:bg-ib-papel"
            >
              Voltar ao painel
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section className="flex h-[76vh] flex-col overflow-hidden rounded-2xl border border-ib-line bg-white">
            <div className="flex items-center justify-between border-b border-ib-line px-4 py-3">
              <p className="text-sm font-semibold text-ib-ink">Conversa de teste</p>
              <span className="font-mono text-[11px] tabular-nums text-ib-slate">
                {messages.length} mensagens
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-ib-papel/50 p-4">
              {messages.length === 0 ? (
                <div className="mx-auto mt-10 max-w-md text-center">
                  <p className="text-sm text-ib-slate">
                    Escreva como a pessoa escreveria — inclusive em espanhol, com erro de
                    digitação e sem contexto. É assim que a mensagem chega.
                  </p>
                </div>
              ) : null}

              {messages.map((m, i) => {
                const daPessoa = m.role === "user";
                return (
                  <div key={i} className={`flex ${daPessoa ? "justify-start" : "justify-end"}`}>
                    <div className="max-w-[80%]">
                      <div
                        className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          daPessoa
                            ? "rounded-bl-sm border border-ib-line bg-white text-ib-ink"
                            : "rounded-br-sm bg-ib-carimbo text-white"
                        }`}
                      >
                        {m.content}
                      </div>
                      <p className="mt-1 px-1 font-mono text-[11px] text-ib-slate">
                        {daPessoa ? "Pessoa" : "Agente"}
                      </p>
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-white px-3.5 py-2.5 text-sm italic text-ib-slate ring-1 ring-inset ring-ib-line">
                    O agente está escrevendo…
                  </div>
                </div>
              ) : null}
              <div ref={fim} />
            </div>

            <div className="border-t border-ib-line p-3">
              <div className="flex flex-wrap gap-1.5 pb-2">
                {CENARIOS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={loading}
                    onClick={() => void send(c)}
                    className="rounded-full border border-ib-line bg-white px-3 py-1 text-xs text-ib-slate transition hover:border-ib-mar/40 hover:text-ib-ink disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder="Digite como a pessoa escreveria…"
                  className="flex-1 rounded-xl border border-ib-line bg-white px-4 py-2.5 text-sm text-ib-ink placeholder:text-ib-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-ib-mar"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-ib-mar px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ib-carimbo disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </section>

          {/* ── O QUE O AGENTE ENTENDEU ──
              A resposta pode soar ótima e a ficha sair vazia. É a ficha que vira trabalho
              para o time, então ela fica ao lado da conversa, e não escondida num "debug". */}
          <aside className="rounded-2xl border border-ib-line bg-white p-4">
            <p className="text-sm font-semibold text-ib-ink">O que o agente entendeu</p>
            <p className="mt-1 text-xs leading-relaxed text-ib-slate">
              Cada ferramenta que ele acionou nesta conversa — é aqui que se vê se a ficha
              está sendo preenchida ou se a resposta só soou bem.
            </p>

            <div className="mt-3 space-y-2">
              {tools.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ib-line px-3 py-6 text-center text-xs text-ib-slate">
                  Nenhuma ferramenta acionada ainda.
                </p>
              ) : null}

              {tools.map((t, i) => (
                <details key={i} className="rounded-lg border border-ib-line bg-ib-papel/50">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ib-carimbo">
                    {t.name}
                  </summary>
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words border-t border-ib-line px-3 py-2 font-mono text-[10px] leading-relaxed text-ib-slate">
                    {JSON.stringify(t.result ?? t.input, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
