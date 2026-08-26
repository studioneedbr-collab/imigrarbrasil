import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { executeTool } from "@/lib/agent/tools";
import { getRepository } from "@/lib/data";

// O bug: `status: 'transferred'` significava ao mesmo tempo "a Ana encaminhou
// pro setor" e "um atendente assumiu". Como a Ana encaminha sozinha, TODA
// conversa encaminhada aparecia no painel como "Você assumiu esta conversa" — e o
// webhook a calava, deixando a pessoa falando sozinha. Quem assumiu agora é
// `assumedBy`, e só ele.
describe("assumir conversa", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("assume UMA conversa por vez, sem encostar nas outras", async () => {
    const a = await repo.getOrCreateConversation("sim:a", "Ana");
    const b = await repo.getOrCreateConversation("sim:b", "Bruno");
    const c = await repo.getOrCreateConversation("sim:c", "Carla");

    await repo.assumeConversation(b.id, "atendente@imigrarbrasil.com.br");

    expect((await repo.getConversation(a.id))!.assumedBy).toBeFalsy();
    expect((await repo.getConversation(b.id))!.assumedBy).toBe("atendente@imigrarbrasil.com.br");
    expect((await repo.getConversation(c.id))!.assumedBy).toBeFalsy();
  });

  it("devolver pra IA limpa quem assumiu e reabre a conversa", async () => {
    const c = await repo.getOrCreateConversation("sim:d", "Diego");
    await repo.assumeConversation(c.id, "atendente@imigrarbrasil.com.br");
    await repo.releaseConversation(c.id);

    const depois = (await repo.getConversation(c.id))!;
    expect(depois.assumedBy).toBeNull();
    expect(depois.status).toBe("active");
  });

  it("encaminhar pro setor NÃO assume a conversa — a Ana continua atendendo", async () => {
    // executeTool usa o repositório singleton da aplicação, não a instância local.
    const app = getRepository();
    const c = await app.getOrCreateConversation("sim:encaminhar", "Elis");
    await executeTool("transferir_para_humano", {
      conversation_id: c.id,
      reason: "Situação irregular com prazo correndo.",
      summary: "Visto vencido há três meses; pediu ajuda para regularizar.",
      setor: "comercial",
    });

    const depois = (await app.getConversation(c.id))!;
    expect(depois.status).toBe("transferred");
    expect(depois.handedOffTo).toBeTruthy(); // o setor fica registrado
    expect(depois.assumedBy).toBeFalsy(); // mas ninguém pegou a conversa
  });
});

// O anexo chegava e a URL era descartada: sobrava só o texto "📎 Documento
// recebido: imagem.jpg" e não havia nada para visualizar no painel.
describe("documentos recebidos", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("guarda a mídia e o conteúdo lido junto da mensagem", async () => {
    const c = await repo.getOrCreateConversation("sim:f", "Fábio");
    await repo.addMessage(c.id, "user", "📎 Arquivo recebido: ponto.jpg", "wam1", {
      url: "https://midia.z-api.io/ponto.jpg",
      kind: "image",
      name: "ponto.jpg",
      text: "Registro de ponto de Ronaldo, volta do almoço.",
    });

    const [m] = await repo.listMessages(c.id);
    expect(m.mediaUrl).toBe("https://midia.z-api.io/ponto.jpg");
    expect(m.mediaType).toBe("image");
    expect(m.mediaText).toContain("Ronaldo");
  });

  it("lista os documentos de uma conversa e ignora as mensagens sem anexo", async () => {
    const c = await repo.getOrCreateConversation("sim:g", "Gabi");
    await repo.addMessage(c.id, "user", "bom dia");
    await repo.addMessage(c.id, "user", "📎 Arquivo recebido: cv.pdf", "wam2", {
      url: "https://midia.z-api.io/cv.pdf",
      kind: "document",
      name: "cv.pdf",
    });

    const docs = await repo.listDocuments({ conversationId: c.id });
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("cv.pdf");
    expect(docs[0].contactName).toBe("Gabi");
  });

  it("a lista global não mistura documentos de outra conversa quando filtrada", async () => {
    const c1 = await repo.getOrCreateConversation("sim:h", "Hugo");
    const c2 = await repo.getOrCreateConversation("sim:i", "Iara");
    await repo.addMessage(c1.id, "user", "📎 a.jpg", "w1", { url: "https://x/a.jpg", kind: "image", name: "a.jpg" });
    await repo.addMessage(c2.id, "user", "📎 b.jpg", "w2", { url: "https://x/b.jpg", kind: "image", name: "b.jpg" });

    expect(await repo.listDocuments({})).toHaveLength(2);
    expect(await repo.listDocuments({ conversationId: c1.id })).toHaveLength(1);
  });
});
