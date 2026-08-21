import { describe, it, expect } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

describe("Cliente + estado da conversa (memória)", () => {
  it("upsertCliente deduplica por CPF", async () => {
    const repo = new MemoryRepository();
    const a = await repo.upsertCliente({ cpf: "11144477735", nome: "João" });
    const b = await repo.upsertCliente({ cpf: "11144477735", empresa: "Alfa" });
    expect(b.id).toBe(a.id);
    expect(b.nome).toBe("João");
    expect(b.empresa).toBe("Alfa");
  });

  it("setEstado persiste o estado atual da conversa", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("55219999");
    await repo.setEstado(conv.id, "S4");
    const got = await repo.getConversation(conv.id);
    expect(got?.estadoAtual).toBe("S4");
  });

  it("createTransferTicket guarda o dossiê", async () => {
    const repo = new MemoryRepository();
    const conv = await repo.getOrCreateConversation("55218888");
    const t = await repo.createTransferTicket({
      conversationId: conv.id, reason: "trabalhista", priority: "urgent",
      dossie: { nome: "Maria", servicos: ["Porteiro"], necessidade: "dúvida sobre férias" },
    });
    expect(t.id).toBeTruthy();
    expect(t.dossie.necessidade).toContain("férias");
  });
});
