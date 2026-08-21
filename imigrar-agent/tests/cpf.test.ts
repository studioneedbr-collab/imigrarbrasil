import { describe, it, expect } from "vitest";
import { isValidCpf, extractCpf } from "@/lib/domain/cpf";

describe("CPF", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(isValidCpf("111.444.777-35")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
  });
  it("rejeita dígitos verificadores errados e repetidos", () => {
    expect(isValidCpf("111.444.777-00")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("extractCpf pega o CPF de uma frase", () => {
    expect(extractCpf("meu cpf é 111.444.777-35 ok?")).toBe("11144477735");
    expect(extractCpf("sem cpf aqui")).toBeUndefined();
  });
});
