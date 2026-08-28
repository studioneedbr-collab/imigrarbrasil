// A PORTA DE ENTRADA DO SISTEMA.
//
// `/api/webhook/whatsapp` é a única rota que responde sem sessão e a única por onde entra
// mensagem de gente de verdade. Estes testes existem porque ela já esteve aberta sem que
// nada na tela, no build ou no lint denunciasse: com `WEBHOOK_VERIFY_TOKEN` ausente E sem
// Client-Token da Z-API, as duas guardas eram puladas e a requisição seguia.
//
// Esse não era um estado hipotético — era o estado do projeto até a Z-API entrar. Nele,
// quem soubesse a URL injetava conversa e lead na fila (inclusive com prazo correndo, que
// é o topo do bloco 1) e queimava o saldo do modelo. Com a Z-API ligada ficaria pior: a
// resposta sai para o `phone` que veio no corpo, ou seja, envio para número arbitrário
// pelo WhatsApp da empresa — o caminho mais curto para o bloqueio que a regra de antiban
// existe para evitar.
//
// Por isso a afirmação que estes testes travam não é "o token certo funciona", é a outra:
// **quando não há segredo nenhum configurado, a rota não atende.**

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// O envio é espionado, não executado: sem isto, "não enviou nada" passaria mesmo se o
// código estivesse enviando, porque sem credencial o envio cai num caminho simulado.
vi.mock("@/lib/whatsapp/send", () => ({
  sendMessage: vi.fn(async () => {}),
  sendButtons: vi.fn(async () => {}),
  sendDocument: vi.fn(async () => {}),
}));

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { sendMessage } from "@/lib/whatsapp/send";
import { POST } from "@/app/api/webhook/whatsapp/route";

const repo = getRepository();
const segredoDeVerdade = env.webhookVerifyToken;

/** Uma mensagem de WhatsApp completa — a que faria o sistema escrever no banco. */
const mensagemReal = {
  phone: "5511999990000",
  instanceId: "zapi_qualquer",
  messageId: "wamid-teste-auth",
  senderName: "Alguém",
  message: { conversation: "oi, preciso de ajuda com minha situação" },
};

function req(
  body: Record<string, unknown>,
  opts: { token?: string; clientToken?: string } = {},
) {
  const url = new URL("https://painel.local/api/webhook/whatsapp");
  if (opts.token !== undefined) url.searchParams.set("token", opts.token);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.clientToken !== undefined) headers["client-token"] = opts.clientToken;
  // NextRequest e não Request: a rota lê `req.nextUrl` para conferir o token da URL.
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

/** Mexe no segredo em runtime — a rota lê `env.webhookVerifyToken` a cada chamada. */
function comSegredo(valor: string) {
  (env as { webhookVerifyToken: string }).webhookVerifyToken = valor;
}

beforeEach(async () => {
  vi.mocked(sendMessage).mockClear();
  comSegredo(segredoDeVerdade);
  await repo.setConfig("zapi", {});
});

afterEach(() => {
  comSegredo(segredoDeVerdade);
});

describe("webhook: sem segredo nenhum configurado, a rota não atende", () => {
  beforeEach(() => comSegredo(""));

  it("recusa com 503 — e diz que é instalação pela metade, não requisição forjada", async () => {
    const res = await POST(req(mensagemReal));
    // 503 e não 401 de propósito: quem lê o log precisa distinguir "alguém tentou entrar"
    // de "falta configurar". Os dois viram 401 e ninguém descobre qual é qual.
    expect(res.status).toBe(503);
  });

  it("não grava nada e não responde para o número que veio no corpo", async () => {
    await POST(req(mensagemReal));
    expect(await repo.hasWhatsappMessage(mensagemReal.messageId)).toBe(false);
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });

  it("recusa mesmo com um token qualquer na URL — não há com o que comparar", async () => {
    expect((await POST(req(mensagemReal, { token: "chute" }))).status).toBe(503);
    expect((await POST(req(mensagemReal, { token: "" }))).status).toBe(503);
  });

  it("recusa mesmo com Client-Token no header — também não há com o que comparar", async () => {
    expect((await POST(req(mensagemReal, { clientToken: "chute" }))).status).toBe(503);
  });
});

describe("webhook: com WEBHOOK_VERIFY_TOKEN configurado", () => {
  // Corpo sem telefone: a rota autentica, entra, não encontra o que tratar e devolve 200
  // no early-return. É o jeito de afirmar "passou pela autenticação" sem esperar o
  // debounce de agrupamento nem exercitar o atendimento inteiro.
  const vazio = { instanceId: "zapi_qualquer" };

  it("aceita o token certo na URL", async () => {
    expect((await POST(req(vazio, { token: segredoDeVerdade }))).status).toBe(200);
  });

  it("recusa com 401 quando o token da URL está errado", async () => {
    expect((await POST(req(mensagemReal, { token: "errado" }))).status).toBe(401);
    expect(await repo.hasWhatsappMessage(mensagemReal.messageId)).toBe(false);
  });

  it("recusa com 401 quando não vem token nenhum", async () => {
    expect((await POST(req(mensagemReal))).status).toBe(401);
  });

  it("token de tamanho diferente não derruba a comparação em tempo constante", async () => {
    // `safeEqual` usa timingSafeEqual, que LANÇA com buffers de tamanhos diferentes se o
    // comprimento não for conferido antes. Um throw aqui viraria 500 — e um 500 na porta
    // de entrada é indistinguível de instabilidade.
    expect((await POST(req(mensagemReal, { token: "x" }))).status).toBe(401);
    expect((await POST(req(mensagemReal, { token: segredoDeVerdade + "aa" }))).status).toBe(401);
  });
});

describe("webhook: autenticado pelo Client-Token da Z-API", () => {
  beforeEach(async () => {
    // Sem segredo de URL: a prova passa a ser o header, como numa conta Z-API que só
    // manda o Client-Token.
    comSegredo("");
    await repo.setConfig("zapi", {
      instanceId: "zapi_conta",
      token: "tk",
      clientToken: "ct-secreto",
    });
  });

  it("aceita o Client-Token certo", async () => {
    const res = await POST(req({ instanceId: "zapi_conta" }, { clientToken: "ct-secreto" }));
    expect(res.status).toBe(200);
  });

  it("recusa o Client-Token errado", async () => {
    expect((await POST(req(mensagemReal, { clientToken: "ct-errado" }))).status).toBe(401);
  });

  it("REGRESSÃO: header ausente não passa mais", async () => {
    // Esta é a segunda metade do buraco. A condição antiga era
    // `clientToken && incomingToken && !safeEqual(...)`: com o header ausente, o segundo
    // termo curto-circuitava, a comparação nunca acontecia e a requisição seguia. Ou
    // seja, quem mandava a prova errada era barrado e quem não mandava prova nenhuma
    // entrava.
    expect((await POST(req(mensagemReal))).status).toBe(401);
    expect(await repo.hasWhatsappMessage(mensagemReal.messageId)).toBe(false);
    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
  });
});
