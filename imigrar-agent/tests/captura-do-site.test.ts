// A CAPTURA DE LEAD DO SITE.
//
// A segunda porta do sistema que responde sem sessão — e, como a primeira, ela cria caso
// na fila do escritório. Por isso os testes que importam aqui não são "o token certo
// funciona"; são os outros três:
//
//   · sem segredo configurado, a rota NÃO fica aberta;
//   · quem preencheu um formulário não vira fala de WhatsApp (senão o follow-up
//     automático entende que aquele número já conversou conosco e dispara para quem nunca
//     escreveu — ver lib/followup/varredura.ts);
//   · o mesmo telefone continua sendo a mesma pessoa, venha do site ou do WhatsApp.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { POST, OPTIONS } from "@/app/api/captura/site/route";

const repo = getRepository();
const segredoDeVerdade = env.siteCaptureToken;

function req(
  body: Record<string, unknown>,
  opts: { token?: string; origin?: string } = {},
) {
  const url = new URL("https://painel.local/api/captura/site");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== undefined) headers["x-imigrar-token"] = opts.token;
  if (opts.origin) headers["origin"] = opts.origin;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function comSegredo(valor: string) {
  (env as { siteCaptureToken: string }).siteCaptureToken = valor;
}

beforeEach(() => comSegredo(segredoDeVerdade));
afterEach(() => comSegredo(segredoDeVerdade));

describe("sem segredo configurado, a rota não atende", () => {
  beforeEach(() => comSegredo(""));

  it("recusa com 503 — instalação pela metade não é requisição forjada", async () => {
    const res = await POST(req({ nome: "Maria", telefone: "5511999990000" }));
    expect(res.status).toBe(503);
  });

  it("não cria lead nenhum", async () => {
    await POST(req({ nome: "Maria", telefone: "5511988887777" }));
    const conv = await repo.getConversation("nao-existe").catch(() => null);
    expect(conv).toBeFalsy();
  });
});

describe("autenticação", () => {
  it("recusa com 401 quem manda o token errado", async () => {
    const res = await POST(req({ nome: "Maria", telefone: "5511999990001" }, { token: "chute" }));
    expect(res.status).toBe(401);
  });

  it("recusa quem não manda token nenhum", async () => {
    expect((await POST(req({ nome: "Maria", telefone: "5511999990002" }))).status).toBe(401);
  });
});

describe("o que o formulário precisa trazer", () => {
  it("nome sozinho não basta — sem telefone nem e-mail não há como retornar", async () => {
    const res = await POST(req({ nome: "Maria" }, { token: segredoDeVerdade }));
    expect(res.status).toBe(400);
  });

  it("o campo-armadilha preenchido é robô: responde 200 e não cria nada", async () => {
    const res = await POST(
      req(
        { nome: "Robô", telefone: "5511970000001", website: "http://spam.example" },
        { token: segredoDeVerdade },
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).lead_id).toBeUndefined();
  });
});

describe("o lead cai na primeira etapa do funil", () => {
  it("cria o caso em Novo, com o nome e o que a pessoa escreveu", async () => {
    const res = await POST(
      req(
        {
          nome: "Yolanda Pérez",
          telefone: "+55 (95) 99123-4567",
          email: "yolanda@exemplo.com",
          mensagem: "sou venezuelana, moro em Boa Vista e recebi uma multa migratória",
          origem: "formulário do site",
        },
        { token: segredoDeVerdade },
      ),
    );
    expect(res.status).toBe(200);
    const { lead_id, novo } = await res.json();
    expect(novo).toBe(true);

    const lead = (await repo.listLeads()).find((l) => l.id === lead_id);
    expect(lead?.contactName).toBe("Yolanda Pérez");
    expect(lead?.email).toBe("yolanda@exemplo.com");
    expect(lead?.stage).toBe("novo");
    expect(lead?.atendimentoStatus).toBe("novo");
    expect(lead?.notes).toMatch(/formulário do site/);
    // A MESMA TRIAGEM DO WHATSAPP roda em cima do texto: a ficha do site chega ao time
    // preenchida, e não como um texto solto que alguém ainda vai ter que ler.
    expect(lead?.nacionalidade).toBe("Venezuela");
    expect(lead?.temPrazoCorrendo).toBe(true);
  });

  // A trava mais importante do arquivo. Ver o cabeçalho.
  it("NÃO grava a mensagem do formulário como fala de WhatsApp", async () => {
    const res = await POST(
      req(
        { nome: "Jean", telefone: "5511970000002", mensagem: "preciso de ajuda" },
        { token: segredoDeVerdade },
      ),
    );
    const { lead_id } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    const msgs = await repo.listMessages(lead.conversationId);
    expect(msgs.some((m) => m.role === "user")).toBe(false);
  });

  it("o mesmo telefone é a mesma pessoa — o site não abre um segundo card", async () => {
    const conv = await repo.getOrCreateConversation("5595991230000", "Já existia");
    const res = await POST(
      req({ nome: "Ana", telefone: "+55 95 99123-0000" }, { token: segredoDeVerdade }),
    );
    const { lead_id, novo } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    expect(lead.conversationId).toBe(conv.id);
    expect(novo).toBe(true);
  });

  /**
   * O DEFEITO QUE ANULARIA A CAPTAÇÃO INTEIRA.
   *
   * Quem preenche formulário em site brasileiro digita "(95) 99123-4567". O WhatsApp
   * sempre entrega com o DDI. Guardar sem ele faria o webhook não encontrar o caso no dia
   * em que a pessoa escrevesse — e abrir um card novo, com o lead da captação órfão ao
   * lado. Em TODO lead do site, no caminho que existe para juntar as duas pontas.
   */
  it("telefone brasileiro do formulário ganha o DDI", async () => {
    const res = await POST(
      req({ nome: "Sem DDI", telefone: "(95) 99123-4567" }, { token: segredoDeVerdade }),
    );
    const { lead_id } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    expect(lead.whatsappNumber).toBe("5595991234567");
  });

  it("e quem escreve depois pelo WhatsApp cai no MESMO caso", async () => {
    const res = await POST(
      req({ nome: "Volta pelo zap", telefone: "(11) 98888-7777" }, { token: segredoDeVerdade }),
    );
    const { lead_id } = await res.json();
    const doSite = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    // É assim que o número chega da Z-API.
    const conv = await repo.getOrCreateConversation("5511988887777");
    expect(conv.id).toBe(doSite.conversationId);
  });

  it("número estrangeiro com + não é tocado", async () => {
    const res = await POST(
      req({ nome: "De fora", telefone: "+243 840 629 031" }, { token: segredoDeVerdade }),
    );
    const { lead_id } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    expect(lead.whatsappNumber).toBe("243840629031");
  });

  // Quem já é um caso em andamento não volta para "Novo" porque preencheu um formulário.
  it("não rebaixa para Novo um caso que já está em andamento", async () => {
    const conv = await repo.getOrCreateConversation("5511970000003", "Em atendimento");
    await repo.upsertLead(conv.id, {
      contactName: "Em atendimento",
      stage: "qualificado",
      atendimentoStatus: "em_atendimento",
    });
    const res = await POST(
      req({ nome: "Em atendimento", telefone: "5511970000003" }, { token: segredoDeVerdade }),
    );
    const { novo } = await res.json();
    expect(novo).toBe(false);
    const lead = await repo.getLeadByConversation(conv.id);
    expect(lead?.atendimentoStatus).toBe("em_atendimento");
    expect(lead?.stage).toBe("qualificado");
  });

  it("sem telefone, o e-mail vira a chave — e não deduplica com WhatsApp nenhum", async () => {
    const res = await POST(
      req({ nome: "Só e-mail", email: "so@exemplo.com" }, { token: segredoDeVerdade }),
    );
    const { lead_id } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    expect(lead.whatsappNumber).toBe("site:so@exemplo.com");
  });
});

/**
 * DE ONDE O CASO VEIO.
 *
 * Sem esta coluna, cem casos importados de uma planilha entram no funil no mesmo dia e a
 * captação do mês passa a parecer dez vezes maior do que foi — sem ninguém ter mentido
 * em lugar nenhum. Ver a migration 031.
 */
describe("origem do lead", () => {
  it("quem chega pelo site fica marcado como site", async () => {
    const res = await POST(
      req({ nome: "Do site", telefone: "5511960000001" }, { token: segredoDeVerdade }),
    );
    const { lead_id } = await res.json();
    const lead = (await repo.listLeads()).find((l) => l.id === lead_id)!;
    expect(lead.origem).toBe("site");
  });

  // A porta padrão é o WhatsApp porque, até a captura existir, era a única que criava
  // lead. Deixar em branco trocaria um fato conhecido por um buraco.
  it("quem chega pelo WhatsApp fica marcado como whatsapp, sem ninguém dizer nada", async () => {
    const conv = await repo.getOrCreateConversation("5511960000002", "Do WhatsApp");
    const lead = await repo.upsertLead(conv.id, { contactName: "Do WhatsApp" });
    expect(lead.origem).toBe("whatsapp");
  });

  // Um contato que já era atendimento do WhatsApp e preencheu o formulário depois
  // continua tendo chegado pelo WhatsApp: reescrever aqui apagaria de onde ele veio.
  it("preencher o formulário depois não reescreve a origem de quem já era caso", async () => {
    const conv = await repo.getOrCreateConversation("5511960000003", "Já era");
    await repo.upsertLead(conv.id, { contactName: "Já era" });
    await POST(req({ nome: "Já era", telefone: "5511960000003" }, { token: segredoDeVerdade }));
    expect((await repo.getLeadByConversation(conv.id))?.origem).toBe("whatsapp");
  });
});

describe("CORS", () => {
  it("origem não listada não recebe liberação", async () => {
    const res = await OPTIONS(
      new NextRequest("https://painel.local/api/captura/site", {
        method: "OPTIONS",
        headers: { origin: "https://site-qualquer.example" },
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
