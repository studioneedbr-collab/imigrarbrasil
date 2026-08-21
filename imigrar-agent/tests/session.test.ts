import { describe, it, expect } from "vitest";
import {
  createSession,
  verifySession,
  shouldRenew,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

const payload = { sub: "u1", email: "alguem@shinerio.com", role: "admin" as const };

describe("auth/session", () => {
  it("faz round-trip de sub/email/role", async () => {
    const session = await verifySession(await createSession(payload));
    expect(session).toMatchObject(payload);
  });

  it("a sessão vale 7 dias", async () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7);

    const session = await verifySession(await createSession(payload));
    const faltando = session!.exp - Math.floor(Date.now() / 1000);
    // margem de 60s para o tempo de execução do teste
    expect(faltando).toBeGreaterThan(SESSION_MAX_AGE_SECONDS - 60);
    expect(faltando).toBeLessThanOrEqual(SESSION_MAX_AGE_SECONDS);
  });

  it("não renova uma sessão recém-criada", async () => {
    const session = await verifySession(await createSession(payload));
    expect(shouldRenew(session!)).toBe(false);
  });

  it("renova quando passou da metade da validade", () => {
    const agora = Math.floor(Date.now() / 1000);
    // sessão criada há 5 dias: faltam 2, menos que a metade de 7
    expect(shouldRenew({ exp: agora + 60 * 60 * 24 * 2 })).toBe(true);
    // sessão criada há 1 dia: faltam 6, mais que a metade
    expect(shouldRenew({ exp: agora + 60 * 60 * 24 * 6 })).toBe(false);
  });

  it("rejeita token adulterado", async () => {
    const token = await createSession(payload);
    expect(await verifySession(token.slice(0, -3) + "aaa")).toBeNull();
  });

  it("o cookie é SameSite=lax — 'strict' derruba quem chega por link externo", () => {
    // Com 'strict' o navegador omite o cookie em navegação de topo vinda de
    // outro site (link do WhatsApp, e-mail, Google). A sessão está válida, mas o
    // middleware não a enxerga e manda para /login. 'lax' continua bloqueando o
    // envio em POST/PATCH/DELETE cross-site, que é a proteção que importa.
    expect(sessionCookieOptions().sameSite).toBe("lax");
  });

  it("o cookie é persistente e sobrevive a fechar o navegador", () => {
    const opts = sessionCookieOptions();
    expect(opts.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
  });
});
