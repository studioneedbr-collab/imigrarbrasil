import { describe, it, expect, vi, beforeEach } from "vitest";

// A CONFERÊNCIA ANTES DE SAIR: resposta que ignora a pessoa é reescrita; falha da
// conferência nunca deixa a pessoa sem resposta. No turno de verdade, com o modelo simulado.

const modelo = vi.hoisted(() => ({ runAgent: vi.fn(), chamarChat: vi.fn(), conduzir: vi.fn() }));
const llm = { provedor: "openai", nome: "ChatGPT", baseUrl: "x", key: "k", modelo: "gpt-4.1", configurado: true, origemDaChave: "ambiente" };
vi.mock("@/lib/agent/runner", () => ({ runAgent: modelo.runAgent }));
vi.mock("@/lib/agent/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/llm")>()),
  llmEmUso: async () => llm,
  chamarChat: modelo.chamarChat,
}));
vi.mock("@/lib/agent/conducao", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/conducao")>()),
  conduzirComLlm: modelo.conduzir,
}));

import { respondToConversation } from "@/lib/agent";
import { interpretarConferencia, mereceConferencia } from "@/lib/agent/atencao";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { getRepository } from "@/lib/data";

const repo = getRepository();
let n = 0;
let conferencias = 0;
let veredito: string | Error = '{"aprovada": true, "ignorado": null}';

async function turno(fala: string, resposta: string, antes: string[] = ["Boa tarde! Aqui é Cláudia, da Imigrar Brasil."], extra = {}) {
  const c = await repo.getOrCreateConversation(`55119333${String(++n).padStart(5, "0")}`, "Contato");
  for (const a of antes) {
    await repo.addMessage(c.id, "user", "Maria");
    await repo.addMessage(c.id, "assistant", a);
  }
  await repo.addMessage(c.id, "user", fala);
  modelo.runAgent.mockResolvedValue({ reply: resposta, toolCalls: [], source: "openai", ...extra });
  return (await respondToConversation(c.id)).reply;
}

beforeEach(() => {
  conferencias = 0;
  veredito = '{"aprovada": true, "ignorado": null}';
  modelo.conduzir.mockReset().mockResolvedValue({ reply: "Sinto muito pela sua mãe. A viagem precisa ser avaliada pelo time jurídico antes.", toolCalls: [] });
  // A mesma porta serve à leitura da ficha e ao idioma: só a conferência é contada.
  modelo.chamarChat.mockReset().mockImplementation(async (_l: unknown, p: { messages: { content: string }[] }) => {
    if (!p.messages[0].content.startsWith("Você confere o atendimento")) return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
    conferencias++;
    if (veredito instanceof Error) throw veredito;
    return new Response(JSON.stringify({ choices: [{ message: { content: veredito } }] }));
  });
});

const FALA = "Minha mãe está doente na Colômbia e não sei se posso viajar";
const MECANICA = "Entendi. Há quanto tempo você mora no Brasil?";

describe("a conferência", () => {
  it("reprovada: reescreve, com o motivo na instrução", async () => {
    veredito = '{"aprovada": false, "ignorado": "a doença da mãe e a viagem"}';
    expect(await turno(FALA, MECANICA)).toContain("Sinto muito pela sua mãe");
    expect(modelo.conduzir.mock.calls[0][0].estadoDoTurno).toContain("a doença da mãe e a viagem");
    expect(modelo.conduzir.mock.calls[0][0].sombra).toBe(true);
  });
  it("aprovada, com erro, ou ilegível: sai a original", async () => {
    for (const v of ['{"aprovada": true}', new Error("timeout"), "não sei"]) {
      veredito = v;
      expect(await turno(FALA, MECANICA)).toBe(MECANICA);
    }
    expect(modelo.conduzir).not.toHaveBeenCalled();
  });
  it("reescrita que falha: sai a original", async () => {
    veredito = '{"aprovada": false, "ignorado": "x"}';
    modelo.conduzir.mockRejectedValue(new Error("HTTP 500"));
    expect(await turno(FALA, MECANICA)).toBe(MECANICA);
  });
  it("não gasta chamada com resposta seca, nem mexe em turno que encaminhou", async () => {
    await turno("Maria", "Obrigada, Maria. De que cidade você fala?");
    expect(conferencias).toBe(0);
    veredito = '{"aprovada": false, "ignorado": "x"}';
    const aviso = "Vou passar o seu caso agora ao time jurídico.";
    await turno(FALA, aviso, undefined, { toolCalls: [{ name: "transferir_para_humano", input: {}, result: { ok: true } }] });
    expect(conferencias).toBe(0);
    expect(modelo.conduzir).not.toHaveBeenCalled();
  });
});

describe("interrogatório", () => {
  const tres = ["Qual o seu objetivo?", "Desde quando mora aqui?", "Tem familiar no Brasil?"];
  it("a quarta pergunta seguida é reescrita, mesmo depois de resposta seca", async () => {
    expect(await turno("Curitiba", "Você tem passaporte válido?", tres)).toContain("Sinto muito");
    expect(modelo.conduzir.mock.calls[0][0].estadoDoTurno).toContain("SEM pergunta de ficha");
  });
  it("pedir confirmação para encaminhar não conta", async () => {
    await turno("Curitiba", "Posso passar o seu contato ao time jurídico?", tres);
    expect(modelo.conduzir).not.toHaveBeenCalled();
  });
});

describe("leitura", () => {
  it("o que merece conferência e o que se entende da conferência", () => {
    for (const t of ["você é advogada?", FALA]) expect(mereceConferencia(t), t).toBe(true);
    for (const t of ["oi", "sim", "Maria Silva", "Sou português", ""]) expect(mereceConferencia(t), t).toBe(false);
    expect(interpretarConferencia('```json\n{"aprovada":false,"ignorado":"o prazo"}\n```')).toEqual({ aprovada: false, ignorado: "o prazo" });
    expect(interpretarConferencia('{"aprovada":"talvez"}')).toBeNull();
  });
  it("o bloco da conversa entra sempre, inclusive com o prompt cru antigo", async () => {
    expect(await getSystemPrompt()).toContain("Você se chama Cláudia");
    await repo.setConfig("system_prompt", "PROMPT ANTIGO gravado pela tela de configuração que já não existe mais.");
    const cru = await getSystemPrompt();
    expect(cru).toContain("PROMPT ANTIGO");
    expect(cru).toContain("Você se chama Cláudia");
    expect(cru).toContain("Leia, responda, e só então pergunte");
    await repo.setConfig("system_prompt", "");
  });
});
