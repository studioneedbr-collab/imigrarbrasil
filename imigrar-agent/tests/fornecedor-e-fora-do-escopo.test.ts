import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { AGENT_TOOLS } from "@/lib/agent/tools";

// Fornecedor, imprensa e reclamação de serviço prestado não são lead comercial, e antes
// caíam todos no funil de venda: a Shayene perguntava se o fornecedor precisava de algum
// serviço e qualificava jornalista como cliente. O prompt agora identifica os três, e as
// tools precisam aceitar os setores de destino — sem isso a chamada morre na validação e
// ela diz que encaminhou sem ter encaminhado nada.

const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

function setorEnum(toolName: string): readonly string[] {
  const tool = AGENT_TOOLS.find((t: { name: string }) => t.name === toolName);
  const props = tool?.input_schema.properties as Record<string, { enum?: readonly string[] }>;
  return props.setor?.enum ?? [];
}

describe("fornecedor e contatos fora do escopo comercial", () => {
  it("o prompt identifica fornecedor e manda para suprimentos", () => {
    expect(prompt).toMatch(/FORNECEDOR \/ PARCEIRO COMERCIAL/);
    expect(prompt).toMatch(/distribuidora/i);
    expect(prompt).toMatch(/suprimentos/);
  });

  it("o prompt proíbe tratar fornecedor como cliente e repedir o WhatsApp", () => {
    expect(prompt).toMatch(/NUNCA: tratar fornecedor como cliente potencial/);
    expect(prompt).toMatch(/O WhatsApp você JÁ TEM/);
  });

  it("o prompt cobre imprensa/institucional com destino diretoria", () => {
    expect(prompt).toMatch(/IMPRENSA \/ INSTITUCIONAL/);
    expect(prompt).toMatch(/jornalista/i);
    expect(prompt).toMatch(/diretoria/);
  });

  it("o prompt trata reclamação de serviço prestado como urgente no operacional", () => {
    expect(prompt).toMatch(/RECLAMAÇÃO DE SERVIÇO PRESTADO/);
    expect(prompt).toMatch(/priority "urgent"/);
  });

  it("dizer que encaminhou sem chamar a tool é proibido explicitamente", () => {
    expect(prompt).toMatch(/registrar_dados_lead NÃO avisa ninguém/);
  });

  it("as tools aceitam os setores suprimentos e diretoria", () => {
    for (const tool of ["registrar_dados_lead", "transferir_para_humano"]) {
      expect(setorEnum(tool)).toContain("suprimentos");
      expect(setorEnum(tool)).toContain("diretoria");
    }
  });
});
