import { describe, it, expect } from "vitest";
import { processMessage, buildAgoraBlock } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Horário de Brasília é UTC-3: 12:00Z = 09:00 em SP (manhã), 21:00Z = 18:00 (noite).
describe("bloco AGORA — a Shayene sabe que horas são", () => {
  it("de manhã manda dar bom dia", () => {
    const b = buildAgoraBlock(new Date("2026-08-07T12:00:00Z"));
    expect(b).toContain('"bom dia"');
    expect(b).toContain("09:00");
  });

  it("à tarde manda dar boa tarde", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T18:00:00Z"))).toContain('"boa tarde"');
  });

  it("à noite manda dar boa noite", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T23:00:00Z"))).toContain('"boa noite"');
  });

  it("proíbe copiar a saudação do cliente", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T12:00:00Z"))).toMatch(
      /NUNCA copie a saudação que o cliente usou/,
    );
  });

  it("sabe quando está fora do horário comercial", () => {
    // Sexta 09:00 em SP → dentro; domingo 09:00 → fora.
    expect(buildAgoraBlock(new Date("2026-08-07T12:00:00Z"))).toContain("Estamos DENTRO");
    expect(buildAgoraBlock(new Date("2026-08-09T12:00:00Z"))).toContain("Estamos FORA");
  });
});

describe("candidato a vaga entra na pipeline de RH", () => {
  it("pedido de vaga registra o lead no setor rh", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:1");
    await processMessage({
      conversationId: conv.id,
      userText:
        "Boa tarde, me chamo Érica e estou a procura de uma vaga de emprego, posso deixar meu currículo?",
    });
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.setor).toBe("rh");
    expect(lead?.stage).not.toBe("desqualificado");
  });

  it("o pedido de vaga vale mesmo quando ficou lá atrás no histórico", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:2");
    await processMessage({ conversationId: conv.id, userText: "quero trabalhar na Shine Rio" });
    await processMessage({ conversationId: conv.id, userText: "tá bom, muito obrigada" });
    expect((await repo.getLeadByConversation(conv.id))?.setor).toBe("rh");
  });

  it("reconhece o jeito que a pessoa fala quando vem do site", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:4");
    await processMessage({
      conversationId: conv.id,
      userText: "Olá, vim do site da Shine Rio e quero mais informações como trabalhar com vocês",
    });
    await processMessage({ conversationId: conv.id, userText: "Vaga de emprego com vocês" });
    expect((await repo.getLeadByConversation(conv.id))?.setor).toBe("rh");
  });

  it("não sequestra lead comercial", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:3");
    await processMessage({ conversationId: conv.id, userText: "preciso de 2 porteiros na Barra" });
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.setor ?? "comercial").not.toBe("rh");
  });
});
