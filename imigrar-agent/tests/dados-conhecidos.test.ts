import { describe, it, expect } from "vitest";
import { buildDadosConhecidosBlock } from "@/lib/agent";
import { executeTool } from "@/lib/agent/tools";
import type { Lead } from "@/lib/domain/types";

// Relato do cliente da base original: "algumas vezes ela faz perguntas que já foram
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

  it("traz todo campo que a Ana pergunta na qualificação", () => {
    const b = buildDadosConhecidosBlock(
      lead({
        contactName: "Yolanda", clientType: "venezuelana",
        servicesInterested: ["regularização migratória"],
        region: "São Paulo", urgency: "immediate",
        contractDuration: "entrou pela fronteira em 2025, tem protocolo",
        email: "yolanda@exemplo.com",
      }),
    );
    expect(b).toContain("Nome: Yolanda");
    expect(b).toContain("Nacionalidade: venezuelana");
    expect(b).toContain("Onde está agora: São Paulo");
    expect(b).toContain("O que procura: regularização migratória");
    expect(b).toContain("Urgência: imediato");
    expect(b).toContain("Como entrou / o que tem hoje: entrou pela fronteira em 2025, tem protocolo");
    expect(b).toContain("E-mail: yolanda@exemplo.com");
    expect(b).toMatch(/NÃO pergunte de novo/);
  });

  it("a urgência sai em português, não no código interno", () => {
    expect(buildDadosConhecidosBlock(lead({ urgency: "immediate" }))).toContain("Urgência: imediato");
    expect(buildDadosConhecidosBlock(lead({ urgency: "long" }))).toContain("Urgência: longo prazo");
    expect(buildDadosConhecidosBlock(lead({ urgency: "immediate" }))).not.toContain("immediate");
  });

  // A FICHA DE IMIGRAÇÃO INTEIRA — e não os campos herdados da base comercial.
  //
  // O caso que motivou: o atendente liga, confirma a data limite da multa e grava na
  // ficha; na mensagem seguinte a Ana pergunta de novo se existe algum prazo. Quem está
  // com medo e repete a mesma resposta pela terceira vez desiste do atendimento.
  it("traz os campos próprios de imigração, inclusive o prazo já confirmado", () => {
    const b = buildDadosConhecidosBlock(
      lead({
        nacionalidade: "venezuelana",
        localizacao: "brasil",
        region: "Boa Vista",
        objetivo: "resolver uma multa migratória",
        modalidadeProvavel: "regularização migratória",
        intencao: "contratar",
        temPrazoCorrendo: true,
        prazoTipo: "multa",
        prazoDataLimite: "2026-09-15",
        relogioDoCaso: "as aulas do filho começam em março",
        entradaControleMigratorio: true,
        vinculoFamiliarBrasil: "filho brasileiro",
      }),
    );
    expect(b).toContain("Nacionalidade: venezuelana");
    expect(b).toContain("Onde está agora: no Brasil — Boa Vista");
    expect(b).toContain("O que ela quer conseguir: resolver uma multa migratória");
    expect(b).toContain("2026-09-15");
    expect(b).toMatch(/JÁ CONFIRMADA/);
    expect(b).toContain("O que pressiona o caso: as aulas do filho começam em março");
    expect(b).toContain("Entrou pelo controle migratório");
    expect(b).toContain("Vínculo familiar no Brasil: filho brasileiro");
    // A intenção é perguntada UMA vez. Se ela já respondeu, o bloco precisa dizer isso.
    expect(b).toMatch(/Intenção declarada: quer que o escritório conduza/);
  });

  it("prazo sinalizado sem data confirmada não vira data no prompt", () => {
    const b = buildDadosConhecidosBlock(lead({ temPrazoCorrendo: true, prazoTipo: "multa" }));
    expect(b).toContain("multa migratória");
    expect(b).toMatch(/não calcule prazo/);
    expect(b).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("campo não preenchido não vira linha vazia", () => {
    const b = buildDadosConhecidosBlock(lead({ contactName: "Vivi" }));
    expect(b).toContain("Nome: Vivi");
    expect(b).not.toContain("Nacionalidade:");
    expect(b).not.toContain("Prazo:");
  });
});

// De nada adianta o bloco listar a situação da pessoa se a tool que grava o lead descarta
// o campo. `contract_duration` guarda, neste domínio, a situação atual dela (como entrou,
// que documento tem).
describe("registrar_dados_lead grava o que o bloco lê", () => {
  it("situação atual e prazo chegam ao lead e voltam no bloco", async () => {
    // O mesmo repositório que executeTool usa — instância própria não veria a escrita.
    const repo = await import("@/lib/data").then((m) => m.getRepository());
    const conv = await repo.getOrCreateConversation("sim:grava-escala");
    await executeTool("registrar_dados_lead", {
      conversation_id: conv.id,
      contact_name: "Vivi",
      client_type: "angolana",
      contract_duration: "entrou com visto de estudo, ainda válido",
      urgency: "short",
    });
    const salvo = await repo.getLeadByConversation(conv.id);
    expect(salvo?.clientType).toBe("angolana");
    expect(salvo?.contractDuration).toBe("entrou com visto de estudo, ainda válido");

    const b = buildDadosConhecidosBlock(salvo);
    expect(b).toContain("Nacionalidade: angolana");
    expect(b).toContain("Como entrou / o que tem hoje: entrou com visto de estudo, ainda válido");
    expect(b).toContain("Urgência: curto prazo");
  });
});
