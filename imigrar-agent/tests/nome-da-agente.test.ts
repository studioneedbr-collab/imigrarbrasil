import { describe, it, expect } from "vitest";
import { buildSystemPrompt, DEFAULT_KNOWLEDGE, personaComNome } from "@/lib/agent/knowledge";
import { DEFAULT_TRAINING } from "@/lib/agent/training";
import { trainingToOverrides } from "@/lib/agent/system-prompt";

// Trocar o nome na aba Identidade deixava a persona gravada dizendo "Você é a Ana": o
// prompt passava a ter dois nomes, um embaixo do outro.
describe("nome da agente", () => {
  it("a persona assume o nome da Identidade", () => {
    expect(personaComNome("Você é a Ana, do atendimento.", "Sofia")).toBe("Você é a Sofia, do atendimento.");
  });

  it("sem nome configurado, a persona fica como está", () => {
    expect(personaComNome("Você é a Ana.", "")).toBe("Você é a Ana.");
    expect(personaComNome("Você é a Ana.")).toBe("Você é a Ana.");
  });

  it("o prompt montado não fala mais em Ana quando o nome é outro", () => {
    const training = { ...DEFAULT_TRAINING, identity: { ...DEFAULT_TRAINING.identity, agentName: "Sofia" } };
    const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE, trainingToOverrides(training));
    expect(prompt).toContain("Você é a Sofia");
    expect(prompt).toContain("Você se chama Sofia");
    expect(prompt).not.toMatch(/Você é a Ana/);
  });
});
