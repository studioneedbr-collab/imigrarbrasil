import { describe, it, expect } from "vitest";
import { classifyRouting } from "@/lib/agent/routing-net";

describe("classifyRouting — rede de segurança", () => {
  it("operacional: informar colaborador alocado", () => {
    expect(classifyRouting("Precisamos que vocês informem oficialmente o colaborador de vocês")?.kind).toBe(
      "operacional",
    );
  });
  it("operacional: mudar escala do porteiro alocado", () => {
    expect(classifyRouting("quero mudar a escala do porteiro que vocês alocaram aqui")?.kind).toBe("operacional");
  });
  it("operacional: substituir o faxineiro", () => {
    expect(classifyRouting("preciso substituir o faxineiro que está aqui")?.kind).toBe("operacional");
  });
  it("operacional: colaborador não apareceu", () => {
    expect(classifyRouting("o porteiro não apareceu hoje")?.kind).toBe("operacional");
  });

  it("departamento_pessoal: meu salário não caiu", () => {
    expect(classifyRouting("meu salário não caiu esse mês")?.kind).toBe("departamento_pessoal");
  });
  it("departamento_pessoal: minhas férias", () => {
    expect(classifyRouting("queria saber sobre as minhas férias")?.kind).toBe("departamento_pessoal");
  });

  it("candidato: quer trabalhar", () => {
    expect(classifyRouting("tenho interesse em trabalhar na Shine Rio")?.kind).toBe("candidato");
  });
  it("candidato: enviar currículo", () => {
    expect(classifyRouting("posso mandar meu currículo?")?.kind).toBe("candidato");
  });

  // Comercial NUNCA pode cair na rede (senão a Shayene deixaria de vender).
  it("comercial: pedido de postos → null", () => {
    expect(classifyRouting("preciso de 3 porteiros na Barra da Tijuca")).toBeNull();
  });
  it("comercial: orçamento de limpeza → null", () => {
    expect(classifyRouting("quero um orçamento de limpeza pra minha empresa")).toBeNull();
  });
  it("comercial: quero contratar → null", () => {
    expect(classifyRouting("quero contratar porteiros e faxineiros")).toBeNull();
  });
  it("vazio → null", () => {
    expect(classifyRouting("")).toBeNull();
  });
});
