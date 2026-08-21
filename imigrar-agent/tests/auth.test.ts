import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, needsRehash, DUMMY_HASH } from "@/lib/auth/password";

describe("auth/password", () => {
  it("hashPassword/verifyPassword faz round-trip corretamente", () => {
    const stored = hashPassword("minhaSenha123");
    expect(verifyPassword("minhaSenha123", stored)).toBe(true);
  });

  it("verifyPassword rejeita senha incorreta", () => {
    const stored = hashPassword("minhaSenha123");
    expect(verifyPassword("senhaErrada", stored)).toBe(false);
  });

  // O DUMMY_HASH existe para o login de e-mail inexistente gastar o mesmo tempo
  // de um login real. Se N subir e ele ficar para trás, passa a custar menos que
  // o caminho que imita — e a diferença volta a denunciar quais e-mails existem.
  it("DUMMY_HASH acompanha os parâmetros correntes de hash", () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });

  it("DUMMY_HASH é verificável (não é uma string qualquer)", () => {
    expect(verifyPassword("senha-inexistente-apenas-para-igualar-o-tempo", DUMMY_HASH)).toBe(true);
  });
});
