// "SÉRGIO ASSUMIU", E NÃO "sergio.reis@imigrarbrasil.com.br ASSUMIU".
//
// O painel grava autoria por e-mail, e como IDENTIDADE isso está certo: é único e não muda
// quando alguém corrige a grafia do próprio nome. Como TEXTO NA TELA está errado — quem lê
// são as três ou quatro pessoas do escritório, que se chamam pelo primeiro nome, e o
// endereço inteiro empurrava o resto da frase para fora da linha.
//
// O que se testa aqui é o que não pode acontecer: a informação de quem assumiu SUMIR
// porque a tradução falhou. Faixa feia é ruim; faixa sem autor é pior.

import { describe, it, expect } from "vitest";
import { primeiroNome, quemFez, nomesPorEmail } from "@/lib/auth/nomes";
import { getRepository } from "@/lib/data";

const nomes = new Map([
  ["sergio.reis@imigrarbrasil.com.br", "Sérgio Reis"],
  ["gama.walter@gmail.com", "Walter Gama"],
]);

describe("o primeiro nome basta", () => {
  it("corta o sobrenome", () => {
    expect(primeiroNome("Sérgio Reis")).toBe("Sérgio");
    expect(primeiroNome("Walter Gama")).toBe("Walter");
  });

  it("nome composto longo não quebra a faixa", () => {
    expect(primeiroNome("Maria da Conceição dos Santos")).toBe("Maria");
  });

  it("nome de uma palavra continua inteiro", () => {
    expect(primeiroNome("Cláudia")).toBe("Cláudia");
  });

  it("espaço sobrando não vira nome vazio", () => {
    expect(primeiroNome("  Ana  ")).toBe("Ana");
  });
});

describe("o e-mail vira nome quando dá, e sobrevive quando não dá", () => {
  it("traduz quem está na lista", () => {
    expect(quemFez("sergio.reis@imigrarbrasil.com.br", nomes)).toBe("Sérgio");
    expect(quemFez("gama.walter@gmail.com", nomes)).toBe("Walter");
  });

  it("não se perde na caixa alta", () => {
    expect(quemFez("Sergio.Reis@IMIGRARBRASIL.com.br", nomes)).toBe("Sérgio");
  });

  // O CASO QUE IMPORTA. Usuário apagado, e-mail de um sistema, lista que não carregou:
  // continua aparecendo QUEM, ainda que feio. Devolver vazio apagaria a única coisa que a
  // faixa existe para dizer.
  it("desconhecido continua aparecendo, com o e-mail", () => {
    expect(quemFez("ninguem@exemplo.com", nomes)).toBe("ninguem@exemplo.com");
  });

  it("sem e-mail não inventa autor", () => {
    expect(quemFez(null, nomes)).toBeNull();
    expect(quemFez(undefined, nomes)).toBeNull();
  });

  it("lista vazia não apaga a autoria", () => {
    expect(quemFez("sergio.reis@imigrarbrasil.com.br", new Map())).toBe(
      "sergio.reis@imigrarbrasil.com.br",
    );
  });
});

describe("a lista sai do repositório", () => {
  it("monta o mapa de e-mail para nome", async () => {
    const repo = getRepository();
    await repo.createUser({
      email: "teste.nomes@local.dev",
      name: "Fulano de Tal",
      passwordHash: "x",
      role: "atendente",
    } as never);
    const mapa = await nomesPorEmail(repo);
    expect(quemFez("teste.nomes@local.dev", mapa)).toBe("Fulano");
  });
});
