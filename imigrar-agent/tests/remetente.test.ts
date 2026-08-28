import { describe, it, expect } from "vitest";
import {
  classificarNumero,
  eConversaDeGrupo,
  ehConversaIndividual,
  origemDaMensagem,
} from "@/lib/whatsapp/remetente";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import { rotuloContato, AINDA_NAO } from "@/lib/domain/rotulos";
import { montarKanban } from "@/lib/fila/kanban";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

describe("origem do remetente", () => {
  it("mensagem de grupo não é conversa individual", () => {
    expect(ehConversaIndividual({ phone: "120363430014526326-1614879000@g.us" })).toBe(false);
    expect(ehConversaIndividual({ phone: "553399402577", isGroup: true })).toBe(false);
    expect(ehConversaIndividual({ phone: "553399402577", participantPhone: "5511999999999" })).toBe(false);
  });

  it("o JID de grupo se denuncia mesmo sem o sufixo @g.us", () => {
    // Foi assim que ele apareceu no quadro: só os dígitos, 18 deles.
    expect(classificarNumero("120363430014526326")).toBe("grupo");
  });

  it("transmissão, status e canal também ficam de fora", () => {
    expect(ehConversaIndividual({ phone: "status@broadcast" })).toBe(false);
    expect(ehConversaIndividual({ phone: "5511999999999@broadcast" })).toBe(false);
    expect(ehConversaIndividual({ phone: "123@newsletter" })).toBe(false);
    expect(ehConversaIndividual({ phone: "5511999999999", isNewsletter: true })).toBe(false);
    expect(ehConversaIndividual({ phone: "5511999999999", broadcast: true })).toBe(false);
  });

  it("conversa individual passa — inclusive fora do Brasil e no simulador", () => {
    expect(ehConversaIndividual({ phone: "553399402577" })).toBe(true);
    expect(ehConversaIndividual({ phone: "+55 33 99940-2577" })).toBe(true);
    expect(ehConversaIndividual({ phone: "50937123456" })).toBe(true);
    expect(ehConversaIndividual({ phone: "sim:v2-5" })).toBe(true);
  });

  it("sem número não é individual — na dúvida o webhook não responde", () => {
    expect(ehConversaIndividual({})).toBe(false);
    expect(origemDaMensagem({ phone: "" })).toBe("desconhecida");
  });

  it("esconder card é régua mais frouxa que responder: número estranho não vira grupo", () => {
    expect(eConversaDeGrupo("12345")).toBe(false);
    expect(eConversaDeGrupo("120363430014526326")).toBe(true);
  });
});

describe("o telefone no lugar do nome", () => {
  it("celular brasileiro sai legível", () => {
    // 13 dígitos: DDI + DDD + o nono. 12 dígitos é o mesmo número sem ele — e o card
    // continua tendo de mostrar os dois de um jeito discável.
    expect(formatarTelefone("5533999402577")).toBe("+55 33 99940-2577");
    expect(formatarTelefone("553399402577")).toBe("+55 33 9940-2577");
  });

  it("fora do Brasil não inventa máscara", () => {
    expect(formatarTelefone("50937123456")).toBe("+50937123456");
  });

  it("o card mostra o telefone formatado e marca que o nome não se sabe", () => {
    const r = rotuloContato({ whatsappNumber: "553399402577" });
    expect(r.texto).toBe("+55 33 9940-2577");
    expect(r.conhecido).toBe(false);
  });

  it("JID de grupo nunca ocupa o lugar do nome", () => {
    expect(rotuloContato({ whatsappNumber: "120363430014526326" }).texto).toBe(AINDA_NAO);
  });
});

describe("o lead de grupo que já está no banco", () => {
  const base = {
    conversationId: "c1",
    status: "new",
    stage: "novo",
    score: 0,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  } as unknown as LeadDaFila;

  it("não aparece no quadro", () => {
    const leads = [
      { ...base, id: "gente", whatsappNumber: "553399402577" },
      { ...base, id: "grupo", whatsappNumber: "120363430014526326-1614879000@g.us" },
    ];
    const ids = montarKanban(leads).flatMap((c) => c.leads.map((l) => l.id));
    expect(ids).toContain("gente");
    expect(ids).not.toContain("grupo");
  });
});
