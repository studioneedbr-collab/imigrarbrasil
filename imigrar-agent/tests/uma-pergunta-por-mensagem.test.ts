// UMA PERGUNTA POR MENSAGEM.
//
// O prompt sempre disse "UMA pergunta por vez, nunca duas", e numa conversa real de 28/08
// a Ana escreveu, em dois turnos seguidos:
//
//   "qual é o seu nome e de onde você é?"
//   "você está no Brasil agora, certo? Me conta também como foi essa multa — você recebeu
//    algum papel da Polícia Federal?"
//
// A pessoa respondeu "sim". Sim para qual? "Está no Brasil" e "recebeu o papel da PF" são
// fatos diferentes, e o segundo decide se existe prazo correndo. Dali em diante, o que vai
// para a ficha é suposição com cara de informação — e quem lê é o advogado.
//
// A regra piorou JUSTAMENTE quando as mensagens encurtaram: pedido para ser breve, o
// modelo comprime fundindo perguntas. Por isso ela deixou de morar só no prompt.

import { describe, it, expect } from "vitest";
import { revisarTurno, perguntasExcedentes, emFrases } from "@/lib/agent/verificador-de-saida";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";

const semEncaminhamento = { encaminhou: false as const, idioma: "pt" };

describe("o corte mantém a primeira pergunta e derruba as seguintes", () => {
  it("o caso real: 'está no Brasil?' + 'recebeu papel da PF?'", () => {
    const original =
      "Entendi, Gustavo. Você está no Brasil agora, certo? Me conta também como foi essa multa — você recebeu algum papel da Polícia Federal?";
    const { texto, cortes } = revisarTurno(original, semEncaminhamento);

    expect(texto).toContain("Você está no Brasil agora, certo?");
    expect(texto).not.toContain("Polícia Federal");
    expect(cortes).toHaveLength(1);
  });

  it("mensagem com UMA pergunta passa intacta, byte a byte", () => {
    const original = "Prazer, Gustavo. E você está no Brasil agora?";
    expect(revisarTurno(original, semEncaminhamento).texto).toBe(original);
  });

  it("mensagem sem pergunta nenhuma passa intacta", () => {
    const original = "Anotei aqui, Gustavo. Vou ver o que consigo levantar sobre isso.";
    expect(revisarTurno(original, semEncaminhamento).texto).toBe(original);
  });

  it("três perguntas viram uma", () => {
    const original = "Qual seu nome? De onde você é? E está no Brasil?";
    const { texto, cortes } = revisarTurno(original, semEncaminhamento);
    expect(texto).toBe("Qual seu nome?");
    expect(cortes).toHaveLength(2);
  });
});

describe("a interação com os outros cortes", () => {
  it("se a primeira pergunta cair por dar parecer, a seguinte SOBREVIVE", () => {
    // Sem este cuidado a mensagem sairia sem pergunta nenhuma e a conversa morreria ali:
    // a frase de parecer some, e a única pergunta restante seria cortada por ser "a
    // segunda" de uma contagem feita sobre o texto bruto.
    const original = "Sua situação está regular, tudo certo? Me diz: qual é o seu nome?";
    const { texto } = revisarTurno(original, semEncaminhamento);
    expect(texto).not.toMatch(/situação está regular/i);
    expect(texto).toContain("qual é o seu nome?");
  });

  it("nunca devolve mensagem vazia", () => {
    const original = "Sua entrada está regular?";
    const { texto } = revisarTurno(original, semEncaminhamento);
    expect(texto.trim().length).toBeGreaterThan(0);
  });
});

describe("perguntasExcedentes — a contagem isolada", () => {
  it("aponta só os índices depois da primeira pergunta", () => {
    const frases = emFrases("Oi. Tudo bem? E você? Certo.");
    expect(perguntasExcedentes(frases)).toEqual([2]);
  });

  it("não aponta nada quando há uma só", () => {
    expect(perguntasExcedentes(emFrases("Oi. Tudo bem? Certo."))).toEqual([]);
  });
});

describe("a regra no prompt", () => {
  const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

  it("pede um único '?' por mensagem", () => {
    expect(prompt).toMatch(/UMA pergunta por mensagem/);
    expect(prompt).toMatch(/UM "\?" na mensagem inteira/);
  });

  it("avisa que encurtar não é fundir perguntas — o jeito errado de obedecer", () => {
    expect(prompt).toMatch(/ENCURTAR NÃO É FUNDIR PERGUNTAS/);
  });

  it("explica o custo com o caso real, e não só a proibição", () => {
    expect(prompt).toMatch(/Sim\s*\n?\s*para qual\?|responde à última pergunta que leu/);
  });
});
