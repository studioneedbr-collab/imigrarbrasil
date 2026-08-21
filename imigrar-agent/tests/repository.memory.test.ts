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
    await repo.upsertLead(c.id, { contactName: "Maria", employeesNeeded: 5 });
    const lead = await repo.upsertLead(c.id, { region: "Botafogo" });
    expect(lead.contactName).toBe("Maria");
    expect(lead.employeesNeeded).toBe(5);
    expect(lead.region).toBe("Botafogo");
  });

  it("semeia o catálogo de serviços", async () => {
    const services = await repo.listServices();
    expect(services.length).toBeGreaterThanOrEqual(6);
    expect(await repo.getService("Auxiliar de Serviços Gerais")).not.toBeNull();
  });
});
