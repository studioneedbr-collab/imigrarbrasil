"use client";
import { useState } from "react";

interface Msg { role: "user" | "assistant"; content: string; }
interface ToolCall { name: string; input: unknown; result: unknown; }

export default function SimulatePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  function post(text: string, convId: string | undefined) {
    return fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convId ? { conversationId: convId, message: text } : { message: text }),
    });
  }

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      let res = await post(text, conversationId);

      // Conversa perdida (hot-reload zerou o store, ou instância reciclada):
      // limpa o ID e reenvia a mesma mensagem como conversa nova. Retry único —
      // sem conversationId a segunda chamada não pode dar 404.
      if (res.status === 404) {
        const err = await res.json().catch(() => ({}));
        if (err?.error === "conversation_not_found") {
          setConversationId(undefined);
          setMessages((m) => [...m, { role: "assistant", content: "⚠️ Conversa reiniciada (o servidor perdeu o contexto)." }]);
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
    <div className="mx-auto flex h-screen max-w-5xl gap-4 p-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="border-b bg-[#075E54] p-3 text-white">
          <p className="font-semibold">Agente · Imigrar Brasil</p>
          <p className="text-xs opacity-80">Simulador WhatsApp</p>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-[#ECE5DD] p-4">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-gray-500">Envie uma mensagem para iniciar a conversa com o agente.</p>
          )}
          {messages.map((m, i) => (
            <div className={`max-w-[75%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-[#DCF8C6]" : "bg-white"}`} key={i}>
              {m.content}
            </div>
          ))}
          {loading && <div className="max-w-[75%] rounded-lg bg-white px-3 py-2 text-sm italic text-gray-400">Agente está digitando…</div>}
        </div>
        <div className="flex gap-2 border-t p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Digite uma mensagem…"
            className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-[#075E54]"
          />
          <button onClick={send} disabled={loading} className="rounded-full bg-[#075E54] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            Enviar
          </button>
        </div>
      </div>
      <aside className="hidden w-80 flex-col rounded-lg border bg-white p-3 md:flex">
        <p className="mb-2 text-sm font-semibold">Tool calls (debug)</p>
        <div className="flex-1 space-y-2 overflow-y-auto text-xs">
          {tools.length === 0 && <p className="text-gray-400">Nenhuma tool acionada ainda.</p>}
          {tools.map((t, i) => {
            const result = (t.result ?? {}) as Record<string, unknown>;
            const viewUrl = typeof result.view_url === "string" ? result.view_url : undefined;
            // Evita despejar o data-URL gigante no painel; mostra um placeholder.
            const display = "pdf_url" in result ? { ...result, pdf_url: "[pdf base64…]" } : result;
            return (
              <div key={i} className="rounded border bg-gray-50 p-2">
                <p className="font-mono font-semibold text-[#075E54]">{t.name}</p>
                {viewUrl && (
                  <a href={viewUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-medium text-blue-600 underline">
                    Abrir proposta em PDF ↗
                  </a>
                )}
                <pre className="mt-1 whitespace-pre-wrap break-words text-[10px]">{JSON.stringify(display, null, 2)}</pre>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
