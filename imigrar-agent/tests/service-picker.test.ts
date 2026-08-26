import { describe, it, expect } from "vitest";
import { filtrarServicos } from "@/lib/comercial/function-search";

// O catálogo tem mais de 100 funções: num <select> nativo, achar "Auxiliar de Serviços
// Gerais" era rolar a lista inteira até a letra certa.
const CATALOGO = [
  { name: "Agente Administrativo", priceConfirmed: true },
  { name: "Auxiliar de Serviços Gerais", priceConfirmed: true },
  { name: "Auxiliar de Limpeza", priceConfirmed: false },
  { name: "Porteiro", priceConfirmed: true },
  { name: "Operador de Piscina", priceConfirmed: false },
];

describe("busca de função por digitação", () => {
  it("casa por pedaço, em qualquer ordem", () => {
    expect(filtrarServicos(CATALOGO, "serv ger").map((s) => s.name)).toEqual([
      "Auxiliar de Serviços Gerais",
    ]);
    expect(filtrarServicos(CATALOGO, "gerais aux").map((s) => s.name)).toEqual([
      "Auxiliar de Serviços Gerais",
    ]);
  });

  it("ignora acento e caixa", () => {
    expect(filtrarServicos(CATALOGO, "SERVICOS").map((s) => s.name)).toEqual([
      "Auxiliar de Serviços Gerais",
    ]);
  });

  it("entende a sigla que todo mundo digita", () => {
    expect(filtrarServicos(CATALOGO, "asg").map((s) => s.name)).toEqual([
      "Auxiliar de Serviços Gerais",
    ]);
  });

  it("busca vazia devolve o catálogo inteiro", () => {
    expect(filtrarServicos(CATALOGO, "")).toHaveLength(CATALOGO.length);
  });

  it("busca sem resultado devolve lista vazia (a tela mostra o aviso)", () => {
    expect(filtrarServicos(CATALOGO, "soldador")).toEqual([]);
  });
});
