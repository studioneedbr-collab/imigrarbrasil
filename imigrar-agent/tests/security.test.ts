import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPublicPath, PUBLIC_PATHS_LIST } from "@/lib/auth/public-paths";
import { hashPassword, verifyPassword, needsRehash } from "@/lib/auth/password";
import { rateLimit, resetRateLimit, clientIp } from "@/lib/auth/rate-limit";
import { createSession, verifySession } from "@/lib/auth/session";

describe("allowlist de rotas públicas", () => {
  it("mantém aberta apenas a lista conhecida", () => {
    expect(PUBLIC_PATHS_LIST.sort()).toEqual(
      [
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/setup",
        "/api/webhook/whatsapp",
        // A captura do site. Entra aqui porque se autentica no próprio handler, por
        // SITE_CAPTURE_TOKEN, e é fail-closed: sem o segredo configurado ela recusa tudo
        // com 503 em vez de ficar aberta — a mesma postura do webhook.
        //
        // Este teste é o motivo de a lista não crescer sozinha: acrescentar rota pública
        // tem que doer um pouco, e quebrar um teste chamado "mantém aberta apenas a lista
        // conhecida" é a dor certa.
        "/api/captura/site",
        // O que o WordPress do site empurra quando um registro é salvo lá (Orçamentos e
        // os outros tipos de conteúdo dele). Mesmo segredo, mesma postura fail-closed.
        "/api/captura/registro",
        "/api/health",
        "/api/cron/followups",
        "/api/cron/followup",
      ].sort(),
    );
  });

  it("protege as rotas que expõem PII de clientes", () => {
    for (const rota of [
      "/api/clientes",
      "/api/funcionarios",
      "/api/leads",
      "/api/conversations",
      "/api/conversations/abc-123",
      "/api/proposals",
      "/api/knowledge",
      "/api/agent-config",
      "/api/pricing-params",
      "/api/simulate",
      "/api/users",
    ]) {
      expect(isPublicPath(rota), `${rota} deveria exigir sessão`).toBe(false);
    }
  });

  it("não libera por prefixo — só correspondência exata", () => {
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/login/roubar")).toBe(false);
    expect(isPublicPath("/api/auth")).toBe(false);
    expect(isPublicPath("/api/webhook/whatsapp/extra")).toBe(false);
    // Não há mais exceção por prefixo. O PDF de proposta comercial era servida por
    // link "não adivinhável" — e UUID não é controle de acesso para situação migratória.
    expect(isPublicPath("/api/proposal/8ca426c5-0000-0000-0000-000000000000")).toBe(false);
    expect(isPublicPath("/api/leads/8ca426c5-0000-0000-0000-000000000000")).toBe(false);
  });

  it("normaliza barra final e caixa", () => {
    expect(isPublicPath("/api/auth/login/")).toBe(true);
    expect(isPublicPath("/API/Auth/Login")).toBe(true);
  });
});

describe("hash de senha", () => {
  it("valida a senha correta e rejeita a errada", () => {
    const hash = hashPassword("senha-bem-longa-123");
    expect(verifyPassword("senha-bem-longa-123", hash)).toBe(true);
    expect(verifyPassword("senha-bem-longa-124", hash)).toBe(false);
  });

  it("gera salt diferente a cada chamada", () => {
    expect(hashPassword("igual")).not.toBe(hashPassword("igual"));
  });

  it("grava os parâmetros de custo no próprio hash", () => {
    expect(hashPassword("x").startsWith(`scrypt$${1 << 17}$8$1$`)).toBe(true);
  });

  it("ainda valida hashes no formato legado salt:hash", () => {
    // Formato antigo, gerado com os defaults do Node (N=16384).
    const { scryptSync, randomBytes } = require("crypto");
    const salt = randomBytes(16).toString("hex");
    const legado = `${salt}:${scryptSync("antiga", salt, 64).toString("hex")}`;
    expect(verifyPassword("antiga", legado)).toBe(true);
    expect(verifyPassword("errada", legado)).toBe(false);
    expect(needsRehash(legado)).toBe(true);
  });

  it("não relança exceção com hash corrompido", () => {
    for (const lixo of ["", "sem-separador", "scrypt$abc$8$1$xx$yy", "a:b"]) {
      expect(verifyPassword("qualquer", lixo)).toBe(false);
    }
  });

  it("hash novo não pede rehash", () => {
    expect(needsRehash(hashPassword("nova"))).toBe(false);
  });
});

describe("rate limit", () => {
  beforeEach(() => resetRateLimit());

  it("libera até o limite e bloqueia depois", () => {
    const opts = { limit: 3, windowSeconds: 60 };
    expect(rateLimit("k", opts, 1000).allowed).toBe(true);
    expect(rateLimit("k", opts, 1000).allowed).toBe(true);
    expect(rateLimit("k", opts, 1000).allowed).toBe(true);
    expect(rateLimit("k", opts, 1000).allowed).toBe(false);
  });

  it("libera de novo depois que a janela expira", () => {
    const opts = { limit: 1, windowSeconds: 60 };
    expect(rateLimit("k", opts, 1000).allowed).toBe(true);
    expect(rateLimit("k", opts, 5000).allowed).toBe(false);
    expect(rateLimit("k", opts, 61_001).allowed).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    const opts = { limit: 1, windowSeconds: 60 };
    expect(rateLimit("ip:a", opts, 1000).allowed).toBe(true);
    expect(rateLimit("ip:b", opts, 1000).allowed).toBe(true);
  });

  it("informa quanto tempo falta para liberar", () => {
    const opts = { limit: 1, windowSeconds: 60 };
    rateLimit("k", opts, 1000);
    expect(rateLimit("k", opts, 31_000).retryAfterSeconds).toBe(30);
  });

  it("extrai o IP do cliente de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("desconhecido");
  });
});

describe("sessão JWT", () => {
  const ANTES = process.env.AUTH_SECRET;
  beforeEach(() => { process.env.AUTH_SECRET = "x".repeat(48); });
  afterEach(() => { process.env.AUTH_SECRET = ANTES; });

  it("faz round-trip de uma sessão válida", async () => {
    const token = await createSession({ sub: "u1", email: "a@b.com", role: "admin" });
    // toMatchObject e não toEqual: a verificação também devolve `exp`, que o
    // middleware usa para decidir a renovação da janela deslizante.
    expect(await verifySession(token)).toMatchObject({ sub: "u1", email: "a@b.com", role: "admin" });
  });

  it("rejeita token assinado com outro segredo", async () => {
    const token = await createSession({ sub: "u1", email: "a@b.com", role: "admin" });
    process.env.AUTH_SECRET = "y".repeat(48);
    expect(await verifySession(token)).toBeNull();
  });

  it("rejeita token adulterado e lixo", async () => {
    const token = await createSession({ sub: "u1", email: "a@b.com", role: "admin" });
    expect(await verifySession(token.slice(0, -3) + "aaa")).toBeNull();
    expect(await verifySession("não-é-um-jwt")).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("trata qualquer papel desconhecido como 'atendente', nunca como admin", async () => {
    // 'atendente' é o mais restrito dos três papéis: sem exportação, sem administração.
    const token = await createSession({
      sub: "u1", email: "a@b.com", role: "superadmin" as unknown as "admin",
    });
    expect((await verifySession(token))?.role).toBe("atendente");
  });

  it("o papel legado 'user' não vira advogado nem admin ao ser relido", async () => {
    const token = await createSession({
      sub: "u1", email: "a@b.com", role: "user" as unknown as "admin",
    });
    expect((await verifySession(token))?.role).toBe("atendente");
  });
});

// ── AS ROTAS DE CAPTURA PRECISAM ESTAR NA ALLOWLIST ───────────────────────────────
//
// Este teste existe por causa de um defeito real: `/api/captura/site` NASCEU FORA da
// allowlist e por isso nunca funcionou. O middleware devolvia 401 antes de o handler
// existir para quem chamava — e, visto de fora, 401 de middleware é indistinguível de
// token errado. O site do cliente teria sido integrado, testado, e alguém teria passado
// dias procurando o segredo errado.
//
// A lista é varrida do DISCO, e não escrita aqui, porque uma lista escrita à mão teria o
// mesmo defeito que ela deveria pegar: a terceira rota de captura seria esquecida nas
// duas.
describe("toda rota de captura responde sem sessão", () => {
  const { readdirSync, existsSync } = require("fs") as typeof import("fs");
  const dir = "app/api/captura";
  const tipos = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  it("existe pelo menos uma, senão o teste não está olhando nada", () => {
    expect(tipos.length).toBeGreaterThan(0);
  });

  for (const tipo of tipos) {
    it(`/api/captura/${tipo} está na allowlist`, () => {
      expect(isPublicPath(`/api/captura/${tipo}`)).toBe(true);
    });
  }

  // O contrário também: uma rota que saiu do disco e ficou na lista é uma porta aberta
  // apontando para lugar nenhum — e a próxima pessoa a criar esse caminho o encontra
  // público sem ter pedido.
  it("não sobra na lista nenhuma captura que não existe mais", () => {
    const naLista = PUBLIC_PATHS_LIST.filter((p) => p.startsWith("/api/captura/"));
    for (const p of naLista) {
      expect(tipos).toContain(p.replace("/api/captura/", ""));
    }
  });
});
