import { describe, it, expect } from "vitest";
import { executeTool, AGENT_TOOLS } from "@/lib/agent/tools";
import { getRepository } from "@/lib/data";

describe("executeTool", () => {
  it("registrar_dados_lead persiste no repo, com a leitura deste domínio", async () => {
    const conv = await getRepository().getOrCreateConversation("sim:tool-1");
    const r: any = await executeTool("registrar_dados_lead", {
      conversation_id: conv.id,
      contact_name: "Ana Teste",
      client_type: "Venezuela",
      region: "Brasil — Boa Vista",
      services_interested: ["Regularização migratória"],
    });
    expect(r.ok).toBe(true);
    const lead = await getRepository().getLeadByConversation(conv.id);
    expect(lead?.contactName).toBe("Ana Teste");
    expect(lead?.clientType).toBe("Venezuela");
    expect(lead?.servicesInterested).toContain("Regularização migratória");
  });

  it("agendar_followup cria followup pendente", async () => {
    const conv = await getRepository().getOrCreateConversation("sim:tool-3");
    const r: any = await executeTool("agendar_followup", { conversation_id: conv.id, message: "Oi, tudo bem?", delay_hours: 24 });
    expect(r.ok).toBe(true);
    const pend = await getRepository().listPendingFollowups();
    expect(pend.some((f) => f.id === r.followup_id)).toBe(true);
  });

  it("buscar_material_oficial sem base carregada diz que não achou, em vez de devolver vazio", async () => {
    const r: any = await executeTool("buscar_material_oficial", { consulta: "prazo para pedir refúgio" });
    expect(r.encontrou).toBe(false);
    // O `[]` seco o modelo lê como "a tool não funcionou" e responde pelo que ele sabe —
    // que é exatamente o que não pode acontecer com informação migratória.
    expect(r.instrucao).toMatch(/NÃO responda pelo seu conhecimento próprio/);
  });
});

// A maquinaria comercial herdada (precificação, proposta em PDF, cadastro de funcionário)
// não é mais oferecida ao modelo — nem com a descrição mandando não usar. Uma tool no
// contexto é uma tool que um dia é chamada, e a Imigrar Brasil não cota serviço pelo
// assistente: valores e contratação são sempre do time jurídico.
describe("o agente não tem mais tool comercial nenhuma", () => {
  it("as tools removidas sumiram do catálogo", () => {
    const nomes = AGENT_TOOLS.map((t) => t.name);
    expect(nomes).toEqual([
      "registrar_dados_lead",
      "transferir_para_humano",
      "buscar_material_oficial",
      "agendar_followup",
      "enviar_opcoes",
    ]);
  });

  for (const removida of ["calcular_preco_servico", "gerar_proposta_pdf", "registrar_funcionario"]) {
    it(`chamar ${removida} é erro, não um caminho silencioso`, async () => {
      await expect(executeTool(removida, {})).rejects.toThrow(/desconhecida/i);
    });
  }
});
