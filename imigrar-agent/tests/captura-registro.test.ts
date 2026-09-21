// O QUE O WORDPRESS EMPURRA QUANDO UM REGISTRO É SALVO LÁ.
//
// O site guarda leads em tipos de conteúdo próprios ("Orçamentos" e o que criarem depois),
// que não aparecem na REST pública — então não há como buscá-los de fora, e o sentido se
// inverte: o WordPress empurra.
//
// O corpo traz os campos CRUS, com os nomes que o ACF usa lá. Quem interpreta é esta rota,
// com as mesmas pistas da importação de planilha. É o ponto do desenho: um campo novo no
// site passa a ser entendido sem tocar no PHP, e não existem duas listas para divergir.
//
// O teste que decide se isto presta é o de reenviar: salvar o mesmo registro dez vezes no
// WordPress tem que dar UM card.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { POST } from "@/app/api/captura/registro/route";

const repo = getRepository();
const segredoDeVerdade = env.siteCaptureToken;

function req(body: Record<string, unknown>, token: string | undefined = segredoDeVerdade) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-imigrar-token"] = token;
  return new NextRequest(new URL("https://painel.local/api/captura/registro"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Um "Orçamento" como o WordPress manda: o dicionário cru, com os nomes do ACF. */
function orcamento(id: string, campos: Record<string, unknown>) {
  return { fonte: "wordpress:orcamento", idExterno: id, campos };
}

const comSegredo = (v: string) => {
  (env as { siteCaptureToken: string }).siteCaptureToken = v;
};
beforeEach(() => comSegredo(segredoDeVerdade));
afterEach(() => comSegredo(segredoDeVerdade));

const acharLead = async (telefone: string) =>
  (await repo.listLeads()).filter((l) => l.whatsappNumber.includes(telefone.slice(-8)));

describe("autenticação", () => {
  it("sem segredo configurado recusa com 503 — instalação pela metade não é ataque", async () => {
    comSegredo("");
    const res = await POST(req(orcamento("1", { nome: "X", whatsapp: "5511900000001" })));
    expect(res.status).toBe(503);
  });

  it("token errado é 401", async () => {
    const res = await POST(req(orcamento("2", { nome: "X", whatsapp: "5511900000002" }), "chute"));
    expect(res.status).toBe(401);
  });
});

describe("os campos crus são interpretados aqui", () => {
  it("entende os nomes do ACF sem ninguém configurar nada", async () => {
    await POST(
      req(
        orcamento("10", {
          "Título": "Orçamento — Yolanda",
          nome_completo: "Yolanda Pérez",
          whatsapp: "(95) 99123-4567",
          email: "yolanda@exemplo.com",
          nacionalidade: "Venezuela",
        }),
      ),
    );
    const [lead] = await acharLead("99123456");
    expect(lead.contactName).toBe("Yolanda Pérez");
    expect(lead.email).toBe("yolanda@exemplo.com");
    expect(lead.nacionalidade).toBe("Venezuela");
  });

  it("um campo que o CRM não conhece não derruba nada", async () => {
    const res = await POST(
      req(
        orcamento("11", {
          nome: "Campo Estranho",
          whatsapp: "5511900000011",
          campo_inventado_pelo_acf: "qualquer coisa",
          outro_ainda: 42,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).desfecho).toBe("criado");
  });

  it("o caso entra pela primeira etapa e marcado como vindo do site", async () => {
    await POST(req(orcamento("12", { nome: "Novo", whatsapp: "5511900000012" })));
    const [lead] = await acharLead("00000012");
    expect(lead.atendimentoStatus).toBe("novo");
    expect(lead.origem).toBe("site");
  });
});

// ── O REQUISITO ───────────────────────────────────────────────────────────────────
describe("salvar o mesmo registro de novo não duplica", () => {
  it("reenviar o mesmo id dá um card só", async () => {
    const corpo = orcamento("20", { nome: "Repetida", whatsapp: "5511900000020" });
    await POST(req(corpo));
    await POST(req(corpo));
    const res = await POST(req(corpo));
    expect((await res.json()).desfecho).not.toBe("criado");
    expect(await acharLead("00000020")).toHaveLength(1);
  });

  // O par (fonte, id) é mais forte que o telefone de propósito: a pessoa troca de número,
  // e alguém corrige um DDD errado na ficha. O registro continua sendo o mesmo registro.
  it("continua sendo o mesmo caso mesmo quando o telefone muda no WordPress", async () => {
    await POST(req(orcamento("21", { nome: "Trocou", whatsapp: "5511900000021" })));
    const antes = await repo.listLeads();
    await POST(req(orcamento("21", { nome: "Trocou", whatsapp: "5511988880021" })));
    const depois = await repo.listLeads();
    expect(depois.length).toBe(antes.length);
  });

  // A outra ponta: quem já conversa pelo WhatsApp e vira orçamento no site é UMA pessoa.
  it("junta com a conversa de WhatsApp da mesma pessoa", async () => {
    const conv = await repo.getOrCreateConversation("5511900000022", "Do WhatsApp");
    await repo.upsertLead(conv.id, { contactName: "Do WhatsApp" });
    await POST(req(orcamento("22", { nome: "Do WhatsApp", whatsapp: "5511900000022" })));
    expect(await acharLead("00000022")).toHaveLength(1);
  });
});

// ── O QUE CHEGA DE FORA NÃO MANDA NO TRABALHO DE QUEM ATENDE ──────────────────────
describe("atualizar preenche buraco, não reescreve", () => {
  it("não puxa de volta para Novo um caso que o time já avançou", async () => {
    const conv = await repo.getOrCreateConversation("5511900000030", "Avançada");
    await repo.upsertLead(conv.id, {
      contactName: "Avançada",
      atendimentoStatus: "proposta_enviada",
      origemExternaFonte: "wordpress:orcamento",
      origemExternaId: "30",
    });
    await POST(req(orcamento("30", { nome: "Avançada", whatsapp: "5511900000030" })));
    const [lead] = await acharLead("00000030");
    expect(lead.atendimentoStatus).toBe("proposta_enviada");
  });

  it("não apaga o que uma pessoa escreveu na ficha", async () => {
    const conv = await repo.getOrCreateConversation("5511900000031", "Com nota");
    await repo.upsertLead(conv.id, {
      contactName: "Nome escrito por alguém",
      origemExternaFonte: "wordpress:orcamento",
      origemExternaId: "31",
    });
    await POST(req(orcamento("31", { nome: "Nome do WordPress", whatsapp: "5511900000031" })));
    const [lead] = await acharLead("00000031");
    expect(lead.contactName).toBe("Nome escrito por alguém");
  });
});

// Um rascunho vazio no WordPress dispara o mesmo gancho. Responder erro faria o log do
// site encher de falha a cada salvamento — e log que sempre tem erro é log que ninguém lê.
describe("registro que ainda não é um lead", () => {
  it("sem telefone responde 200 e diz por que ignorou", async () => {
    const res = await POST(req(orcamento("40", { "Título": "Rascunho sem nada" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.desfecho).toBe("ignorado");
    expect(json.detalhe).toMatch(/telefone/i);
  });

  it("e não cria card nenhum", async () => {
    const antes = (await repo.listLeads()).length;
    await POST(req(orcamento("41", { "Título": "Outro rascunho" })));
    expect((await repo.listLeads()).length).toBe(antes);
  });
});
