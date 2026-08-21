import { describe, it, expect } from "vitest";
import { buildDadosConhecidosBlock } from "@/lib/agent";
import { executeTool } from "@/lib/agent/tools";
import type { Lead } from "@/lib/domain/types";

// Relato do Eduardo em 11/08/2026: "algumas vezes ela faz perguntas que já foram
// respondidas anteriormente". O histórico completo sempre foi para o modelo, mas o bloco
// que DESTACA o que já se sabe listava só 6 campos — escala, tipo de cliente, prazo e
// duração ficavam de fora, e a resposta se perdia no meio da conversa.

function lead(patch: Partial<Lead>): Lead {
  return {
    id: "lead_1", conversationId: "c1", whatsappNumber: "5521999999999",
    status: "new", stage: "novo", score: 0,
    createdAt: "2026-08-11T12:00:00Z", updatedAt: "2026-08-11T12:00:00Z",
    ...patch,
  };
}

describe("bloco de dados já conhecidos", () => {
  it("sem lead, não injeta nada", () => {
    expect(buildDadosConhecidosBlock(null)).toBe("");
  });

  it("lead vazio não injeta um bloco em branco", () => {
    expect(buildDadosConhecidosBlock(lead({}))).toBe("");
  });

  it("traz todo campo que a Shayene pergunta na qualificação", () => {
    const b = buildDadosConhecidosBlock(
      lead({
        contactName: "Vivi", companyName: "Condomínio Solar", clientType: "condomínio",
        servicesInterested: ["Auxiliar de Serviços Gerais"], employeesNeeded: 4,
        schedule: "5x2_44h", region: "Botafogo", urgency: "immediate",
        contractDuration: "12 meses", email: "vivi@solar.com.br",
      }),
    );
    expect(b).toContain("Nome: Vivi");
    expect(b).toContain("Empresa: Condomínio Solar");
    expect(b).toContain("Tipo de cliente: condomínio");
    expect(b).toContain("Serviço(s): Auxiliar de Serviços Gerais");
    expect(b).toContain("Nº de postos: 4");
    expect(b).toContain("Escala: 5x2_44h");
    expect(b).toContain("Localização: Botafogo");
    expect(b).toContain("Duração do contrato: 12 meses");
    expect(b).toContain("E-mail: vivi@solar.com.br");
    expect(b).toMatch(/NÃO pergunte de novo/);
  });

  it("a urgência sai em português, não no código interno", () => {
    expect(buildDadosConhecidosBlock(lead({ urgency: "immediate" }))).toContain("Prazo: imediato");
    expect(buildDadosConhecidosBlock(lead({ urgency: "long" }))).toContain("Prazo: longo prazo");
    expect(buildDadosConhecidosBlock(lead({ urgency: "immediate" }))).not.toContain("immediate");
  });

  it("campo não preenchido não vira linha vazia", () => {
    const b = buildDadosConhecidosBlock(lead({ contactName: "Vivi" }));
    expect(b).toContain("Nome: Vivi");
    expect(b).not.toContain("Escala:");
    expect(b).not.toContain("Prazo:");
  });
});

// De nada adianta o bloco listar a escala se a tool que grava o lead descarta o campo.
describe("registrar_dados_lead grava o que o bloco lê", () => {
  it("escala e duração chegam ao lead e voltam no bloco", async () => {
    // O mesmo repositório que executeTool usa — instância própria não veria a escrita.
    const repo = await import("@/lib/data").then((m) => m.getRepository());
    const conv = await repo.getOrCreateConversation("sim:grava-escala");
    await executeTool("registrar_dados_lead", {
      conversation_id: conv.id,
      contact_name: "Vivi",
      schedule: "12x36",
      contract_duration: "indeterminado",
      urgency: "short",
    });
    const salvo = await repo.getLeadByConversation(conv.id);
    expect(salvo?.schedule).toBe("12x36");
    expect(salvo?.contractDuration).toBe("indeterminado");

    const b = buildDadosConhecidosBlock(salvo);
    expect(b).toContain("Escala: 12x36");
    expect(b).toContain("Duração do contrato: indeterminado");
    expect(b).toContain("Prazo: curto prazo");
  });
});
