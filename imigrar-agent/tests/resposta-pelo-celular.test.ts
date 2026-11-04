import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/whatsapp/send", () => ({
  sendMessage: vi.fn(async () => {}),
  sendButtons: vi.fn(async () => {}),
  sendDocument: vi.fn(async () => {}),
}));

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { POST } from "@/app/api/webhook/whatsapp/route";

// O WhatsApp do escritório também é usado no celular. A resposta digitada lá chegava como
// "minha" e era descartada — e na mensagem seguinte do cliente a agente respondia por
// cima do atendente.

const repo = getRepository();

function req(body: Record<string, unknown>) {
  return new NextRequest(`https://painel.local/api/webhook/whatsapp?token=${env.webhookVerifyToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fone = () => `55119${Math.floor(10000000 + Math.random() * 89999999)}`;

describe("resposta digitada no celular do escritório", () => {
  it("assume a conversa e entra no histórico", async () => {
    const phone = fone();
    const res = await POST(req({ phone, fromMe: true, fromApi: false, text: { message: "Oi, aqui é o Walter, vou te ajudar." } }));
    expect(res.status).toBe(200);
    const conv = await repo.getOrCreateConversation(phone);
    expect(conv.assumedBy).toBe("celular do escritório");
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.at(-1)?.content).toMatch(/aqui é o Walter/);
  });

  it("o que a própria agente mandou pela API não assume nada", async () => {
    const phone = fone();
    await POST(req({ phone, fromMe: true, fromApi: true, text: { message: "Olá! Aqui é a Cláudia." } }));
    const conv = await repo.getOrCreateConversation(phone);
    expect(conv.assumedBy ?? null).toBeNull();
  });

  it("sem o campo fromApi, nada muda", async () => {
    const phone = fone();
    await POST(req({ phone, fromMe: true, text: { message: "qualquer coisa" } }));
    const conv = await repo.getOrCreateConversation(phone);
    expect(conv.assumedBy ?? null).toBeNull();
  });

  it("a saudação automática do WhatsApp Business, segundos depois do cliente, não assume", async () => {
    const phone = fone();
    const conv = await repo.getOrCreateConversation(phone);
    await repo.addMessage(conv.id, "user", "oi, preciso de ajuda com visto");
    await POST(req({ phone, fromMe: true, fromApi: false, text: { message: "A Imigrar Brasil agradece seu contato." } }));
    const depois = await repo.getConversation(conv.id);
    expect(depois?.assumedBy ?? null).toBeNull();
  });
});
