// AS CATEGORIAS DE DESFECHO, QUE DEIXARAM DE SER CÓDIGO.
//
// Eram seis, escritas em quatro camadas (união de tipos, array, enum do zod, check do
// banco) e inalcançáveis por quem usa o sistema. O escritório pediu para editar e criar
// pela tela — e o pedido está certo: "por que perdemos" é vocabulário de quem vende.
//
// O que se testa aqui não é "criar funciona". É o que some em silêncio quando não se
// presta atenção: a chave que não pode mudar, o motivo que o sistema escreve sozinho, e a
// categoria apagada depois de trinta casos terem sido fechados com ela.

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getRepository } from "@/lib/data";
import { chaveDoRotulo } from "@/lib/crm/motivos";
import { rotuloDoMotivo } from "@/lib/domain/rotulos";

const repo = getRepository();

describe("a chave nasce do rótulo, e ninguém a digita", () => {
  // Pedir uma "chave" a quem está descrevendo o trabalho dele é pedir vocabulário de banco
  // de dados. E chave digitada à mão vira "Preco 2" no dia em que alguém errar.
  it("tira acento, caixa e pontuação", () => {
    expect(chaveDoRotulo("Preço/condições")).toBe("preco_condicoes");
    expect(chaveDoRotulo("Foi para OUTRO escritório")).toBe("foi_para_outro_escritorio");
    expect(chaveDoRotulo("Não era caso!")).toBe("nao_era_caso");
  });

  it("não deixa sobrar separador nas pontas", () => {
    expect(chaveDoRotulo("  — prazo curto —  ")).toBe("prazo_curto");
  });

  it("um rótulo sem letra nem número não gera chave", () => {
    expect(chaveDoRotulo("???")).toBe("");
  });
});

describe("o rótulo de um motivo nunca some da ficha", () => {
  // Desde que a lista virou dado, o que está gravado num lead pode ser uma chave que o
  // código nunca viu. Devolver vazio deixaria a ficha com um buraco onde deveria estar
  // "por que perdemos" — pior do que mostrar a chave crua.
  it("usa o rótulo da tabela quando ele existe", () => {
    expect(rotuloDoMotivo("preco", [{ chave: "preco", rotulo: "Preço/condições" }])).toBe(
      "Preço/condições",
    );
  });

  it("cai no rótulo histórico quando a tabela não foi lida", () => {
    expect(rotuloDoMotivo("perfil_dpu")).toBe("Perfil DPU");
  });

  it("lê a chave de volta para gente quando ela é desconhecida", () => {
    expect(rotuloDoMotivo("prazo_curto_demais")).toBe("Prazo curto demais");
  });

  it("sem motivo, não inventa", () => {
    expect(rotuloDoMotivo(null)).toBeNull();
  });
});

describe("o repositório guarda as regras que o banco também guarda", () => {
  it("nasce com as seis de perda e as três de desqualificação", async () => {
    const perda = await repo.listMotivos("perda");
    const desq = await repo.listMotivos("desqualificacao");
    expect(perda.map((m) => m.chave)).toContain("sumiu");
    expect(perda.length).toBe(6);
    expect(desq.length).toBe(3);
  });

  it("cria um motivo novo no tipo certo", async () => {
    const m = await repo.criarMotivo({ tipo: "perda", chave: "prazo_curto", rotulo: "Prazo curto" });
    expect(m.tipo).toBe("perda");
    expect((await repo.listMotivos("desqualificacao")).some((x) => x.chave === "prazo_curto")).toBe(false);
  });

  // O QUE SE EDITA É O RÓTULO. A chave é o que está gravado nos casos fechados: trocá-la
  // tornaria esses casos órfãos em silêncio — uma fatia sem nome no relatório, sem nada
  // indicando o que aconteceu.
  it("renomear muda o rótulo e NÃO a chave", async () => {
    const [alvo] = await repo.listMotivos("perda");
    const depois = await repo.atualizarMotivo(alvo.id, {
      rotulo: "Preço e condições",
      chave: "outra_coisa",
    } as never);
    expect(depois.rotulo).toBe("Preço e condições");
    expect(depois.chave).toBe(alvo.chave);
  });

  // `sumiu` é escrito pela varredura de follow-up (lib/followup/varredura.ts) e contado
  // pelas métricas. Apagá-lo faria o sistema continuar gravando uma categoria que nenhuma
  // tela sabe mais nomear.
  it("não deixa apagar o motivo que o próprio sistema escreve", async () => {
    const sumiu = (await repo.listMotivos("perda")).find((m) => m.chave === "sumiu")!;
    expect(sumiu.protegido).toBe(true);
    await expect(repo.excluirMotivo(sumiu.id)).rejects.toThrow();
  });

  // Arquivar é o caminho para tirar do seletor sem perder o nome do histórico — inclusive
  // para o protegido, que pode deixar de ser oferecido sem deixar de existir.
  it("o protegido pode ser arquivado, só não apagado", async () => {
    const sumiu = (await repo.listMotivos("perda")).find((m) => m.chave === "sumiu")!;
    const depois = await repo.atualizarMotivo(sumiu.id, { arquivado: true });
    expect(depois.arquivado).toBe(true);
    await repo.atualizarMotivo(sumiu.id, { arquivado: false });
  });
});

// A RECUSA DE APAGAR CATEGORIA EM USO não é testada aqui de propósito: ela vive na rota,
// que chama `requireSession()` e por isso precisa do contexto de requisição do Next —
// chamá-la solta falha no armazenamento de sessão, não na regra. Ela foi conferida contra
// o servidor de desenvolvimento, com sessão de verdade (ver a skill `verificar-no-ar`).
