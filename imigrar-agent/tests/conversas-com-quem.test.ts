import { describe, it, expect } from "vitest";

// A LISTA DE CONVERSAS DIZ COM QUEM CADA UMA ESTÁ: o responsável do caso quando há, e
// senão o que ficou escrito na transferência.

import { GET } from "@/app/api/conversations/route";
import { getRepository } from "@/lib/data";

const repo = getRepository();
const lista = async () =>
  ((await (await GET(new Request("http://painel.local/api/conversations"))).json()).conversations ?? []) as {
    id: string;
    comQuem?: string;
    responsavelNome?: string;
  }[];

describe("com quem está a conversa", () => {
  it("mostra o responsável do caso, mesmo que a transferência antiga diga outra coisa", async () => {
    const walter = await repo.createUser({ email: "cq1@exemplo.com", passwordHash: "x", name: "Walter Gama", role: "atendente" });
    const c = await repo.getOrCreateConversation("5511977770001", "Contato Um");
    const lead = await repo.upsertLead(c.id, {});
    await repo.updateConversation(c.id, { handedOffTo: "Jurídico" });
    await repo.assumirLead(lead.id, walter.id, "quem@exemplo.com");
    expect((await lista()).find((x) => x.id === c.id)).toMatchObject({ comQuem: "Walter Gama", responsavelNome: "Walter Gama" });
  });

  it("sem responsável, vale o destino da transferência; sem transferência, nada", async () => {
    const t = await repo.getOrCreateConversation("5511977770002", "Contato Dois");
    await repo.updateConversation(t.id, { status: "transferred", handedOffTo: "Jurídico" });
    const livre = await repo.getOrCreateConversation("5511977770003", "Contato Três");
    const todas = await lista();
    expect(todas.find((x) => x.id === t.id)?.comQuem).toBe("Jurídico");
    // Setor não é pessoa: a coluna Responsável não o apresenta como quem está atendendo.
    expect(todas.find((x) => x.id === t.id)?.responsavelNome).toBeUndefined();
    expect(todas.find((x) => x.id === livre.id)?.comQuem).toBeUndefined();
  });
});
