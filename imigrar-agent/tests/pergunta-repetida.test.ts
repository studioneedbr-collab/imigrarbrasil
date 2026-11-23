import { describe, it, expect } from "vitest";
import { perguntasRepetidas, instrucaoDeReescrita, semAsPerguntasRepetidas } from "@/lib/agent/pergunta-repetida";
import type { Lead } from "@/lib/domain/types";

// A ÚLTIMA REDE: a resposta que pergunta de novo o que a ficha já tem é reescrita.
// As frases abaixo são as das conversas reais que o time mandou.

const angelo = { contactName: "Angelo", clientType: "Portugal", region: "Exterior — Suíça" } as Lead;

describe("pergunta repetida", () => {
  it("pega as perguntas dos prints", () => {
    expect(perguntasRepetidas("Obrigada, Angelo. E você está no Brasil neste momento ou em Portugal?", angelo)).toEqual(["onde"]);
    expect(perguntasRepetidas("Você mencionou que está na Suíça, e é isso que preciso confirmar: você está na Suíça agora, neste momento?", angelo)).toEqual(["onde"]);
    expect(perguntasRepetidas("Para eu entender qual caminho faz sentido: você é brasileiro ou tem outra nacionalidade?", { clientType: "Brasil" } as Lead)).toEqual(["nacionalidade"]);
    expect(perguntasRepetidas("Antes de mais nada, como você se chama?", angelo)).toEqual(["nome"]);
    expect(perguntasRepetidas("¿Dónde estás ahora?", angelo)).toEqual(["onde"]);
  });

  it("não dispara quando a ficha não tem o campo, nem em frase que não é pergunta", () => {
    expect(perguntasRepetidas("Você está no Brasil neste momento?", { clientType: "Portugal" } as Lead)).toEqual([]);
    expect(perguntasRepetidas("Entendi: você está na Suíça e é português.", angelo)).toEqual([]);
    expect(perguntasRepetidas("Existe alguma viagem ao Brasil prevista?", angelo)).toEqual([]);
    expect(perguntasRepetidas("Qualquer coisa?", null)).toEqual([]);
  });

  it("pega as formas mais comuns, que o \\b do JavaScript deixava passar", () => {
    for (const q of [
      "Onde você está agora?",
      "Onde você está?",
      "Onde está você neste momento?",
      "Você está aqui no Brasil?",
      "Você mora no Brasil?",
      "Qual é a sua nacionalidade?",
      "De onde você é?",
    ]) {
      expect(perguntasRepetidas(q, angelo).length, q).toBeGreaterThan(0);
    }
  });

  it("NÃO dispara em pergunta legítima sobre outra pessoa ou outro assunto", () => {
    for (const q of [
      "Qual a nacionalidade da sua esposa?",
      "Seu filho tem nacionalidade brasileira?",
      "Você tem dupla nacionalidade?",
      "Sua esposa está no Brasil?",
      "Ela está no Líbano atualmente?",
      "Seu pedido está em análise hoje?",
      "Onde mora a sua família?",
      "Como se chama a empresa que te contratou?",
      "Qual é o seu nome completo?",
      "Você está no Brasil há quanto tempo?",
      "Você está com o passaporte em mãos?",
    ]) {
      expect(perguntasRepetidas(q, angelo), q).toEqual([]);
    }
  });

  it("sem reescrita, a pergunta repetida é retirada e o resto fica", () => {
    expect(
      semAsPerguntasRepetidas("Obrigada, Angelo. E você está no Brasil neste momento ou em Portugal? Me conta o que aconteceu com o pedido.", angelo),
    ).toBe("Obrigada, Angelo. Me conta o que aconteceu com o pedido.");
    // Se sobrar nada, sai a original: mensagem vazia não vai.
    expect(semAsPerguntasRepetidas("Onde você está agora?", angelo)).toBe("Onde você está agora?");
  });

  it("a instrução diz o que ela já respondeu", () => {
    const t = instrucaoDeReescrita(["onde"], angelo);
    expect(t).toContain("ela já disse: Exterior — Suíça");
    expect(t).toContain("sem pedir confirmação");
  });
});
