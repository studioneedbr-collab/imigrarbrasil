"use client";

import { useEffect, useRef, useState } from "react";
import { selectNewMessages, newestTimestamp, type ActivityMessage } from "@/lib/notifications/new-messages";

/** Curto de propósito: é o intervalo entre a mensagem chegar e você saber. */
const POLL_MS = 5000;
// Os prefixos eram "shine:", da base que originou este código. Trocar zera o "visto por
// último" de quem já tinha o painel aberto: na primeira carga tudo aparece como novo, uma
// vez só.
const STORAGE_KEY = "ib:lastSeenMessageAt";
/** Evento de janela que faz as telas de Conversas refazerem o fetch na hora. */
export const NEW_MESSAGE_EVENT = "ib:new-message";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export default function NewMessageAlerts() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (notificationsSupported()) setPermission(Notification.permission);
    try {
      lastSeenRef.current = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* localStorage bloqueado (modo privado) — segue sem linha de base persistida */
    }
  }, []);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      let messages: ActivityMessage[];
      try {
        const res = await fetch("/api/conversations/activity", { cache: "no-store" });
        if (!res.ok) return; // 401 durante logout, 5xx — silencioso, igual aos outros pollings
        const data = (await res.json()) as { messages: ActivityMessage[] };
        messages = data.messages ?? [];
      } catch {
        return; // rede caiu — o painel nunca quebra por causa disto
      }
      if (!active) return;

      const novas = selectNewMessages(messages, lastSeenRef.current, notifiedRef.current);

      // Avança a linha de base ANTES de notificar: se o navegador recusar a
      // notificação, ainda assim não reprocessamos as mesmas mensagens no próximo ciclo.
      const baseline = newestTimestamp(messages, lastSeenRef.current);
      lastSeenRef.current = baseline;
      try {
        if (baseline) window.localStorage.setItem(STORAGE_KEY, baseline);
      } catch {
        /* ignore */
      }

      if (novas.length === 0) return;
      novas.forEach((m) => notifiedRef.current.add(m.id));

      // A tela se atualiza mesmo sem permissão de notificação.
      window.dispatchEvent(new CustomEvent(NEW_MESSAGE_EVENT));

      if (!notificationsSupported() || Notification.permission !== "granted") return;
      novas.forEach((m) => {
        const n = new Notification(`Nova mensagem — ${m.contactName ?? "contato sem nome"}`, {
          // Sem o texto da mensagem: pode conter CPF e a notificação aparece em tela bloqueada.
          body: "Clique para abrir a conversa.",
          tag: m.conversationId, // várias mensagens da mesma conversa colapsam numa notificação
          icon: "/marca/simbolo-256.png",
        });
        n.onclick = () => {
          window.focus();
          window.location.href = `/dashboard/conversations/${m.conversationId}`;
          n.close();
        };
      });
    };

    tick();
    // Sem checar visibilityState de propósito: é justamente com a aba escondida
    // que a notificação importa. Os outros pollings do painel pulam nesse caso.
    const t = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  // O pedido de permissão precisa sair de um gesto do usuário — navegador bloqueia
  // pedido automático no load. Por isso o botão, e só quando ainda não decidiram.
  if (permission !== "default") return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const p = await Notification.requestPermission();
        setPermission(p);
      }}
      className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-ib-line bg-white px-3.5 py-2 text-xs font-medium text-ib-ink shadow-lg transition hover:border-ib-mar/30"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ib-mar" />
      Ativar notificações
    </button>
  );
}
