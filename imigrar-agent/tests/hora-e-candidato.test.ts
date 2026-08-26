import { describe, it, expect } from "vitest";
import { processMessage, buildAgoraBlock } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// Horário de Brasília é UTC-3: 12:00Z = 09:00 em SP (manhã), 21:00Z = 18:00 (noite).
describe("bloco AGORA — a Ana sabe que horas são", () => {
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

  // 04:00Z = 01:00 em SP. "Bom dia" à 1h da manhã é o tipo de coisa que entrega na
  // primeira linha que não há ninguém lendo — e aqui é justamente de madrugada que
  // escreve quem está sem dormir com um prazo correndo.
  it("de madrugada é boa noite, não bom dia", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T04:00:00Z"))).toContain('"boa noite"');
    expect(buildAgoraBlock(new Date("2026-08-07T04:00:00Z"))).toContain("01:00");
  });

  it("proíbe copiar a saudação de quem escreveu", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T12:00:00Z"))).toMatch(
      /NUNCA copie a saudação que a pessoa usou/,
    );
  });

  it("manda traduzir a saudação para o idioma da conversa", () => {
    expect(buildAgoraBlock(new Date("2026-08-07T12:00:00Z"))).toMatch(/idioma da conversa/i);
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
    await processMessage({ conversationId: conv.id, userText: "quero trabalhar aí com vocês" });
    await processMessage({ conversationId: conv.id, userText: "tá bom, muito obrigada" });
    expect((await repo.getLeadByConversation(conv.id))?.setor).toBe("rh");
  });

  // A DIFERENÇA QUE ESTE DOMÍNIO EXIGE: quem quer trabalhar NO BRASIL está pedindo
  // atendimento de imigração. Mandar essa pessoa para o funil de RH seria não atendê-la.
  it("quem quer trabalhar NO BRASIL não vira candidato a vaga", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:5");
    await processMessage({
      conversationId: conv.id,
      userText: "sou venezuelano e quero trabalhar no Brasil, preciso de documento",
    });
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.setor ?? "comercial").not.toBe("rh");
  });

  it("não sequestra o atendimento de imigração", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("cand:3");
    await processMessage({
      conversationId: conv.id,
      userText: "quero saber como faço para trazer minha esposa para o Brasil",
    });
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.setor ?? "comercial").not.toBe("rh");
  });
});
