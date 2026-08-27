import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRepository } from "@/lib/data";
import { definirChaveGeral } from "@/lib/agent/estado";
import { montarFila, esperandoHumanoDemais, type LeadDaFila } from "@/lib/fila/ordenacao";
import { calcularMetricas } from "@/lib/metricas";
import type { ZapiInstancia } from "@/lib/domain/types";

// O ENVIO É ESPIONADO, NÃO EXECUTADO.
//
// É o que torna o teste do modo sombra possível de verdade: a afirmação "não envia nada"
// só vale se houver um lugar onde a tentativa de enviar apareceria. Sem o mock, o envio
// cairia no caminho `[whatsapp:sim]` (sem credencial configurada) e o teste passaria
// mesmo se o código estivesse mandando mensagem.
vi.mock("@/lib/whatsapp/send", () => ({
  sendMessage: vi.fn(async () => {}),
  sendButtons: vi.fn(async () => {}),
  sendDocument: vi.fn(async () => {}),
}));

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { sendMessage, sendButtons } from "@/lib/whatsapp/send";
import { POST } from "@/app/api/webhook/whatsapp/route";

const repo = getRepository();

/** Uma mensagem chegando pela Z-API, como o webhook a recebe. */
function webhookReq(body: Record<string, unknown>) {
  // NextRequest e não Request: a rota lê `req.nextUrl` para conferir o token do webhook.
  // O `?token=` é a autenticação real do webhook — a mesma que a Z-API usa na URL
  // configurada. Sem ele a rota devolve 401, que é exatamente o que se quer dela.
  return new NextRequest(`https://painel.local/api/webhook/whatsapp?token=${env.webhookVerifyToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * O webhook espera DEBOUNCE_MS para agrupar as mensagens quebradas do WhatsApp. Só o
 * setTimeout é falseado: `Date` continua real, senão o cálculo de expediente do SLA
 * passaria a medir um tempo que não existe.
 */
async function entregar(body: Record<string, unknown>) {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const p = POST(webhookReq(body));
    await vi.advanceTimersByTimeAsync(5000);
    return await p;
  } finally {
    vi.useRealTimers();
  }
}

/** Cadastra e configura uma instância — sempre pelos caminhos reais do repositório. */
async function instancia(nome: string, opts: {
  producao?: boolean; ligada?: boolean; modo?: ZapiInstancia["modoDesligado"];
} = {}) {
  const inst = await repo.criarInstancia({
    nome, instanceId: `zapi_${nome}_${Math.random().toString(36).slice(2)}`, token: "tok",
  });
  let atual = inst;
  if (opts.producao) atual = await repo.atualizarInstancia(inst.id, { ambiente: "producao" });
  if (opts.modo) atual = await repo.atualizarInstancia(inst.id, { modoDesligado: opts.modo });
  if (opts.ligada) atual = await repo.definirAtivacaoInstancia(inst.id, true, "admin@imigrarbrasil.com.br");
  return atual;
}

beforeEach(async () => {
  vi.mocked(sendMessage).mockClear();
  vi.mocked(sendButtons).mockClear();
  await definirChaveGeral(true, "setup@teste", null);
  for (const i of await repo.listInstancias()) await repo.excluirInstancia(i.id);
});

afterEach(() => vi.useRealTimers());

describe("instância nova nasce em teste e desligada", () => {
  it("mesmo quando quem cadastra pede produção e ligada", async () => {
    const inst = await repo.criarInstancia({
      nome: "Recém-criada", instanceId: "zapi_nova", token: "tok",
      // Um payload malicioso ou um formulário mal montado mandariam isto. O repositório
      // não lê estes campos e o banco tem um trigger que os reescreve.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ ambiente: "producao", ativo: true } as any),
    });
    expect(inst.ambiente).toBe("teste");
    expect(inst.ativo).toBe(false);
    expect(inst.ativadoPor).toBeNull();
  });

  it("e o modo padrão é sombra: grava a resposta, não envia", async () => {
    const inst = await repo.criarInstancia({ nome: "Padrão", instanceId: "zapi_padrao", token: "tok" });
    expect(inst.modoDesligado).toBe("sombra");
  });
});

describe("ligar a instância de teste não liga a de produção", () => {
  it("são duas linhas, e ligar uma não encosta na outra", async () => {
    const prod = await instancia("Produção", { producao: true });
    const tst = await instancia("Teste");

    await repo.definirAtivacaoInstancia(tst.id, true, "admin@imigrarbrasil.com.br");

    expect((await repo.getInstancia(tst.id))!.ativo).toBe(true);
    expect((await repo.getInstancia(prod.id))!.ativo).toBe(false);
  });

  it("e o agente responde no número de teste enquanto continua calado no de produção", async () => {
    const prod = await instancia("Produção", { producao: true, modo: "resposta_fixa" });
    const tst = await instancia("Teste", { ligada: true });

    await entregar({ instanceId: tst.instanceId, phone: "5521900000001", senderName: "Teste", text: { message: "oi" } });
    const respostasNoTeste = vi.mocked(sendMessage).mock.calls.length + vi.mocked(sendButtons).mock.calls.length;
    expect(respostasNoTeste).toBeGreaterThan(0);

    vi.mocked(sendMessage).mockClear();
    vi.mocked(sendButtons).mockClear();
    await entregar({ instanceId: prod.instanceId, phone: "5521900000002", senderName: "Cliente", text: { message: "oi" } });

    // Produção desligada: sai o aviso de que um humano responde, e nada mais. A prova de
    // que não foi a Ana é o texto — e o fato de nenhum botão ter sido enviado.
    expect(vi.mocked(sendButtons)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessage).mock.calls[0][1]).toContain("pessoa da equipe");
  });
});

describe("mensagem recebida com o agente desligado", () => {
  it("é gravada, aparece no painel e entra na fila com o relógio de SLA correndo", async () => {
    const prod = await instancia("Produção", { producao: true, modo: "resposta_fixa" });
    const phone = "5521900000010";

    await entregar({ instanceId: prod.instanceId, phone, senderName: "Kadi", text: { message: "meu visto foi negado" } });

    const conv = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!;
    expect(conv).toBeTruthy();

    // NÃO FOI IGNORADA: a mensagem está no histórico.
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.some((m) => m.role === "user" && m.content.includes("visto foi negado"))).toBe(true);

    // E o relógio da primeira resposta humana está correndo.
    expect(conv.aguardandoHumanoDesde).toBeTruthy();
    expect(conv.ambiente).toBe("producao");
  });

  it("o relógio abre UMA vez — mensagem nova de quem está esperando não o zera", async () => {
    const prod = await instancia("Produção", { producao: true, modo: "resposta_fixa" });
    const phone = "5521900000011";

    await entregar({ instanceId: prod.instanceId, phone, text: { message: "alguém aí?" } });
    const primeira = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!.aguardandoHumanoDesde;

    await entregar({ instanceId: prod.instanceId, phone, messageId: "m2", text: { message: "por favor" } });
    const segunda = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!.aguardandoHumanoDesde;

    expect(segunda).toBe(primeira);
  });

  it("quando o SLA estoura, o caso sobe para o topo da fila", () => {
    const base = {
      conversationId: "c", whatsappNumber: "55219", status: "new" as const, stage: "novo" as const,
      score: 0, createdAt: "2026-08-20T12:00:00.000Z", updatedAt: "2026-08-20T12:00:00.000Z",
      classificacao: "MORNO_ADMINISTRATIVO" as const, ambiente: "producao" as const,
    };
    const agora = new Date("2026-08-27T14:00:00.000Z"); // quinta, 11h em Brasília

    const esperando: LeadDaFila = {
      ...base, id: "esperando", slaMinutos: 30,
      // Chegou às 8h30 de Brasília; já são 11h e ninguém respondeu.
      aguardandoHumanoDesde: "2026-08-27T11:30:00.000Z",
    };
    const judicial: LeadDaFila = { ...base, id: "judicial", classificacao: "QUENTE_JUDICIAL" };

    expect(esperandoHumanoDemais(esperando, agora)).toBe(true);
    const fila = montarFila([judicial, esperando], agora);
    // Sobe acima até de um caso judicial, que é o primeiro da ordem normal: a promessa
    // do modo desligado ("alguém responde") já foi quebrada neste caso.
    expect(fila.normal[0].id).toBe("esperando");
  });

  it("silêncio total é privilégio de teste — em produção sai a resposta fixa", async () => {
    // O repositório recusa gravar 'silencio' em produção, com a mesma regra do banco.
    const inst = await instancia("Produção", { producao: true });
    await expect(repo.atualizarInstancia(inst.id, { modoDesligado: "silencio" })).rejects.toThrow();
  });
});

describe("modo sombra", () => {
  it("grava a resposta que a Ana teria dado e NÃO envia nada", async () => {
    const prod = await instancia("Produção", { producao: true, modo: "sombra" });
    const phone = "5521900000020";

    await entregar({ instanceId: prod.instanceId, phone, senderName: "Yasmin", text: { message: "estou irregular no Brasil, o que faço?" } });

    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(sendButtons)).not.toHaveBeenCalled();

    const conv = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!;
    const rascunhos = await repo.listRascunhos({ conversationId: conv.id });
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0].texto.length).toBeGreaterThan(0);
    expect(rascunhos[0].status).toBe("pendente");

    // E A RESPOSTA NÃO ENTRA NO HISTÓRICO. Uma mensagem "assistant" gravada sem ter sido
    // enviada faz o turno seguinte acreditar que a pessoa já leu aquilo.
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  it("descartar guarda o motivo, e o rascunho não pode ser decidido duas vezes", async () => {
    const conv = await repo.getOrCreateConversation("5521900000021", "Bruno");
    const r = (await repo.criarRascunho({ conversationId: conv.id, texto: "Resposta da Ana." }))!;

    const primeiro = await repo.decidirRascunho(
      r.id, { status: "descartado", motivo: "inventou prazo que não existe" }, "revisor@imigrarbrasil.com.br",
    );
    expect(primeiro!.motivo).toBe("inventou prazo que não existe");

    // Segundo clique não decide de novo — é o que impede a mesma mensagem de sair duas vezes.
    expect(await repo.decidirRascunho(r.id, { status: "enviado" }, "outro@imigrarbrasil.com.br")).toBeNull();
  });

  it("editar antes de enviar guarda os DOIS textos — é o par que ensina", async () => {
    const conv = await repo.getOrCreateConversation("5521900000022", "Carla");
    const r = (await repo.criarRascunho({ conversationId: conv.id, texto: "Texto original da Ana." }))!;

    const decidido = await repo.decidirRascunho(
      r.id, { status: "enviado", textoEnviado: "Texto corrigido pela atendente." }, "revisor@imigrarbrasil.com.br",
    );
    expect(decidido!.texto).toBe("Texto original da Ana.");
    expect(decidido!.textoEnviado).toBe("Texto corrigido pela atendente.");
  });
});

describe("humano assume a conversa", () => {
  it("o agente para de responder NAQUELA conversa e o relógio de SLA fecha", async () => {
    const prod = await instancia("Produção", { producao: true, ligada: true, modo: "sombra" });
    const phone = "5521900000030";

    await entregar({ instanceId: prod.instanceId, phone, senderName: "Elis", text: { message: "oi" } });
    expect(vi.mocked(sendMessage).mock.calls.length + vi.mocked(sendButtons).mock.calls.length).toBeGreaterThan(0);

    const conv = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!;
    await repo.updateConversation(conv.id, { aguardandoHumanoDesde: new Date().toISOString() });
    await repo.assumeConversation(conv.id, "advogado@imigrarbrasil.com.br");

    // Assumir fecha o relógio: tem gente na conversa agora.
    expect((await repo.getConversation(conv.id))!.aguardandoHumanoDesde).toBeNull();

    vi.mocked(sendMessage).mockClear();
    vi.mocked(sendButtons).mockClear();
    await entregar({ instanceId: prod.instanceId, phone, messageId: "assumida-2", text: { message: "ainda estou aqui" } });

    expect(vi.mocked(sendMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(sendButtons)).not.toHaveBeenCalled();
    // Nem rascunho: a conversa tem dono, e sombra aqui só encheria a fila de revisão.
    expect(await repo.listRascunhos({ conversationId: conv.id })).toHaveLength(0);
    // Mas a mensagem foi gravada — assumir não é ignorar.
    const msgs = await repo.listMessages(conv.id);
    expect(msgs.some((m) => m.content.includes("ainda estou aqui"))).toBe(true);
  });

  it("devolver ao agente volta a fazer a Ana responder", async () => {
    const prod = await instancia("Produção", { producao: true, ligada: true });
    const phone = "5521900000031";
    await entregar({ instanceId: prod.instanceId, phone, text: { message: "oi" } });
    const conv = (await repo.listConversations()).find((c) => c.whatsappNumber === phone)!;

    await repo.assumeConversation(conv.id, "advogado@imigrarbrasil.com.br");
    await repo.releaseConversation(conv.id);
    expect((await repo.getConversation(conv.id))!.assumedBy).toBeNull();

    vi.mocked(sendMessage).mockClear();
    vi.mocked(sendButtons).mockClear();
    await entregar({ instanceId: prod.instanceId, phone, messageId: "devolvida-2", text: { message: "voltei" } });
    expect(vi.mocked(sendMessage).mock.calls.length + vi.mocked(sendButtons).mock.calls.length).toBeGreaterThan(0);
  });
});

describe("conversa de teste não aparece nas métricas", () => {
  const lead = (id: string, ambiente: "teste" | "producao"): LeadDaFila => ({
    id, conversationId: `c_${id}`, whatsappNumber: "55219", status: "new", stage: "novo", score: 0,
    createdAt: "2026-08-20T12:00:00.000Z", updatedAt: "2026-08-20T12:00:00.000Z",
    classificacao: "MORNO_ADMINISTRATIVO", classificacaoIa: "MORNO_ADMINISTRATIVO", ambiente,
  });

  it("nem no total atendido, nem na fila de trabalho", () => {
    const leads = [lead("real", "producao"), lead("ensaio", "teste")];
    const de = new Date("2026-08-01T00:00:00.000Z");
    const ate = new Date("2026-08-31T23:59:59.000Z");

    const m = calcularMetricas(leads, [], de, ate);
    expect(m.atendidas).toBe(1);
    expect(m.qualificados.total).toBe(1);

    const fila = montarFila(leads, new Date("2026-08-27T14:00:00.000Z"));
    expect(fila.normal.map((l) => l.id)).toEqual(["real"]);
    // Nem em "filtradas": aquela aba audita o que o agente descartou, e um ensaio ali
    // faz a amostragem mentir.
    expect(fila.filtradas).toHaveLength(0);
  });
});

describe("a chave geral", () => {
  it("desligar exige motivo", async () => {
    await expect(definirChaveGeral(false, "admin@imigrarbrasil.com.br", "  ")).rejects.toThrow("motivo_obrigatorio");
  });

  it("desligada, cala até a instância de produção que está ligada", async () => {
    const prod = await instancia("Produção", { producao: true, ligada: true, modo: "resposta_fixa" });
    await definirChaveGeral(false, "shayene@imigrarbrasil.com.br", "resposta errada sobre prazo");

    await entregar({ instanceId: prod.instanceId, phone: "5521900000040", text: { message: "oi" } });

    expect(vi.mocked(sendButtons)).not.toHaveBeenCalled();
    expect(vi.mocked(sendMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessage).mock.calls[0][1]).toContain("pessoa da equipe");
  });
});
