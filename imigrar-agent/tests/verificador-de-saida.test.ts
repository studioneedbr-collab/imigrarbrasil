import { describe, it, expect } from "vitest";
import { revisarSaida, qualificaSituacao, emFrases } from "@/lib/agent/verificador-de-saida";

// O CASO QUE ORIGINOU ESTE ARQUIVO.
//
// Na conversa da Ana Rodríguez, a agente escreveu que ter o passaporte carimbado em
// Pacaraima "es buena señal: significa que tu entrada quedó registrada de forma regular".
// Isso é análise do caso concreto — proibida em todas as versões do prompt — e, pior,
// afirma para a pessoa que a entrada dela é REGULAR. Se estiver errado, ela decide a vida
// em cima de uma garantia falsa dada por um escritório de advocacia.

describe("o verificador não deixa a Ana qualificar a situação da pessoa", () => {
  it("corta a frase de Pacaraima e mantém o resto da mensagem", () => {
    const original =
      "Entendi, Ana. Que te hayan sellado el pasaporte en Pacaraima es buena señal: significa que tu entrada quedó registrada de forma regular. ¿Sigues en Boa Vista?";
    const { texto, cortes } = revisarSaida(original, "es");
    expect(cortes).toHaveLength(1);
    expect(texto).not.toMatch(/buena señal/i);
    expect(texto).not.toMatch(/de forma regular/i);
    expect(texto).toContain("Entendi, Ana.");
    expect(texto).toContain("¿Sigues en Boa Vista?");
  });

  it.each([
    ["pt", "Sua situação está regular, pode ficar tranquilo."],
    ["pt", "Isso é um bom sinal."],
    ["pt", "Está tudo certo com a sua entrada."],
    ["pt", "Isso pesa a seu favor no processo."],
    ["pt", "Você está irregular hoje."],
    ["pt", "Isso complica o seu caso."],
    ["es", "Tu situación es regular."],
    ["es", "Está todo bien con tu entrada."],
    ["es", "Eso juega a tu favor."],
    ["en", "Your entry is regular."],
    ["en", "That is a good sign."],
  ])("%s: recusa o parecer %j", (_idioma, frase) => {
    expect(qualificaSituacao(frase)).toBe(true);
  });

  it.each([
    "Você quer falar sobre regularização migratória?",
    "Regularização migratória é o caminho de quem já está no Brasil.",
    "Fica tranquilo, a gente se entende. Pode escrever no idioma que preferir.",
    "Você entrou por Pacaraima e teve o passaporte carimbado, certo?",
    "O CRNM é o documento de identidade de quem é migrante no Brasil.",
    "Em que data você entrou no Brasil?",
  ])("deixa passar a frase legítima %j", (frase) => {
    expect(qualificaSituacao(frase)).toBe(false);
  });

  it("registrar o fato continua permitido — é qualificar que não", () => {
    const original =
      "Entendi: você entrou por Pacaraima e teve o passaporte carimbado. Quem consegue dizer o que isso significa no seu caso é o time jurídico. Você está em Boa Vista hoje?";
    const { texto, cortes } = revisarSaida(original, "pt");
    expect(cortes).toEqual([]);
    expect(texto).toBe(original);
  });

  it("mensagem que era só parecer vira acolhimento neutro NO IDIOMA da conversa", () => {
    const { texto, cortes } = revisarSaida("Sua entrada está regular.", "es");
    expect(cortes).toHaveLength(1);
    expect(texto).toMatch(/equipo jurídico/);
  });

  it("mensagem limpa sai byte a byte como o modelo escreveu", () => {
    const original = "Oi! Sou a Ana.\n\nComo posso te ajudar hoje?";
    expect(revisarSaida(original, "pt").texto).toBe(original);
  });

  it("quebrar em frases e juntar de volta devolve o texto original", () => {
    const original = "Uma. Duas!\nTrês? Quatro\n\nCinco.";
    expect(emFrases(original).join("")).toBe(original);
  });
});
