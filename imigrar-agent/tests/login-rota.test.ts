import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// O LOGIN DE PONTA A PONTA — a rota de verdade, o repositório em memória, o cookie de
// verdade. As peças (hash, sessão, limite) tinham teste; a rota que as junta, não.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { getRepository } from "@/lib/data";
import { hashPassword } from "@/lib/auth/password";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimit } from "@/lib/auth/rate-limit";
import { caminhoInterno } from "@/lib/auth/caminho-interno";

const SENHA = "uma-senha-bem-comprida";
let n = 0;

const pedir = (corpo: unknown) =>
  login(
    new NextRequest("http://painel.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify(corpo),
    }),
  );

async function novaConta(role: "admin" | "atendente" = "atendente") {
  const email = `pessoa${++n}@exemplo.com`;
  await getRepository().createUser({ email, passwordHash: hashPassword(SENHA), role });
  return email;
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    pote.clear();
    resetRateLimit();
  });

  it("senha certa: 200, e o cookie é uma sessão válida com o papel da conta", async () => {
    const email = await novaConta("admin");
    const res = await pedir({ email, password: SENHA });
    expect(res.status).toBe(200);
    const sessao = await verifySession(pote.get(SESSION_COOKIE) ?? "");
    expect(sessao).toMatchObject({ email, role: "admin" });
  });

  it("aceita o e-mail com maiúsculas e espaço que a pessoa digitou", async () => {
    const email = await novaConta();
    const res = await pedir({ email: email.toUpperCase(), password: SENHA });
    expect(res.status).toBe(200);
  });

  it("senha errada e e-mail inexistente dão a MESMA resposta, sem cookie", async () => {
    const email = await novaConta();
    const errada = await pedir({ email, password: "outra-senha-qualquer" });
    const inexistente = await pedir({ email: "ninguem@exemplo.com", password: SENHA });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await errada.json()).toEqual(await inexistente.json());
    expect(pote.has(SESSION_COOKIE)).toBe(false);
  });

  it("corpo malformado não vira 500", async () => {
    expect((await pedir({ email: "não é e-mail", password: "" })).status).toBe(401);
  });

  it("a sexta tentativa na mesma conta é barrada, mesmo com a senha certa", async () => {
    const email = await novaConta();
    for (let i = 0; i < 5; i++) await pedir({ email, password: "errada-errada-errada" });
    const res = await pedir({ email, password: SENHA });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("banco fora do ar responde 503 — e não 'senha inválida'", async () => {
    const email = await novaConta();
    const espiao = vi.spyOn(getRepository(), "getUserByEmail").mockRejectedValueOnce(new Error("connection refused"));
    const res = await pedir({ email, password: SENHA });
    espiao.mockRestore();
    expect(res.status).toBe(503);
    expect(pote.has(SESSION_COOKIE)).toBe(false);
  });

  it("sair apaga o cookie", async () => {
    const email = await novaConta();
    await pedir({ email, password: SENHA });
    expect(pote.has(SESSION_COOKIE)).toBe(true);
    await logout();
    expect(pote.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("para onde o login manda depois de entrar", () => {
  it("mantém caminho interno, com query", () => {
    expect(caminhoInterno("/dashboard/leads/abc?aba=docs")).toBe("/dashboard/leads/abc?aba=docs");
  });

  it("recusa tudo que o navegador levaria para outro site", () => {
    for (const truque of ["//site.com", "/\\site.com", "/\t/site.com", "/\n/site.com", "https://site.com", "javascript:alert(1)", "", null]) {
      expect(caminhoInterno(truque)).toBe("/dashboard");
    }
  });
});
