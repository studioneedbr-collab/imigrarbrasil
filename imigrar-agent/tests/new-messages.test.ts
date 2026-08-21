import { describe, it, expect } from "vitest";
import { selectNewMessages, newestTimestamp, type ActivityMessage } from "@/lib/notifications/new-messages";

const msg = (id: string, createdAt: string): ActivityMessage => ({
  id,
  conversationId: `conv_${id}`,
  contactName: "João",
  createdAt,
});

describe("selectNewMessages", () => {
  it("não retorna nada quando ainda não há linha de base", () => {
    const msgs = [msg("a", "2026-08-05T12:00:00Z")];
    expect(selectNewMessages(msgs, null, new Set())).toEqual([]);
  });

  it("retorna só as mensagens posteriores à linha de base", () => {
    const msgs = [
      msg("a", "2026-08-05T12:00:00Z"),
      msg("b", "2026-08-05T12:00:05Z"),
      msg("c", "2026-08-05T12:00:10Z"),
    ];
    const novas = selectNewMessages(msgs, "2026-08-05T12:00:05Z", new Set());
    expect(novas.map((m) => m.id)).toEqual(["c"]);
  });

  it("ignora mensagens já notificadas", () => {
    const msgs = [msg("a", "2026-08-05T12:00:10Z"), msg("b", "2026-08-05T12:00:20Z")];
    const novas = selectNewMessages(msgs, "2026-08-05T12:00:00Z", new Set(["a"]));
    expect(novas.map((m) => m.id)).toEqual(["b"]);
  });

  it("devolve em ordem cronológica crescente", () => {
    const msgs = [msg("novo", "2026-08-05T12:00:30Z"), msg("velho", "2026-08-05T12:00:20Z")];
    const novas = selectNewMessages(msgs, "2026-08-05T12:00:00Z", new Set());
    expect(novas.map((m) => m.id)).toEqual(["velho", "novo"]);
  });

  it("compara instantes, não texto — offset +00:00 equivale a Z", () => {
    const msgs = [msg("a", "2026-08-05T12:00:00+00:00")];
    expect(selectNewMessages(msgs, "2026-08-05T12:00:00Z", new Set())).toEqual([]);
  });

  it("lista vazia não quebra", () => {
    expect(selectNewMessages([], "2026-08-05T12:00:00Z", new Set())).toEqual([]);
  });
});

describe("newestTimestamp", () => {
  it("devolve o instante mais recente da lista", () => {
    const msgs = [msg("a", "2026-08-05T12:00:00Z"), msg("b", "2026-08-05T12:00:30Z")];
    expect(newestTimestamp(msgs, null)).toBe("2026-08-05T12:00:30Z");
  });

  it("mantém o valor anterior quando a lista está vazia", () => {
    expect(newestTimestamp([], "2026-08-05T11:00:00Z")).toBe("2026-08-05T11:00:00Z");
  });

  it("nunca retrocede a linha de base", () => {
    const msgs = [msg("a", "2026-08-05T10:00:00Z")];
    expect(newestTimestamp(msgs, "2026-08-05T12:00:00Z")).toBe("2026-08-05T12:00:00Z");
  });
});
