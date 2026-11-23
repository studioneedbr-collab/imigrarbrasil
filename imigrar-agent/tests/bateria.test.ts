import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// A BATERIA DE TESTES: as verificações (puras) e o caminho de um turno, rodando sobre o
// motor determinístico — dentro de teste não há modelo, por desenho (lib/agent/llm.ts).

const pote = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (nome: string) => void pote.delete(nome),
  }),
}));

import { avaliarResposta, conferirFicha, semelhanca, CENARIOS, abrirEnsaio, rodarTurno } from "@/lib/agent/bateria";
import { POST } from "@/app/api/training/bateria/route";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import type { Lead } from "@/lib/domain/types";

const angelo = { contactName: "Angelo", clientType: "Portugal", region: "Exterior — Suíça" } as Lead;

describe("as verificações", () => {
  it("pegam os erros dos prints", () => {
    const p = avaliarResposta({
      resposta: "Obrigada, Angelo. E você está no Brasil neste momento ou em Portugal?",
      respostasAnteriores: [],
      lead: angelo,
      idioma: "pt",
    });
    expect(p.map((x) => x.tipo)).toContain("pergunta_repetida");
  });

  it("pega a agente repetindo a própria pergunta", () => {
    const p = avaliarResposta({
      resposta: "Entendi. Existe alguma viagem ao Brasil prevista ou algum prazo pressionando você?",
      respostasAnteriores: ["Certo. Existe alguma viagem ao Brasil prevista ou algum prazo que esteja pressionando você agora?"],
      lead: null,
      idioma: "pt",
    });
    expect(p.map((x) => x.tipo)).toEqual(["repetiu_a_si_mesma"]);
  });

  it("idioma errado, resposta longa, perguntas demais e raciocínio vazado", () => {
    const tipos = (resposta: string, idioma: "pt" | "es" = "pt") =>
      avaliarResposta({ resposta, respostasAnteriores: [], lead: null, idioma }).map((x) => x.tipo);
    expect(tipos("Obrigada pela mensagem. Então você não tem nenhum documento da sua situação?", "es")).toContain("idioma");
    expect(tipos("a".repeat(701))).toContain("longa");
    expect(tipos("Qual seu nome? De onde você é? Onde está?")).toContain("perguntas_demais");
    expect(tipos("Já tenho os dados, vou registrar no sistema.")).toContain("raciocinio_vazado");
    expect(tipos("")).toEqual(["sem_resposta"]);
  });

  it("uma boa resposta passa limpa", () => {
    expect(
      avaliarResposta({
        resposta: "Entendi, Angelo. Com o prazo excedido e a multa paga, o próximo passo depende do seu protocolo. Você ainda tem o número do pedido?",
        respostasAnteriores: ["Bom dia! Como você se chama?"],
        lead: angelo,
        idioma: "pt",
      }),
    ).toEqual([]);
  });

  it("confere a ficha no fim", () => {
    expect(conferirFicha(angelo, { nacionalidade: /portugal/i, onde: /su[íi]ça/i })).toEqual([]);
    expect(conferirFicha({ clientType: "Portugal" } as Lead, { onde: /su[íi]ça/i })[0]).toContain("onde está");
  });

  it("semelhança entre perguntas", () => {
    expect(semelhanca("Você está no Brasil agora?", "Você está no Brasil neste momento?")).toBeGreaterThanOrEqual(0.75);
    expect(semelhanca("Qual é o seu nome?", "Existe algum prazo correndo?")).toBeLessThan(0.3);
  });
});

describe("um turno de ensaio", () => {
  beforeEach(() => pote.clear());

  it("grava a resposta, não avisa ninguém, e apaga o ensaio no último turno", async () => {
    const repo = getRepository();
    const c = CENARIOS.find((x) => x.id === "so-oi")!;
    const id = await abrirEnsaio(c);
    expect((await repo.getConversation(id))?.ambiente).toBe("teste");

    const t0 = await rodarTurno(c, 0, id);
    expect(t0.ultimo).toBe(false);
    expect(t0.turno.resposta.length).toBeGreaterThan(0);
    expect((await repo.listMessages(id)).some((m) => m.role === "assistant")).toBe(true);

    const t1 = await rodarTurno(c, 1, id);
    expect(t1.ultimo).toBe(true);
    expect(await repo.getConversation(id)).toBeNull();
  });

  it("a rota exige sessão e recusa rodar sem modelo", async () => {
    const pedir = () =>
      POST(new NextRequest("http://painel.local/api/training/bateria", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cenario: "so-oi", turno: 0 }),
      }));
    expect((await pedir()).status).toBe(401);
    pote.set(SESSION_COOKIE, await createSession({ sub: "u1", email: "quem@exemplo.com", role: "admin" }));
    const r = await pedir();
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("Integrações");
  });
});

describe("diagnóstico do treino", () => {
  it("conta seções e acha as repetidas, mesmo com acento ou traço diferente", async () => {
    const { diagnosticarPrompt } = await import("@/lib/agent/diagnostico-treino");
    const d = diagnosticarPrompt(
      "════════ O LIMITE — ISTO NÃO É CONSULTORIA ════════\na\n════════ COMO VOCÊ FALA ════════\nb\n════════ O limite - isto nao é consultoria ════════\nc",
    );
    expect(d.secoes).toBe(3);
    expect(d.repetidas).toEqual([{ titulo: "O LIMITE — ISTO NÃO É CONSULTORIA", vezes: 2 }]);
  });
});
