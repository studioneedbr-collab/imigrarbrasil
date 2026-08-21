import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

// A visão geral calculava o tempo médio de resposta com um listMessages por conversa
// dentro de um for: 30 idas em sequência ao Supabase (~1,8s medidos), com o painel
// parado em "Carregando seu painel…" logo depois do login.

describe("listMessagesForConversations", () => {
  it("agrupa as mensagens por conversa", async () => {
    const repo = new MemoryRepository();
    const a = await repo.getOrCreateConversation("5521999990001");
    const b = await repo.getOrCreateConversation("5521999990002");
    await repo.addMessage(a.id, "user", "oi");
    await repo.addMessage(a.id, "assistant", "olá!");
    await repo.addMessage(b.id, "user", "quanto custa?");

    const map = await repo.listMessagesForConversations([a.id, b.id]);
    expect(map.get(a.id)?.map((m) => m.content)).toEqual(["oi", "olá!"]);
    expect(map.get(b.id)?.map((m) => m.content)).toEqual(["quanto custa?"]);
  });

  it("devolve lista vazia para conversa sem mensagem, não undefined", async () => {
    const repo = new MemoryRepository();
    const c = await repo.getOrCreateConversation("5521999990003");
    const map = await repo.listMessagesForConversations([c.id]);
    expect(map.get(c.id)).toEqual([]);
  });

  it("aguenta lista vazia sem ir ao banco", async () => {
    const repo = new MemoryRepository();
    expect((await repo.listMessagesForConversations([])).size).toBe(0);
  });

  it("mantém o mesmo conteúdo que o listMessages um-a-um", async () => {
    const repo = new MemoryRepository();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await repo.getOrCreateConversation(`552199999${1000 + i}`);
      await repo.addMessage(c.id, "user", `pergunta ${i}`);
      await repo.addMessage(c.id, "assistant", `resposta ${i}`);
      ids.push(c.id);
    }
    const map = await repo.listMessagesForConversations(ids);
    for (const id of ids) {
      expect(map.get(id)).toEqual(await repo.listMessages(id));
    }
  });
});
