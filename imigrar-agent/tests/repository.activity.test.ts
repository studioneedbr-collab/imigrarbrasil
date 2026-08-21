import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

describe("listRecentUserMessages", () => {
  let repo: MemoryRepository;
  beforeEach(() => { repo = new MemoryRepository(); });

  it("retorna só mensagens do cliente, nunca do agente", async () => {
    const c = await repo.getOrCreateConversation("sim:1", "João");
    await repo.addMessage(c.id, "user", "oi");
    await repo.addMessage(c.id, "assistant", "olá, tudo bem?");
    const recentes = await repo.listRecentUserMessages(10);
    expect(recentes).toHaveLength(1);
    expect(recentes[0].conversationId).toBe(c.id);
  });

  it("não expõe o conteúdo da mensagem", async () => {
    const c = await repo.getOrCreateConversation("sim:2", "Maria");
    await repo.addMessage(c.id, "user", "meu CPF é 123.456.789-00");
    const [m] = await repo.listRecentUserMessages(10);
    expect(JSON.stringify(m)).not.toContain("123.456.789-00");
    expect(m).not.toHaveProperty("content");
  });

  it("traz o nome do contato da conversa", async () => {
    const c = await repo.getOrCreateConversation("sim:3", "Carlos");
    await repo.addMessage(c.id, "user", "oi");
    const [m] = await repo.listRecentUserMessages(10);
    expect(m.contactName).toBe("Carlos");
  });

  it("ordena da mais recente para a mais antiga e respeita o limite", async () => {
    const c = await repo.getOrCreateConversation("sim:4");
    await repo.addMessage(c.id, "user", "1");
    await repo.addMessage(c.id, "user", "2");
    await repo.addMessage(c.id, "user", "3");
    const recentes = await repo.listRecentUserMessages(2);
    expect(recentes).toHaveLength(2);
    const [a, b] = recentes;
    expect(Date.parse(a.createdAt)).toBeGreaterThanOrEqual(Date.parse(b.createdAt));
  });

  it("cruza várias conversas", async () => {
    const a = await repo.getOrCreateConversation("sim:5", "Ana");
    const b = await repo.getOrCreateConversation("sim:6", "Bruno");
    await repo.addMessage(a.id, "user", "oi");
    await repo.addMessage(b.id, "user", "oi");
    const recentes = await repo.listRecentUserMessages(10);
    expect(recentes).toHaveLength(2);
    expect(new Set(recentes.map((m) => m.conversationId))).toEqual(new Set([a.id, b.id]));
  });

  it("sem mensagens, devolve lista vazia", async () => {
    expect(await repo.listRecentUserMessages(10)).toEqual([]);
  });
});
