// O treinamento fica inteiro; o que muda é qual leitura vale quando duas regras colidem.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ valor: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookie.valor ? { value: cookie.valor } : undefined),
    set: (_n: string, v: string) => void (cookie.valor = v),
  }),
}));

import { NextRequest } from "next/server";
import { getRepository } from "@/lib/data";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { montarEstadoDoTurno } from "@/lib/agent";
import { blocoDeDesempate } from "@/lib/agent/desempate";
import { BEHAVIOR_RULES } from "@/lib/agent/training";
import { DEFAULT_KNOWLEDGE, AGENT_REASONING } from "@/lib/agent/knowledge";
import { CENARIOS, avaliarResposta } from "@/lib/agent/bateria";
import { agenteContinuaComResponsavel, aplicarAgente } from "@/lib/crm/agente-na-transferencia";
import { createSession } from "@/lib/auth/session";
import { esquecerConta } from "@/lib/auth/guard";
import { POST as training } from "@/app/api/training/route";

const repo = () => getRepository();
const CRU = "INSTRUÇÕES ESCRITAS PELA EQUIPE. ".repeat(5);

beforeEach(async () => {
  cookie.valor = undefined;
  esquecerConta();
  await repo().setConfig("system_prompt", "");
  await repo().setConfig("knowledge_base", null);
});

describe("nada do treinamento é apagado", () => {
  it("raciocínio, persona e seções continuam inteiros no prompt", async () => {
    const p = await getSystemPrompt();
    for (const s of DEFAULT_KNOWLEDGE.sections) expect(p).toContain(s.body.trim());
    for (const l of AGENT_REASONING.split("\n").filter((x) => x.trim())) expect(p).toContain(l.trim());
    expect(p.indexOf("SE CHOCAREM")).toBeGreaterThan(p.indexOf("REGRAS QUE NÃO SE QUEBRAM"));
  });

  it("o prompt cru também recebe o desempate, sem impor tamanho", async () => {
    await repo().setConfig("system_prompt", CRU);
    const p = await getSystemPrompt();
    expect(p).toContain(CRU);
    expect(p).toContain("SE CHOCAREM");
    expect(p).not.toContain("TAMANHO:");
  });

  it("descartar o prompt cru guarda uma cópia antes", async () => {
    const u = await repo().createUser({ email: "adm-cru@x.com", passwordHash: "h", role: "admin" });
    cookie.valor = await createSession({ sub: u.id, email: u.email, role: "admin" });
    await repo().setConfig("system_prompt", CRU);
    const res = await training(new NextRequest("http://x/api/training?descartar=prompt_cru", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await repo().getConfig("system_prompt_descartado")).toBe(CRU);
    // Um segundo clique não troca a cópia por vazio.
    await training(new NextRequest("http://x/api/training?descartar=prompt_cru", { method: "POST" }));
    expect(await repo().getConfig("system_prompt_descartado")).toBe(CRU);
  });
});

describe("as contradições", () => {
  it("prazo correndo encaminha sem esperar o sim, em todas as regras fixas", async () => {
    expect(BEHAVIOR_RULES.find((r) => r.id === "nao_transferir_sem_avisar")!.prompt).toMatch(/prazo processual correndo/);
    const p = await getSystemPrompt();
    expect(p).not.toMatch(/A única exceção é risco imediato|Só há uma exceção a essa espera/);
    expect(p).not.toContain("não peça foto de documento sem necessidade");
  });

  it("o tamanho é o que a equipe escolheu, também na nota do turno", () => {
    expect(montarEstadoDoTurno(null, 1, "pt", [])).toContain("2 a 3 frases");
    expect(montarEstadoDoTurno(null, 1, "pt", [], "detalhadas")).not.toMatch(/2 a 3 frases|3 ou 4 frases/);
    expect(blocoDeDesempate("medias")).toContain("até 5 frases");
  });
});

describe("agente que continua com responsável definido", () => {
  it("só quando escolheram que ela continue", async () => {
    const c = await repo().getOrCreateConversation(`5500${Date.now()}`);
    await aplicarAgente(repo(), c.id, { email: "a@x.com", nome: "A" }, "continua", "Transferida.");
    expect(agenteContinuaComResponsavel(await repo().getConversation(c.id))).toBe(true);
    await aplicarAgente(repo(), c.id, { email: "a@x.com", nome: "A" }, "para", "Transferida.");
    expect(agenteContinuaComResponsavel(await repo().getConversation(c.id))).toBe(false);
  });
});

describe("bateria", () => {
  const base = { respostasAnteriores: ["x"], lead: null, idioma: "pt" as const };
  const tipos = (p: Partial<Parameters<typeof avaliarResposta>[0]>) =>
    avaliarResposta({ ...base, resposta: "", ...p }).map((x) => x.tipo);
  const proibe = (id: string, t: number) => CENARIOS.find((c) => c.id === id)!.proibe![t];

  it("acusa prazo em dias, parecer, valor e lista", () => {
    for (const certo of ["Se isso ajuda o seu caso, quem diz é o advogado.", "Não posso dizer que é um bom sinal, isso depende da análise."])
      expect(tipos({ resposta: certo, proibe: proibe("parecer-e-valores", 2) })).toEqual([]);
    expect(tipos({ resposta: "Uma nova a cada caso, a lista muda.", proibe: proibe("parecer-e-valores", 1) })).toEqual([]);
    expect(tipos({ resposta: "Você tem 10 dias para se defender.", proibe: proibe("multa-com-prazo", 0) })).toContain("proibido");
    expect(tipos({ resposta: "Isso é um bom sinal.", proibe: proibe("parecer-e-valores", 2) })).toContain("proibido");
    expect(tipos({ resposta: "Fica em R$ 2.000.", proibe: proibe("parecer-e-valores", 3) })).toContain("proibido");
    expect(tipos({ resposta: "Você precisa de:\n- passaporte\n- certidão", proibe: proibe("parecer-e-valores", 1) })).toContain("proibido");
    expect(tipos({ resposta: "O prazo é curto, e quem confere a contagem é o advogado.", proibe: proibe("multa-com-prazo", 0) })).toEqual([]);
  });

  it("acusa encaminhamento que faltou e o que veio cedo", () => {
    expect(tipos({ resposta: "Certo.", encaminha: true, encaminhou: false })).toContain("nao_encaminhou");
    expect(tipos({ resposta: "Certo.", encaminha: false, encaminhou: true })).toContain("encaminhou_cedo");
  });
});
