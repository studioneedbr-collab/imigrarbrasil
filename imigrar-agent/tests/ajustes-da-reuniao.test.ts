import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// OS AJUSTES DA REUNIÃO: a agente para ou continua ao transferir, o responsável à vista, o
// sino que diz para quem foi, e a edição de contas. Nas rotas de verdade.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));
vi.mock("@/lib/whatsapp/config", async (orig) => ({ ...(await orig<object>()), getZapiConnected: async () => true }));

import { POST as encaminhar, GET as opcoes } from "@/app/api/conversations/[id]/encaminhar/route";
import { POST as atendimento } from "@/app/api/leads/[id]/atendimento/route";
import { GET as detalhe } from "@/app/api/conversations/[id]/route";
import { GET as lista } from "@/app/api/conversations/route";
import { GET as inbox } from "@/app/api/inbox/route";
import { GET as topbar } from "@/app/api/topbar/route";
import { PATCH as editar } from "@/app/api/users/[id]/route";
import { getRepository } from "@/lib/data";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { esquecerConta } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { rotuloDoTicket } from "@/lib/crm/agente-na-transferencia";
import { MARCA_DE_PENDENTE, conteudoPendente, esperarAnexos } from "@/lib/whatsapp/anexo-pendente";
import { falaDaPessoa } from "@/lib/agent/idioma";
import type { User } from "@/lib/domain/types";

const repo = getRepository();
let n = 0;
const pessoa = (nome: string, role: User["role"] = "atendente") =>
  repo.createUser({ email: `reuniao${++n}@exemplo.com`, passwordHash: "x", name: nome, role });
const entrar = async (u: User) =>
  void pote.set(SESSION_COOKIE, await createSession({ sub: u.id, email: u.email, role: u.role === "user" ? "atendente" : u.role }));
const conversa = () => repo.getOrCreateConversation(`55112222${String(++n).padStart(5, "0")}`, "Cliente Exemplo");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corpo: unknown, metodo = "POST") =>
  new NextRequest("http://painel.local/x", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

beforeEach(() => {
  pote.clear();
  esquecerConta();
});

describe("a agente para ou continua", () => {
  it("sem escolha, para — como sempre foi", async () => {
    const [eu, sergio] = [await pessoa("Eu"), await pessoa("Sérgio Reis")];
    await entrar(eu);
    const c = await conversa();
    await encaminhar(req({ acao: "transferir", usuarioId: sergio.id }), ctx(c.id));
    expect(await repo.getConversation(c.id)).toMatchObject({ assumedBy: sergio.email, status: "transferred" });
  });

  it("continua: a pessoa vira responsável e ninguém assume a conversa", async () => {
    const [eu, sergio] = [await pessoa("Eu"), await pessoa("Sérgio Reis")];
    await entrar(eu);
    const c = await conversa();
    const r = await encaminhar(req({ acao: "transferir", usuarioId: sergio.id, agente: "continua" }), ctx(c.id));
    expect((await r.json()).mensagem).toContain("continua respondendo");
    const depois = await repo.getConversation(c.id);
    expect(depois?.assumedBy ?? null).toBeNull();
    expect(depois?.status).not.toBe("transferred");
    expect((await repo.getLeadByConversation(c.id))?.responsavelId).toBe(sergio.id);
  });

  it("continua numa conversa em que ela estava calada: ela volta", async () => {
    const [eu, walter] = [await pessoa("Eu"), await pessoa("Walter")];
    await entrar(eu);
    const c = await conversa();
    await repo.assumeConversation(c.id, eu.email);
    expect((await (await opcoes(req({}), ctx(c.id))).json()).agenteCalada).toBe(true);
    await encaminhar(req({ acao: "transferir", usuarioId: walter.id, agente: "continua" }), ctx(c.id));
    expect(await repo.getConversation(c.id)).toMatchObject({ assumedBy: null, status: "active" });
  });

  it("mesmo dono, trocando só o que a agente faz, é mudança de verdade", async () => {
    const [eu, sergio] = [await pessoa("Eu"), await pessoa("Sérgio Reis")];
    await entrar(eu);
    const c = await conversa();
    await encaminhar(req({ acao: "transferir", usuarioId: sergio.id }), ctx(c.id));
    await encaminhar(req({ acao: "transferir", usuarioId: sergio.id, agente: "continua" }), ctx(c.id));
    expect((await repo.getConversation(c.id))?.assumedBy).toBeNull();
    await encaminhar(req({ acao: "transferir", usuarioId: sergio.id, agente: "para" }), ctx(c.id));
    expect((await repo.getConversation(c.id))?.assumedBy).toBe(sergio.email);
  });

  it("vale no card do CRM e no envio ao CRM", async () => {
    const [eu, sergio] = [await pessoa("Eu"), await pessoa("Sérgio Reis")];
    await entrar(eu);
    const c = await conversa();
    const lead = await repo.upsertLead(c.id, {});
    expect((await atendimento(req({ acao: "responsaveis", responsavelId: sergio.id, agente: "continua" }), ctx(lead.id))).status).toBe(200);
    expect((await repo.getConversation(c.id))?.assumedBy ?? null).toBeNull();

    const funil = await repo.criarFunil({ nome: `Comercial ${++n}` });
    await repo.criarEtapa({ funilId: funil.id, nome: "Negociando", status: "em_atendimento", ordem: 0 });
    const c2 = await conversa();
    const r = await encaminhar(req({ acao: "crm", funilId: funil.id, responsavelId: sergio.id, agente: "continua" }), ctx(c2.id));
    expect(r.status).toBe(200);
    expect((await repo.getConversation(c2.id))?.assumedBy ?? null).toBeNull();
  });
});

describe("quem atende, à vista", () => {
  it("aparece dentro da conversa, no chat flutuante e no sino", async () => {
    const [eu, sergio] = [await pessoa("Eu"), await pessoa("Sérgio Reis")];
    await entrar(eu);
    const c = await conversa();
    await encaminhar(req({ acao: "transferir", usuarioId: sergio.id }), ctx(c.id));
    expect((await (await detalhe(req({}), ctx(c.id))).json()).responsavelNome).toBe("Sérgio Reis");
    const item = (await (await inbox()).json()).items.find((i: { id: string }) => i.id === c.id);
    expect(item.comQuem).toBe("Sérgio Reis");
    const t = (await (await topbar()).json()).transfers.find((x: { conversationId: string }) => x.conversationId === c.id);
    expect(t.rotulo).toBe("Transferida para Sérgio Reis");
  });

  it("transferir para si mesmo não toca o sino", async () => {
    const eu = await pessoa("Eu");
    await entrar(eu);
    const c = await conversa();
    await encaminhar(req({ acao: "transferir", usuarioId: eu.id }), ctx(c.id));
    expect(await repo.listTransferTicketsByConversation(c.id)).toHaveLength(0);
  });

  it("o sino lê os tickets antigos e os da agente", () => {
    expect(rotuloDoTicket({ reason: "manual:Jurídico", dossie: { necessidade: "Transferência manual para Walter Gama (Jurídico)." } }, null)).toBe("Transferida para Walter Gama");
    expect(rotuloDoTicket({ reason: "manual:Jurídico", dossie: {} }, null)).toBe("Transferida para Jurídico");
    expect(rotuloDoTicket({ reason: "prazo correndo", dossie: {} }, null)).toBe("Aguardando alguém assumir");
    expect(rotuloDoTicket({ reason: "prazo correndo", dossie: {} }, "Sérgio Reis")).toBe("Com Sérgio Reis");
  });

  it("sem sessão, ou com a conta desativada, não lê conversa nenhuma", async () => {
    const c = await conversa();
    expect((await detalhe(req({}), ctx(c.id))).status).toBe(401);
    expect((await lista(new Request("http://painel.local/api/conversations"))).status).toBe(401);
    const u = await pessoa("Saiu do time");
    await entrar(u);
    await repo.updateUser(u.id, { active: false });
    esquecerConta();
    expect((await detalhe(req({}), ctx(c.id))).status).toBe(401);
  });
});

describe("editar conta", () => {
  it("só administrador; desativa, reativa, troca papel e senha", async () => {
    const [admin, alvo] = [await pessoa("Admin", "admin"), await pessoa("Alvo")];
    await entrar(alvo);
    expect((await editar(req({ active: false }, "PATCH"), ctx(admin.id))).status).toBe(403);

    await entrar(admin);
    expect((await editar(req({ active: false }, "PATCH"), ctx(alvo.id))).status).toBe(200);
    expect((await repo.getUserByEmail(alvo.email))?.active).toBe(false);
    const c = await conversa();
    const time = (await (await opcoes(req({}), ctx(c.id))).json()).pessoas as { id: string }[];
    expect(time.some((p) => p.id === alvo.id)).toBe(false);

    await editar(req({ active: true, role: "advogado", password: "senha-bem-comprida" }, "PATCH"), ctx(alvo.id));
    const depois = (await repo.getUserByEmail(alvo.email))!;
    expect(depois).toMatchObject({ active: true, role: "advogado" });
    expect(verifyPassword("senha-bem-comprida", depois.passwordHash)).toBe(true);
    expect((await editar(req({ password: "curta" }, "PATCH"), ctx(alvo.id))).status).toBe(400);
    expect((await editar(req({ dono: true }, "PATCH"), ctx(alvo.id))).status).toBe(400);
    expect((await editar(req({ active: false }, "PATCH"), ctx("nao-existe"))).status).toBe(404);
  });

  it("a conta dona, o próprio acesso e o último administrador são protegidos", async () => {
    const todos = await repo.listUsers();
    const dona = todos.find((u) => u.dono)!;
    const outro = await pessoa("Outro admin", "admin");
    await entrar(outro);
    expect((await editar(req({ active: false }, "PATCH"), ctx(dona.id))).status).toBe(409);
    expect((await editar(req({ role: "atendente" }, "PATCH"), ctx(outro.id))).status).toBe(409);
    expect((await repo.getUserByEmail(outro.email))?.role).toBe("admin");
  });
});

describe("arquivo ainda sendo lido", () => {
  it("quem responde espera a leitura; o conteúdo entra na mesma mensagem", async () => {
    const c = await conversa();
    const m = await repo.addMessage(c.id, "user", conteudoPendente("passaporte.jpg", "meu passaporte"), "midia-1");
    await repo.addMessage(c.id, "user", "é o meu passaporte", "texto-1");
    expect(falaDaPessoa(m.content)).toBe("meu passaporte");
    setTimeout(() => void repo.updateMessageContent(m.id, "📎 Arquivo recebido: passaporte.jpg\n[Conteúdo lido do arquivo]\nPassaporte", "Passaporte"), 60);
    const t0 = Date.now();
    await esperarAnexos(repo, c.id, { limiteMs: 2000, intervaloMs: 20 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    const msgs = await repo.listMessages(c.id);
    expect(msgs[0].content).toContain("Conteúdo lido");
    expect(msgs[0].content).not.toContain(MARCA_DE_PENDENTE);
    expect(msgs.map((x) => x.whatsappMessageId)).toEqual(["midia-1", "texto-1"]);
  });

  it("não espera para sempre, nem por leitura que morreu", async () => {
    const c = await conversa();
    const m = await repo.addMessage(c.id, "user", conteudoPendente("audio.ogg"), "midia-2");
    const t0 = Date.now();
    await esperarAnexos(repo, c.id, { limiteMs: 80, intervaloMs: 20 });
    expect(Date.now() - t0).toBeLessThan(1000);
    m.createdAt = new Date(Date.now() - 60_000).toISOString();
    const t1 = Date.now();
    await esperarAnexos(repo, c.id, { limiteMs: 3000, intervaloMs: 20 });
    expect(Date.now() - t1).toBeLessThan(200);
  });
});
