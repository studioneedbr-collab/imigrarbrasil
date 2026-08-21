import { describe, it, expect } from "vitest";
import {
  DEFAULT_KNOWLEDGE, findObjection, TRANSFER_RULES, CONFIDENTIAL, buildSystemPrompt,
} from "@/lib/agent/knowledge";

describe("base de conhecimento", () => {
  it("persona é a Shayene", () => {
    expect(DEFAULT_KNOWLEDGE.persona.toLowerCase()).toContain("shayene");
  });
  it("tem as 15 objeções do Anexo II", () => {
    expect(DEFAULT_KNOWLEDGE.objections.length).toBe(15);
  });
  it("findObjection mapeia 'tá caro' para a resposta de preço", () => {
    const o = findObjection("achei muito caro esse valor");
    expect(o?.resposta.toLowerCase()).toMatch(/risco|comparativo|valor|terceiriza/);
  });
  it("regras de transferência cobrem trabalhista e financeiro", () => {
    expect(TRANSFER_RULES.some((r) => r.regex.test("dúvida sobre demissão"))).toBe(true);
    expect(TRANSFER_RULES.some((r) => r.regex.test("preciso de reembolso"))).toBe(true);
  });
  it("guardrail lista custo e salário como confidenciais", () => {
    expect(CONFIDENTIAL.some((c) => /custo|salári|margem/.test(c))).toBe(true);
  });
});

// O PDF é o que faz a venda andar. Estas três regras foram o que tirou a Shayene do loop
// de pedir cadastro (17/08/2026) — se saírem do prompt, o loop volta.
describe("o prompt manda gerar o PDF cedo", () => {
  const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

  it("proíbe pedir CNPJ antes da proposta", () => {
    expect(prompt).toContain("NUNCA PEÇA CNPJ ANTES DO PDF");
  });

  it("fecha a triagem em quatro campos, não em sete", () => {
    expect(prompt).toContain("qual serviço · quantos postos · a cidade/região do serviço · o nome da empresa");
    expect(prompt).not.toContain("você precisa ter SETE coisas");
  });

  it("classifica a primeira mensagem antes de responder", () => {
    expect(prompt).toContain("LEIA A PRIMEIRA MENSAGEM COM ATENÇÃO");
    expect(prompt).toMatch(/quanto menos passos até o PDF/i);
  });

  it("manda confirmar a quantidade, com posto 24h obrigatório", () => {
    expect(prompt).toContain("CONFIRME A QUANTIDADE");
    expect(prompt).toMatch(/Em posto 24h a confirmação é OBRIGATÓRIA/);
  });
});
