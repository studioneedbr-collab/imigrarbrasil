import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRepository } from "@/lib/data";
import { definirChaveGeral } from "@/lib/agent/estado";

// A sessão é falsa; o resto é real. É o mínimo necessário para exercitar as rotas —
// mockar o repositório junto transformaria isto num teste do mock.
const SESSAO = { sub: "u1", email: "shayene@imigrarbrasil.com.br", role: "admin" as const };
vi.mock("@/lib/auth/guard", () => ({
  requireAdmin: async () => ({ ok: true, session: SESSAO }),
  requireSession: async () => ({ ok: true, session: SESSAO }),
  getSession: async () => SESSAO,
}));

import { NextRequest } from "next/server";
import { PUT as putChave } from "@/app/api/agente/chave/route";
import { PUT as putAtivacao } from "@/app/api/agente/instancias/[id]/ativacao/route";
import { PATCH as patchConversa } from "@/app/api/conversations/[id]/route";

const repo = getRepository();

function req(body: unknown) {
  return new NextRequest("https://painel.local/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** As linhas de auditoria gravadas depois de um marcador de tempo. */
async function acessosDesde(marca: number) {
  const todos = await repo.listAcessos(200);
  return todos.filter((a) => Date.parse(a.criadoEm) >= marca);
}

let marca = 0;
beforeEach(async () => {
  await definirChaveGeral(true, "setup@teste", null);
  marca = Date.now();
  // O carimbo de `criadoEm` tem resolução de milissegundo; um passo garante que as
  // linhas anteriores fiquem de fora do recorte.
  await new Promise((r) => setTimeout(r, 2));
});

describe("toda mudança de estado vai para o log de auditoria", () => {
  it("nível 1 — a chave geral, com estado anterior, novo e motivo", async () => {
    const res = await putChave(req({ ligada: false, motivo: "inventou prazo de defesa" }));
    expect(res.status).toBe(200);

    const linhas = await acessosDesde(marca);
    const linha = linhas.find((a) => a.acao === "agente.chave_geral")!;
    expect(linha).toBeTruthy();
    expect(linha.autor).toBe(SESSAO.email);
    expect(linha.detalhe).toContain("ligado → desligado");
    expect(linha.detalhe).toContain("inventou prazo de defesa");
  });

  it("desligar a chave geral sem motivo é recusado, e nada é gravado", async () => {
    const res = await putChave(req({ ligada: false }));
    expect(res.status).toBe(400);
    expect((await acessosDesde(marca)).filter((a) => a.acao === "agente.chave_geral")).toHaveLength(0);
    // E o estado não mudou: uma recusa que muda o estado é pior do que nenhuma recusa.
    const chave = await repo.getConfig<{ ligada: boolean }>("chave_geral");
    expect(chave?.ligada).toBe(true);
  });

  it("nível 2 — ativar produção exige confirmação explícita antes de qualquer gravação", async () => {
    const inst = await repo.criarInstancia({ nome: "Prod", instanceId: `p_${Date.now()}`, token: "t" });
    await repo.atualizarInstancia(inst.id, { ambiente: "producao" });

    const semConfirmar = await putAtivacao(req({ ativo: true }), { params: { id: inst.id } });
    expect(semConfirmar.status).toBe(409);
    expect((await repo.getInstancia(inst.id))!.ativo).toBe(false);

    const comConfirmar = await putAtivacao(
      req({ ativo: true, confirmarProducao: true }),
      { params: { id: inst.id } },
    );
    expect(comConfirmar.status).toBe(200);
    expect((await repo.getInstancia(inst.id))!.ativo).toBe(true);

    const linha = (await acessosDesde(marca)).find((a) => a.acao === "agente.instancia.ativacao")!;
    expect(linha.detalhe).toContain("desligada → ligada");
    expect(linha.alvoId).toBe(inst.id);
  });

  it("nível 3 — assumir e devolver a conversa", async () => {
    const conv = await repo.getOrCreateConversation(`5521${Date.now()}`, "Auditoria");

    await patchConversa(req({ iaActive: false }), { params: { id: conv.id } });
    await patchConversa(req({ iaActive: true }), { params: { id: conv.id } });

    const linhas = (await acessosDesde(marca)).filter((a) => a.acao === "agente.conversa");
    expect(linhas).toHaveLength(2);
    expect(linhas.some((l) => l.detalhe?.includes("assumida por um humano"))).toBe(true);
    expect(linhas.some((l) => l.detalhe?.includes("devolvida ao agente"))).toBe(true);
  });
});
