import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// FORMULÁRIOS DO SITE: a lista paginada no repositório e a planilha com TODOS — na rota
// de verdade, com o repositório em memória.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

import { GET } from "@/app/api/exportar/formularios/route";
import { getRepository } from "@/lib/data";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { celulaCsv } from "@/lib/site/formularios";

const repo = getRepository();
let n = 0;

async function leadDe(origem: "site" | "whatsapp", nome: string, nota?: string) {
  const c = await repo.getOrCreateConversation(`55118${String(++n).padStart(8, "0")}`, nome);
  return repo.upsertLead(c.id, { contactName: nome, origem, notes: nota ?? null });
}
const entrar = async (role: "admin" | "advogado" | "atendente") =>
  void pote.set(SESSION_COOKIE, await createSession({ sub: "u1", email: "quem@exemplo.com", role }));
const baixar = () => GET(new NextRequest("http://painel.local/api/exportar/formularios"));

describe("formulários do site", () => {
  beforeEach(() => pote.clear());

  it("a lista por origem pagina sem repetir nem pular, e o total é o da origem inteira", async () => {
    const antes = (await repo.listarLeadsPorOrigem("site")).total;
    for (let i = 0; i < 5; i++) await leadDe("site", `Do Site ${i}`);
    await leadDe("whatsapp", "Do WhatsApp");

    const todos = await repo.listarLeadsPorOrigem("site");
    expect(todos.total).toBe(antes + 5);
    expect(todos.leads.every((l) => l.origem === "site")).toBe(true);

    const p1 = await repo.listarLeadsPorOrigem("site", { pagina: 1, porPagina: 2 });
    const p2 = await repo.listarLeadsPorOrigem("site", { pagina: 2, porPagina: 2 });
    expect(p1.total).toBe(antes + 5);
    expect([...p1.leads, ...p2.leads].map((l) => l.id)).toEqual(todos.leads.slice(0, 4).map((l) => l.id));
    expect((await repo.listarLeadsPorOrigem("site", { pagina: 999, porPagina: 2 })).leads).toEqual([]);
  });

  it("sem sessão é 401, e atendente não exporta", async () => {
    expect((await baixar()).status).toBe(401);
    await entrar("atendente");
    expect((await baixar()).status).toBe(403);
  });

  it("advogado baixa a planilha com todos os do site, e só eles", async () => {
    await leadDe("site", "Maria Exemplo", "Origem: fale-conosco\nPágina: /fale-conosco/");
    await leadDe("whatsapp", "Não Entra Na Planilha");
    await entrar("advogado");

    const res = await baixar();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("imigrar-formularios-do-site-");

    // O BOM é conferido nos bytes: res.text() o descarta ao decodificar.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    const linhas = csv.trim().split("\n");
    expect(linhas[0]).toBe("quando;nome;whatsapp;email;formulario;pagina;idioma;situacao");
    expect(linhas.length - 1).toBe((await repo.listarLeadsPorOrigem("site")).total);
    expect(csv).toContain("Maria Exemplo");
    expect(csv).toContain("Página Fale Conosco;/fale-conosco/");
    expect(csv).not.toContain("Não Entra Na Planilha");
  });

  it("nome que começa como fórmula não é executado pelo Excel", () => {
    expect(celulaCsv("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(celulaCsv("+5511999990000")).toBe("'+5511999990000");
    expect(celulaCsv("Ana; Silva")).toBe("\"Ana; Silva\"");
    expect(celulaCsv(null)).toBe("");
  });
});
