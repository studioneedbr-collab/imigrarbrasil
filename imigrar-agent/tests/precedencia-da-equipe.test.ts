import { describe, expect, it } from "vitest";
import { DEFAULT_KNOWLEDGE, PRECEDENCIA_DA_EQUIPE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { trainingToOverrides } from "@/lib/agent/system-prompt";
import { DEFAULT_TRAINING } from "@/lib/agent/training";

// O Walter escreveu na persona, com todas as letras, que a agente não usasse gíria nem
// dissesse uma frase específica — e ela seguia o estilo dos exemplos do raciocínio, que
// vêm antes e são muito maiores. A persona precisa de uma linha que diga que ela vence.
describe("o jeito de falar definido pela equipe vence os exemplos do prompt", () => {
  const prompt = buildSystemPrompt(
    { ...DEFAULT_KNOWLEDGE, persona: "Você é a Cláudia. Nunca use gíria." },
    trainingToOverrides(DEFAULT_TRAINING),
  );

  it("a precedência entra depois da persona e antes das regras que não se quebram", () => {
    const persona = prompt.indexOf("Nunca use gíria.");
    const precedencia = prompt.indexOf(PRECEDENCIA_DA_EQUIPE);
    const regras = prompt.indexOf("REGRAS QUE NÃO SE QUEBRAM");
    expect(persona).toBeGreaterThan(-1);
    expect(precedencia).toBeGreaterThan(persona);
    expect(regras).toBeGreaterThan(precedencia);
  });

  // "Fico à disposição" estava nos vícios de robô (não use) e, vinte linhas abaixo, no
  // fecho recomendado (use). Duas ordens opostas para a mesma frase viram sorteio.
  it("o prompt padrão não proíbe e recomenda a mesma frase", () => {
    const vicios = prompt.slice(prompt.indexOf("LINGUAGEM DE FORMULÁRIO"), prompt.indexOf("7. TODA MENSAGEM"));
    expect(vicios).not.toMatch(/fico à disposição/i);
    expect(prompt).toMatch(/O FECHO É CURTO E HUMANO\. "Fico à disposição"/);
  });
});
