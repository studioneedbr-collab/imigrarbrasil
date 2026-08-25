import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt, TRANSFER_RULES } from "@/lib/agent/knowledge";
import { AGENT_TOOLS } from "@/lib/agent/tools";

// Contatos fora do escopo. Na base comercial herdada, o que caía fora do funil era
// fornecedor, imprensa e reclamação de serviço. Aqui é outra coisa: imigração para OUTRO
// país e assunto de OUTRA área do direito — os dois pedidos que mais chegam por engano
// numa assessoria de imigração, e que o agente não pode fingir que atende.

const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

function setorEnum(toolName: string): readonly string[] {
  const tool = AGENT_TOOLS.find((t: { name: string }) => t.name === toolName);
  const props = tool?.input_schema.properties as Record<string, { enum?: readonly string[] }>;
  return props.setor?.enum ?? [];
}

describe("contatos fora do escopo", () => {
  it("o prompt delimita o escopo em imigração PARA O BRASIL", () => {
    expect(prompt).toMatch(/FORA DESSE ESCOPO/);
    expect(prompt).toMatch(/imigração para outros países/i);
    expect(prompt).toMatch(/trabalhista, criminal/i);
  });

  it("pedido de outro país cai na regra de fora do escopo, não no atendimento", () => {
    for (const msg of [
      "vocês fazem visto americano?",
      "quero imigrar para Portugal",
      "preciso de cidadania italiana",
      "vocês fazem tradução juramentada?",
    ]) {
      const regra = TRANSFER_RULES.find((r) => r.regex.test(msg));
      expect(regra?.categoria, msg).toBe("fora_do_escopo");
    }
  });

  it("a resposta de fora do escopo não indica terceiros nem dá palpite", () => {
    const regra = TRANSFER_RULES.find((r) => r.categoria === "fora_do_escopo")!;
    expect(regra.resposta).toMatch(/imigração para o Brasil/i);
    expect(regra.resposta.toLowerCase()).not.toMatch(/recomendo|indico o|procure o/);
  });

  it("dizer que encaminhou sem chamar a tool é proibido explicitamente", () => {
    expect(prompt).toMatch(/registrar_dados_lead não avisa ninguém/i);
  });

  it("as tools continuam aceitando todos os setores da estrutura", () => {
    for (const tool of ["registrar_dados_lead", "transferir_para_humano"]) {
      expect(setorEnum(tool)).toContain("comercial");
      expect(setorEnum(tool)).toContain("rh");
      expect(setorEnum(tool)).toContain("diretoria");
    }
  });
});
