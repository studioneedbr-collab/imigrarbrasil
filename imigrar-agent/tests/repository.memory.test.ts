import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";

describe("MemoryRepository", () => {
  let repo: MemoryRepository;
  beforeEach(() => { repo = new MemoryRepository(); });

  it("cria e reusa conversa pelo número", async () => {
    const a = await repo.getOrCreateConversation("sim:1", "João");
    const b = await repo.getOrCreateConversation("sim:1");
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("active");
  });

  it("adiciona e lista mensagens em ordem", async () => {
    const c = await repo.getOrCreateConversation("sim:2");
    await repo.addMessage(c.id, "user", "oi");
    await repo.addMessage(c.id, "assistant", "olá");
    const msgs = await repo.listMessages(c.id);
    expect(msgs.map((m) => m.content)).toEqual(["oi", "olá"]);
  });

  it("faz upsert de lead", async () => {
    const c = await repo.getOrCreateConversation("sim:3");
    await repo.upsertLead(c.id, { contactName: "Maria", nacionalidade: "Peru" });
    const lead = await repo.upsertLead(c.id, { region: "Botafogo" });
    expect(lead.contactName).toBe("Maria");
    expect(lead.nacionalidade).toBe("Peru");
    expect(lead.region).toBe("Botafogo");
  });

  it("guarda os campos de imigração e o sinal de prazo", async () => {
    const c = await repo.getOrCreateConversation("5521777777777");
    const lead = await repo.upsertLead(c.id, {
      nacionalidade: "Haiti", localizacao: "brasil", temPrazoCorrendo: true,
      classificacao: "QUENTE_PRAZO",
    });
    expect(lead.nacionalidade).toBe("Haiti");
    expect(lead.temPrazoCorrendo).toBe(true);
    // A primeira classificação da IA fica guardada à parte, para a taxa de reclassificação.
    expect(lead.classificacaoIa).toBe("QUENTE_PRAZO");
  });
});
