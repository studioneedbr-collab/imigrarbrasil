import { describe, it, expect } from "vitest";
import { contaDona, porqueNaoPodeMexer } from "@/lib/auth/papeis";
import { MemoryRepository } from "@/lib/data/memory-repository";

// A CONTA DONA EXISTE PARA UMA FALHA CONCRETA, NÃO PARA UMA HIERARQUIA.
//
// A tela de usuários só cria e lista, então toda edição de conta neste projeto foi feita à
// mão no SQL Editor do Supabase — foi assim que a senha de 27/08 foi redefinida. Um
// `active = false` na linha errada deixa o painel sem ninguém que administre, e a saída
// seria outro UPDATE no banco: o mesmo gesto que causou o problema.
describe("a conta dona do painel", () => {
  const dona = { dono: true };
  const comum = { dono: false };

  it("não se apaga, não se desativa e não se rebaixa", () => {
    expect(porqueNaoPodeMexer(dona, { apagar: true })).toMatch(/não pode ser apagada/);
    expect(porqueNaoPodeMexer(dona, { ativo: false })).toMatch(/não pode ser desativada/);
    expect(porqueNaoPodeMexer(dona, { papel: "advogado" })).toMatch(/deixar de ser administradora/);
    expect(porqueNaoPodeMexer(dona, { papel: "atendente" })).toBeTruthy();
  });

  it("proteger não é congelar: o que não muda o acesso continua livre", () => {
    // Nome, senha, e-mail e setor mudam normalmente. Uma conta dona que não se consegue
    // editar em nada é uma conta que ninguém mantém — e senha que não troca é pior do que
    // conta que se rebaixa.
    expect(porqueNaoPodeMexer(dona, {})).toBeNull();
    expect(porqueNaoPodeMexer(dona, { papel: "admin" })).toBeNull();
    expect(porqueNaoPodeMexer(dona, { ativo: true })).toBeNull();
  });

  it("qualquer outra conta continua editável", () => {
    expect(porqueNaoPodeMexer(comum, { apagar: true })).toBeNull();
    expect(porqueNaoPodeMexer(comum, { ativo: false })).toBeNull();
    expect(porqueNaoPodeMexer(comum, { papel: "atendente" })).toBeNull();
  });

  it("acha a dona numa lista, e devolve nada quando não há", () => {
    expect(contaDona([comum, dona])).toBe(dona);
    expect(contaDona([comum, comum])).toBeNull();
  });
});

describe("quem nasce dona", () => {
  it("o primeiro admin — e só ele", async () => {
    const repo = new MemoryRepository();
    const primeiro = await repo.createUser({
      email: "a@x.com", passwordHash: "h", role: "admin",
    });
    const segundo = await repo.createUser({
      email: "b@x.com", passwordHash: "h", role: "admin",
    });
    expect(primeiro.dono).toBe(true);
    // Duas contas donas seria a mesma coisa que nenhuma: ninguém saberia qual é a
    // intocável. O índice único do banco garante o mesmo; aqui a regra fica testável.
    expect(segundo.dono).toBe(false);
  });

  it("atendente nunca vira dona, mesmo sendo o primeiro a existir", () => {
    const repo = new MemoryRepository();
    return repo
      .createUser({ email: "c@x.com", passwordHash: "h", role: "atendente" })
      .then((u) => expect(u.dono).toBe(false));
  });
});
