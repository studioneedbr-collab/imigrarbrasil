import { describe, it, expect } from "vitest";
import { avaliarConfirmacao, confirmou } from "@/lib/agent/transfer-gate";
import { anunciaEncaminhamento, revisarTurno } from "@/lib/agent/verificador-de-saida";

// A CONVERSA QUE ORIGINOU ESTE ARQUIVO.
//
// Ana: "espero tu confirmación para pasar el contacto"
// Pessoa: "me llamo Ana Rodríguez, vivo en Boa Vista desde el año pasado"
// Ana: "ya pasé tu caso al equipo jurídico"
//
// Ela não confirmou nada — respondeu outra coisa. O encaminhamento até estava certo
// (havia multa migratória correndo, e multa é urgente), mas o texto mentiu ao sugerir
// que ela tinha concordado.

const semUrgencia = (agente: string, pessoa: string) =>
  avaliarConfirmacao({
    ultimaRespostaDoAgente: agente,
    ultimaMensagem: pessoa,
    textoRecente: pessoa,
  });

describe("confirmação de transferência é um sim, e só um sim", () => {
  it("responder outra coisa não é confirmar", () => {
    const r = semUrgencia(
      "¿Puedo pasar tu contacto al equipo jurídico? Espero tu confirmación.",
      "Me llamo Ana Rodríguez, vivo en Boa Vista desde el año pasado.",
    );
    expect(r.liberado).toBe(false);
    expect(r.confirmacaoPendente).toBe(true);
  });

  it.each([
    "sí",
    "Sim, por favor",
    "pode",
    "claro",
    "ok",
    "dale",
    "yes",
    "quero",
  ])("%j é confirmação", (resposta) => {
    const r = semUrgencia("Posso pedir para eles falarem com você?", resposta);
    expect(r.liberado).toBe(true);
    expect(r.confirmacaoPendente).toBe(false);
  });

  it.each([
    "estou pensando ainda",
    "mi hermana también está aquí",
    "quem vai me atender?",
  ])("%j NÃO é confirmação", (resposta) => {
    expect(semUrgencia("Posso passar o seu contato?", resposta).liberado).toBe(false);
  });

  it.each([
    "no sé si sí o no, primero dime cuánto cuesta",
    "sí pero espera",
    "não",
    "ainda não sei",
    "talvez",
  ])("a leitura da palavra recusa %j", (resposta) => {
    // Testado direto em `confirmou`, e não no portão: "cuánto cuesta" é pergunta de
    // honorários, que LIBERA o encaminhamento por outro caminho (a pressa vem antes).
    // São duas perguntas diferentes e o teste precisa separar as duas.
    expect(confirmou(resposta)).toBe(false);
  });

  it("sem pergunta de confirmação no ar, o portão não segura nada", () => {
    // Este portão trata de UMA coisa só. Quem decide se já há caso é `avaliarTransferencia`.
    const r = semUrgencia("Você está no Brasil ou ainda fora?", "estou em Boa Vista");
    expect(r.liberado).toBe(true);
    expect(r.confirmacaoPendente).toBe(false);
  });
});

describe("a pressa vem antes da confirmação", () => {
  it.each([
    ["multa migratória", "recibí una multa migratoria y no sé qué hacer"],
    ["indeferimento", "negaram meu pedido de refúgio"],
    ["prazo correndo", "tenho um prazo que vence essa semana"],
    ["pediu advogado", "quiero hablar con un abogado"],
    ["risco à pessoa", "estou sendo ameaçado aqui"],
  ])("%s passa sem esperar o sim", (_caso, mensagem) => {
    const r = avaliarConfirmacao({
      ultimaRespostaDoAgente: "Posso passar o seu contato para o time jurídico?",
      ultimaMensagem: mensagem,
      textoRecente: mensagem,
    });
    expect(r.liberado).toBe(true);
    expect(r.confirmacaoPendente).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Segurar a tool resolve metade. A outra metade é a Ana escrever que encaminhou
// assim mesmo — e quem lê "já passei o seu caso" para de procurar ajuda e espera
// um telefonema que ninguém agendou.
// ─────────────────────────────────────────────────────────────────────────────
describe("não se anuncia um encaminhamento que não aconteceu", () => {
  it.each([
    "Ya pasé tu caso al equipo jurídico.",
    "Já passei o seu caso para o time jurídico.",
    "Já deixei o seu contato com a equipe.",
    "I've forwarded your case to our legal team.",
  ])("reconhece o anúncio %j", (frase) => {
    expect(anunciaEncaminhamento(frase)).toBe(true);
  });

  it("corta o anúncio quando a transferência não aconteceu", () => {
    const original =
      "Entendi. Ya pasé tu caso al equipo jurídico. ¿Estás en Boa Vista ahora?";
    const { texto, cortes } = revisarTurno(original, { idioma: "es", encaminhou: false });
    expect(cortes).toHaveLength(1);
    expect(texto).not.toMatch(/pasé tu caso/i);
    expect(texto).toContain("¿Estás en Boa Vista ahora?");
  });

  it("mantém o anúncio quando a transferência aconteceu de verdade", () => {
    const original = "Ya pasé tu caso al equipo jurídico. Ellos hablan contigo.";
    const { texto, cortes } = revisarTurno(original, { idioma: "es", encaminhou: true });
    expect(cortes).toEqual([]);
    expect(texto).toBe(original);
  });

  it("oferecer o encaminhamento não é anunciá-lo", () => {
    const original = "Posso pedir para o time jurídico falar com você?";
    expect(anunciaEncaminhamento(original)).toBe(false);
    expect(revisarTurno(original, { encaminhou: false }).cortes).toEqual([]);
  });
});
