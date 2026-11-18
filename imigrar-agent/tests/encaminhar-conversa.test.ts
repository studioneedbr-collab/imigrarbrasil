import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// OS DOIS BOTÕES DA LISTA DE CONVERSAS: transferir para alguém do time e mandar o
// contato para um funil do CRM — na rota de verdade, com o repositório em memória.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

import { GET, POST } from "@/app/api/conversations/[id]/encaminhar/route";
import { getRepository } from "@/lib/data";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { User } from "@/lib/domain/types";

const repo = getRepository();
let n = 0;

async function pessoa(nome: string, role: User["role"] = "atendente") {
  return repo.createUser({ email: `enc${++n}@exemplo.com`, passwordHash: "x", name: nome, role });
}
async function entrar(u: { id: string; email: string }, role: "admin" | "atendente" = "atendente") {
  pote.set(SESSION_COOKIE, await createSession({ sub: u.id, email: u.email, role }));
}
async function conversa(numero = `55119${String(++n).padStart(8, "0")}`) {
  return repo.getOrCreateConversation(numero, "Fulano de Teste");
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (id: string, corpo: unknown) =>
  POST(
    new NextRequest(`http://painel.local/api/conversations/${id}/encaminhar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    ctx(id),
  );

describe("transferir a conversa para alguém do time", () => {
  beforeEach(() => pote.clear());

  it("sem sessão é 401", async () => {
    const c = await conversa();
    expect((await pedir(c.id, { acao: "transferir", usuarioId: "x" })).status).toBe(401);
  });

  it("um atendente transfere: o lead nasce com dono, e a agente se cala para quem recebeu", async () => {
    const eu = await pessoa("Cássio");
    const sergio = await pessoa("Sérgio Reis");
    await entrar(eu);
    const c = await conversa();
    expect(await repo.getLeadByConversation(c.id)).toBeNull();

    const res = await pedir(c.id, { acao: "transferir", usuarioId: sergio.id });
    expect(res.status).toBe(200);
    expect((await res.json()).mensagem).toContain("Sérgio Reis");

    const lead = await repo.getLeadByConversation(c.id);
    expect(lead).toMatchObject({ responsavelId: sergio.id, atendimentoStatus: "em_atendimento" });
    const depois = await repo.getConversation(c.id);
    expect(depois).toMatchObject({ assumedBy: sergio.email, status: "transferred", handedOffTo: "Sérgio Reis" });
  });

  it("transferir de novo troca o dono sem reiniciar o relógio do primeiro atendimento", async () => {
    const eu = await pessoa("Cássio");
    const walter = await pessoa("Walter");
    await entrar(eu);
    const c = await conversa();
    await pedir(c.id, { acao: "transferir", usuarioId: eu.id });
    const primeiro = (await repo.getLeadByConversation(c.id))!.assumidoEm;
    await pedir(c.id, { acao: "transferir", usuarioId: walter.id });
    const lead = (await repo.getLeadByConversation(c.id))!;
    expect(lead.responsavelId).toBe(walter.id);
    expect(lead.assumidoEm).toBe(primeiro);
  });

  it("recusa pessoa que não existe e conversa que não existe", async () => {
    await entrar(await pessoa("Cássio"));
    const c = await conversa();
    expect((await pedir(c.id, { acao: "transferir", usuarioId: "ninguem" })).status).toBe(400);
    expect((await pedir("conversa-fantasma", { acao: "transferir", usuarioId: "x" })).status).toBe(404);
  });

  it("o seletor recebe só id e nome, com quem está logado primeiro — sem e-mail de ninguém", async () => {
    const eu = await pessoa("Zuleica");
    await pessoa("Ana");
    await entrar(eu);
    const c = await conversa();
    const d = await (await GET(new NextRequest("http://painel.local/x"), ctx(c.id))).json();
    expect(d.pessoas[0]).toEqual({ id: eu.id, nome: "Zuleica", eu: true });
    expect(JSON.stringify(d.pessoas)).not.toContain("@");
  });
});

describe("criar o lead e mandar para um funil do CRM", () => {
  beforeEach(async () => {
    pote.clear();
    await entrar(await pessoa("Cássio"));
  });

  async function funilComercial() {
    const funil = await repo.criarFunil({ nome: `Gestão Comercial ${++n}` });
    const nova = await repo.criarEtapa({ funilId: funil.id, nome: "Entrada", status: "novo", ordem: 0 });
    await repo.criarEtapa({ funilId: funil.id, nome: "Negociando", status: "em_atendimento", ordem: 1 });
    return { funil, nova };
  }

  it("conversa sem lead: cria o lead e o coloca na primeira etapa do funil", async () => {
    const { funil, nova } = await funilComercial();
    const c = await conversa();
    const res = await pedir(c.id, { acao: "crm", funilId: funil.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ criado: true });
    expect(await repo.getLeadByConversation(c.id)).toMatchObject({
      funilId: funil.id,
      etapaId: nova.id,
      contactName: "Fulano de Teste",
      atendimentoStatus: "novo",
    });
  });

  it("lead que já está em atendimento entra na etapa que descreve isso, sem voltar para 'novo'", async () => {
    const { funil } = await funilComercial();
    const c = await conversa();
    const lead = await repo.upsertLead(c.id, {});
    await repo.updateLead(lead.id, { atendimentoStatus: "em_atendimento" });
    await pedir(c.id, { acao: "crm", funilId: funil.id });
    const depois = (await repo.getLeadByConversation(c.id))!;
    const etapas = await repo.listEtapas(funil.id);
    expect(etapas.find((e) => e.id === depois.etapaId)?.status).toBe("em_atendimento");
    expect(depois.atendimentoStatus).toBe("em_atendimento");
  });

  it("caso encerrado não é reaberto de carona: o funil sem etapa de encerrado recusa", async () => {
    const { funil } = await funilComercial();
    const c = await conversa();
    const lead = await repo.upsertLead(c.id, {});
    await repo.updateLead(lead.id, { atendimentoStatus: "fechado" });
    const res = await pedir(c.id, { acao: "crm", funilId: funil.id });
    expect(res.status).toBe(409);
    expect((await repo.getLeadByConversation(c.id))!.funilId ?? null).toBeNull();
  });

  it("contato filtrado não vira card invisível: recusa e manda resgatar", async () => {
    const { funil } = await funilComercial();
    const c = await conversa();
    await repo.upsertLead(c.id, { classificacao: "CURIOSO" });
    const res = await pedir(c.id, { acao: "crm", funilId: funil.id });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Filtradas");
  });

  it("ensaio e funil inexistente são recusados", async () => {
    const { funil } = await funilComercial();
    const ensaio = await repo.getOrCreateConversation("sim:teste-encaminhar", "Ensaio");
    expect((await pedir(ensaio.id, { acao: "crm", funilId: funil.id })).status).toBe(400);
    const c = await conversa();
    expect((await pedir(c.id, { acao: "crm", funilId: "nao-existe" })).status).toBe(400);
  });
});
