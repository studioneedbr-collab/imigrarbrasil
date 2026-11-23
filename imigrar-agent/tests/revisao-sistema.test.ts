import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// O QUE AS DUAS REVISÕES DO SISTEMA ACHARAM — cada caso aqui é um defeito confirmado, para
// não voltar.

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

import { getRepository } from "@/lib/data";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getSession, esquecerConta } from "@/lib/auth/guard";
import { falaDaPessoa, detectarIdioma } from "@/lib/agent/idioma";
import { mensagemDeEncaminhamento, mensagemDeDestravar } from "@/lib/agent/mensagens-fixas";
import { respondToConversation } from "@/lib/agent";
import type { User } from "@/lib/domain/types";

const repo = getRepository();

describe("sessão segue a conta", () => {
  beforeEach(() => {
    pote.clear();
    esquecerConta();
  });

  it("conta desativada perde o acesso; papel trocado vale na hora", async () => {
    const u = await repo.createUser({ email: "revisao-sessao@exemplo.com", passwordHash: "x", name: "Fulana", role: "advogado" });
    pote.set(SESSION_COOKIE, await createSession({ sub: u.id, email: u.email, role: "advogado" }));
    expect((await getSession())?.role).toBe("advogado");

    // O repositório em memória guarda o objeto; mudar a conta é mudar o que está lá.
    const conta = (await repo.getUserByEmail(u.email)) as User;
    conta.role = "atendente";
    esquecerConta();
    expect((await getSession())?.role).toBe("atendente");

    conta.active = false;
    esquecerConta();
    expect(await getSession()).toBeNull();
  });
});

describe("idioma lido só da fala da pessoa", () => {
  it("o texto que o sistema escreve em volta de um arquivo não conta", () => {
    expect(falaDaPessoa("📎 Arquivo recebido: protocolo.jpg\n[Conteúdo lido do arquivo]\nTipo: protocolo da Polícia Federal")).toBe("");
    expect(falaDaPessoa("📎 Arquivo recebido: p.jpg\nLegenda do cliente: voici mon passeport\n[Conteúdo lido do arquivo]\nx")).toBe("voici mon passeport");
    expect(falaDaPessoa("🎤 Mensagem de voz (transcrita):\nhola, necesito ayuda")).toBe("hola, necesito ayuda");
    expect(falaDaPessoa("oi")).toBe("oi");
  });

  it("acento não desliga mais o detector", () => {
    expect(detectarIdioma("você pode me ajudar agora")).toBe("pt");
  });
});

describe("mensagens fixas no idioma da conversa", () => {
  it("encaminhamento e destravar saem na língua dela", () => {
    expect(mensagemDeEncaminhamento({ setor: "comercial", idioma: "es" })).toMatch(/equipo jurídico/);
    expect(mensagemDeEncaminhamento({ setor: "comercial", idioma: "en", proximoRetorno: "na segunda" })).toMatch(/Monday to Friday/);
    expect(mensagemDeEncaminhamento({ setor: "comercial", idioma: "pt" })).toMatch(/time jurídico/);
    expect(mensagemDeDestravar({ idioma: "fr" })).toMatch(/Brésil/);
  });
});

describe("turno que ficou velho", () => {
  it("uma pessoa assumiu durante a geração: nada é gravado", async () => {
    const c = await repo.getOrCreateConversation("5511955550001", "Contato");
    await repo.addMessage(c.id, "user", "Olá, preciso de ajuda com meu visto");
    // Assume "durante" a geração: o aindaVale é chamado depois do modelo responder.
    const r = await respondToConversation(c.id, {
      aindaVale: async () => {
        return true;
      },
    });
    expect(r.descartada).toBeUndefined();

    await repo.addMessage(c.id, "user", "E quanto custa?");
    await repo.assumeConversation(c.id, "alguem@exemplo.com");
    const antes = (await repo.listMessages(c.id)).length;
    const r2 = await respondToConversation(c.id);
    expect(r2.descartada).toBe(true);
    expect((await repo.listMessages(c.id)).length).toBe(antes);
  });
});

describe("follow-up de 24h", () => {
  afterEach(() => vi.useRealTimers());

  it("conversa assumida por uma pessoa não entra na lista do follow-up", async () => {
    const c = await repo.getOrCreateConversation("5511955550002", "Contato");
    await repo.updateConversationStatus(c.id, "waiting");
    await repo.assumeConversation(c.id, "alguem@exemplo.com");
    await repo.updateConversationStatus(c.id, "waiting");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 26 * 3600_000);
    const lista = await repo.getConversationsForFollowup();
    expect(lista.some((x) => x.id === c.id)).toBe(false);
  });
});
