import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// A TROCA DE PROVEDOR PELO PAINEL, na rota de verdade: quem pode, o que é recusado, e a
// garantia central — nada muda se o provedor escolhido não responder ao teste.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

const CHAVE_PAINEL = "sk-COLADA-NO-PAINEL-4321";

async function entrarComo(role: "admin" | "atendente") {
  const { createSession, SESSION_COOKIE } = await import("@/lib/auth/session");
  pote.set(SESSION_COOKIE, await createSession({ sub: "u1", email: "a@exemplo.com", role }));
}

async function trocar(corpo: unknown) {
  const { PUT } = await import("@/app/api/integrations/llm/route");
  return PUT(
    new NextRequest("http://painel.local/api/integrations/llm", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

const respostaDoProvedor = (status: number) =>
  ({
    ok: status < 300,
    status,
    json: async () => (status < 300 ? { choices: [{ message: { content: "pong" } }], usage: {} } : { error: { message: "Incorrect API key" } }),
    text: async () => "",
  }) as unknown as Response;

describe("PUT /api/integrations/llm", () => {
  beforeEach(() => {
    vi.resetModules();
    pote.clear();
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-de-teste";
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("sem sessão é 401, e quem não é admin leva 403", async () => {
    expect((await trocar({ ativo: "openai" })).status).toBe(401);
    await entrarComo("atendente");
    expect((await trocar({ ativo: "openai" })).status).toBe(403);
  });

  it("escolher o ChatGPT sem chave nenhuma é recusado", async () => {
    await entrarComo("admin");
    const res = await trocar({ ativo: "openai" });
    expect(res.status).toBe(400);
    const { todosOsLlms } = await import("@/lib/agent/llm");
    expect((await todosOsLlms()).ativo).toBe("deepseek");
  });

  it("chave que o provedor recusa: NADA muda, e a chave não fica gravada", async () => {
    await entrarComo("admin");
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoProvedor(401)));
    const res = await trocar({ ativo: "openai", openaiApiKey: CHAVE_PAINEL });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("4321");
    const { todosOsLlms, lerLlmGravado } = await import("@/lib/agent/llm");
    expect((await todosOsLlms()).ativo).toBe("deepseek");
    expect((await lerLlmGravado()).openaiApiKey).toBeUndefined();
  });

  it("chave que responde: troca, chama o endereço da OpenAI no dialeto dela, e não devolve a chave", async () => {
    await entrarComo("admin");
    const chamada = vi.fn(async (..._a: unknown[]) => respostaDoProvedor(200));
    vi.stubGlobal("fetch", chamada);
    const res = await trocar({ ativo: "openai", openaiApiKey: CHAVE_PAINEL, openaiModel: "gpt-4.1-mini" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain("4321");

    const [url, init] = chamada.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe(`Bearer ${CHAVE_PAINEL}`);
    expect(JSON.parse(init.body)).toMatchObject({ model: "gpt-4.1-mini", max_completion_tokens: 16 });

    const { GET } = await import("@/app/api/integrations/llm/route");
    const estado = await (await GET()).json();
    expect(estado.ativo).toBe("openai");
    expect(JSON.stringify(estado)).not.toContain("4321");
    expect(estado.provedores[0]).toMatchObject({ provedor: "openai", configurado: true, origemDaChave: "painel" });
  });

  it("voltar para o DeepSeek mantém a chave e o modelo do ChatGPT guardados", async () => {
    await entrarComo("admin");
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoProvedor(200)));
    await trocar({ ativo: "openai", openaiApiKey: CHAVE_PAINEL, openaiModel: "gpt-4.1" });
    expect((await trocar({ ativo: "deepseek" })).status).toBe(200);
    const { todosOsLlms } = await import("@/lib/agent/llm");
    const { ativo, llms } = await todosOsLlms();
    expect(ativo).toBe("deepseek");
    expect(llms[1]).toMatchObject({ provedor: "openai", modelo: "gpt-4.1", configurado: true });
  });

  it("nome de modelo que não é nome de modelo é recusado", async () => {
    await entrarComo("admin");
    expect((await trocar({ ativo: "deepseek", openaiModel: "../x y" })).status).toBe(400);
  });
});
