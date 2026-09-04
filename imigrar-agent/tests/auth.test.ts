import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword, verifyPassword, needsRehash, DUMMY_HASH } from "@/lib/auth/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

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

// ─────────────────────────────────────────────────────────────────────────────
// O SCRIPT DE REDEFINIR SENHA NÃO PODE DIVERGIR DO LOGIN
// ─────────────────────────────────────────────────────────────────────────────
//
// `scripts/redefinir-senha.mjs` grava o hash sozinho, sem importar `lib/auth/password.ts`
// — é um script de operação, roda com `node` puro e antes de qualquer build. O preço disso
// é que os parâmetros do scrypt existem em dois lugares, e divergir é uma falha SILENCIOSA
// do pior tipo: o banco aceita qualquer string em `password_hash`, o script diz "senha
// redefinida", e o login recusa. A pessoa fica trancada achando que digitou errado.
//
// Este teste é o que percebe. Se `N` mudar em password.ts, ele falha até o script mudar junto.
describe("o script de redefinir senha fala a mesma língua do login", () => {
  const script = readFileSync(
    join(process.cwd(), "scripts", "redefinir-senha.mjs"),
    "utf8",
  );

  it("usa os mesmos parâmetros de scrypt", () => {
    // O formato é `scrypt$N$r$p$salt$hash` — os três primeiros campos são o custo.
    const [, n, r, p] = hashPassword("uma senha qualquer").split("$");

    const doScript = (nome: string) => {
      const m = script.match(new RegExp(`const ${nome} = ([^;]+);`));
      if (!m) throw new Error(`o script não declara ${nome}`);
      // eslint-disable-next-line no-eval -- expressão numérica do próprio repositório
      return String(eval(m[1]));
    };

    expect(doScript("N")).toBe(n);
    expect(doScript("R")).toBe(r);
    expect(doScript("P")).toBe(p);
    expect(doScript("KEYLEN")).toBe("64");
  });

  it("exige o mesmo tamanho mínimo de senha que a rota de usuários", () => {
    expect(script).toContain(`const MIN_SENHA = ${MIN_PASSWORD_LENGTH};`);
  });

  it("confere que a conta existe ANTES de escrever", () => {
    // Um e-mail com um caractere errado faria o UPDATE não afetar linha nenhuma e sair sem
    // erro — e a senha mostrada no terminal não seria a senha de conta nenhuma.
    const select = script.indexOf("select email, role, active, dono from users");
    const update = script.indexOf("update users set password_hash");
    expect(select).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(select);
  });
});
