import { describe, it, expect, vi } from "vitest";
import { comoResponder, dizONome, fezPergunta, garantirApresentacao, perguntasEmSequencia } from "@/lib/agent/conversa";
import { respondToConversation, montarEstadoDoTurno } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// A AGENTE SE APRESENTA PELO NOME E RESPONDE ANTES DE PERGUNTAR — as duas reclamações do
// escritório depois da troca de modelo.

vi.mock("@/lib/agent/runner", () => ({ runAgent: vi.fn() }));
import { runAgent } from "@/lib/agent/runner";

const c = { nome: "Cláudia", empresa: "Imigrar Brasil" };

describe("a apresentação", () => {
  it("o caso relatado: só o cargo, sem o nome", () => {
    expect(garantirApresentacao("Olá! Sou assistente de atendimento migratório da Imigrar Brasil. Como posso ajudar?", c)).toBe(
      "Olá! Sou Cláudia, assistente de atendimento migratório da Imigrar Brasil. Como posso ajudar?",
    );
    expect(garantirApresentacao("Hola, soy la asistente de Imigrar Brasil.", c)).toContain("soy Cláudia, asistente");
    expect(garantirApresentacao("Hi! I'm the virtual assistant of Imigrar Brasil.", c)).toContain("I'm Cláudia, virtual assistant");
  });
  it("sem apresentação nenhuma: entra depois da saudação", () => {
    expect(garantirApresentacao("Boa tarde, Angelo! Entendo a sua situação.", c)).toBe(
      "Boa tarde, Angelo! Aqui é Cláudia, do atendimento da Imigrar Brasil. Entendo a sua situação.",
    );
    expect(garantirApresentacao("Olá, boa tarde! com o prazo vencido, você precisa de orientação.", c)).toBe(
      "Olá, boa tarde! Aqui é Cláudia, do atendimento da Imigrar Brasil. Com o prazo vencido, você precisa de orientação.",
    );
    expect(garantirApresentacao("Você precisa de um visto, então não é tão simples.", c)).toMatch(/^Aqui é Cláudia/);
    expect(garantirApresentacao("Necesito saber más sobre su situación, gracias. ¿Usted está en Brasil?", c)).toMatch(/^Soy Cláudia/);
  });
  it("já disse o nome (com ou sem acento), ou idioma sem frase pronta: não mexe", () => {
    for (const t of ["Oi, aqui é a Claudia!", "Sou a Cláudia, da Imigrar Brasil."]) expect(garantirApresentacao(t, c)).toBe(t);
    expect(garantirApresentacao("مرحبا، كيف يمكنني مساعدتك؟", c)).toBe("مرحبا، كيف يمكنني مساعدتك؟");
    expect(dizONome("Sou a claudia", "Cláudia")).toBe(true);
  });
});

describe("responder antes de perguntar", () => {
  it("reconhece a pergunta, com e sem '?'", () => {
    for (const t of ["você é advogada?", "quanto custa", "como faço para renovar", "¿Cuánto cuesta?", "how long does it take"]) expect(fezPergunta(t), t).toBe(true);
    for (const t of ["Sou português", "Estou na Suíça", "minha mãe está doente"]) expect(fezPergunta(t), t).toBe(false);
  });
  it("conta o interrogatório", () => {
    expect(perguntasEmSequencia(["a?", "b.", "c?", "d? "])).toBe(2);
    expect(perguntasEmSequencia(["a?", "b."])).toBe(0);
  });
  it("a nota manda responder primeiro, e pergunta vira opcional", () => {
    const nota = montarEstadoDoTurno(null, 1, "pt", comoResponder({ primeira: false, ...c, perguntou: true, emSequencia: 2 }));
    expect(nota.indexOf("RESPONDA AO QUE ELA")).toBeLessThan(nota.indexOf("Pergunta é opcional"));
    expect(nota).toContain("HÁ UMA PERGUNTA");
    expect(nota).toContain("interrogatório");
    expect(nota).not.toContain("PRIMEIRA mensagem");
  });
});

describe("no turno de verdade", () => {
  it("a primeira resposta sai com o nome; a segunda não se reapresenta", async () => {
    const repo = getRepository();
    const conv = await repo.getOrCreateConversation("5511944440001", "Contato");
    const modelo = vi.mocked(runAgent);
    modelo.mockResolvedValue({ reply: "Olá! Sou assistente de atendimento migratório da Imigrar Brasil. Me conta o que aconteceu.", toolCalls: [], source: "openai" });
    await repo.addMessage(conv.id, "user", "Boa tarde, meu protocolo venceu, e agora?");
    const r1 = await respondToConversation(conv.id);
    expect(r1.reply).toContain("Sou Cláudia, assistente");
    expect(modelo.mock.calls[0][0].estadoDoTurno).toContain("PRIMEIRA mensagem");
    expect(modelo.mock.calls[0][0].estadoDoTurno).toContain("HÁ UMA PERGUNTA");

    modelo.mockResolvedValue({ reply: "Com o protocolo vencido, quem avalia o caminho é o time jurídico.", toolCalls: [], source: "openai" });
    await repo.addMessage(conv.id, "user", "Sou colombiano");
    const r2 = await respondToConversation(conv.id);
    expect(r2.reply).not.toContain("Cláudia");
    expect(modelo.mock.calls[1][0].estadoDoTurno).not.toContain("PRIMEIRA mensagem");
  });
});

describe("casos de borda", () => {
  it("não confunde negação, nome dentro de palavra nem relato com pergunta", () => {
    expect(garantirApresentacao("Não sou assistente social, mas posso ajudar.", c)).toMatch(/^Aqui é Cláudia/);
    expect(garantirApresentacao("Olá! Aqui é a assistente virtual da Imigrar Brasil.", c)).toBe("Olá! Aqui é Cláudia, assistente virtual da Imigrar Brasil.");
    expect(dizONome("Nesta semana atendemos.", "Ana")).toBe(false);
    expect(dizONome("Sou a Ana.", "Ana")).toBe(true);
    expect(fezPergunta("quando cheguei no Brasil, fiquei na casa da minha irmã")).toBe(false);
    expect(fezPergunta("queria saber o valor")).toBe(true);
    expect(perguntasEmSequencia(["Tudo bem? 😊"])).toBe(1);
  });
});
