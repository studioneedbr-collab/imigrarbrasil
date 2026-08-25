import { describe, it, expect } from "vitest";
import {
  valeBuscar,
  colecoesPara,
  consultaDoTurno,
  filtrarRelevantes,
  citacaoDe,
  montarBlocoMaterial,
  CORTE_RELATIVO,
  type ChunkRecuperado,
} from "@/lib/agent/rag";

function chunk(p: Partial<ChunkRecuperado> = {}): ChunkRecuperado {
  return {
    id: "c1",
    fonte: "regularizacao",
    documento: "Cartilha de Regularização Migratória",
    colecao: "cartilha",
    titulo: "Como pedir autorização de residência?",
    secao: null,
    diploma: null,
    artigo: null,
    pagina_inicio: 12,
    pagina_fim: 12,
    atualizado_em: "2022-02",
    alerta_desatualizacao: null,
    texto: "O pedido é feito pelo sistema Migrante, com os documentos listados a seguir.",
    escore: 0.016,
    ...p,
  };
}

describe("rag · quando vale buscar", () => {
  it("não busca em saudação, agradecimento e clique de botão", () => {
    for (const t of ["oi", "olá", "bom dia", "obrigado", "ok", "1", "sim", "gracias", "blz"]) {
      expect(valeBuscar(t), `"${t}" não devia disparar busca`).toBe(false);
    }
  });

  it("busca quando a pessoa faz uma pergunta de verdade", () => {
    for (const t of [
      "meu visto de turista vence semana que vem, o que eu faço?",
      "como faço para pedir refúgio no Brasil?",
      "¿qué documentos necesito para la reunión familiar?",
    ]) {
      expect(valeBuscar(t), `"${t}" devia disparar busca`).toBe(true);
    }
  });

  it("consulta só a cartilha por padrão, e inclui a legislação quando pedem a lei", () => {
    expect(colecoesPara("como peço autorização de residência?")).toEqual(["cartilha"]);
    expect(colecoesPara("qual artigo da lei de migração fala sobre isso?")).toContain("legislacao");
    expect(colecoesPara("isso está em algum decreto?")).toContain("legislacao");
  });
});

describe("rag · a consulta do turno", () => {
  it("usa a mensagem sozinha quando ela já tem assunto", () => {
    const longa = "quais documentos preciso para pedir naturalização brasileira?";
    expect(consultaDoTurno(["oi", longa])).toBe(longa);
  });

  it("cola a mensagem anterior quando a de agora é uma continuação curta", () => {
    // Sem isto, "e quanto tempo demora?" não recupera nada: o assunto está na anterior.
    const q = consultaDoTurno(["como peço refúgio no Brasil?", "e quanto tempo demora?"]);
    expect(q).toContain("refúgio");
    expect(q).toContain("quanto tempo");
  });
});

describe("rag · corte de relevância", () => {
  it("descarta a cauda que o RRF sempre devolve", () => {
    const chunks = [
      chunk({ id: "a", escore: 0.02 }),
      chunk({ id: "b", escore: 0.015 }),
      chunk({ id: "c", escore: 0.001 }),
    ];
    const ids = filtrarRelevantes(chunks).map((c) => c.id);
    expect(ids).toEqual(["a", "b"]);
    expect(0.001).toBeLessThan(0.02 * CORTE_RELATIVO);
  });

  it("lista vazia e escore zerado não quebram", () => {
    expect(filtrarRelevantes([])).toEqual([]);
    expect(filtrarRelevantes([chunk({ escore: 0 })])).toEqual([]);
  });
});

describe("rag · citação", () => {
  it("cartilha cita documento e página", () => {
    expect(citacaoDe(chunk())).toBe("Cartilha de Regularização Migratória, p. 12");
  });

  it("página de intervalo aparece como intervalo", () => {
    expect(citacaoDe(chunk({ pagina_inicio: 12, pagina_fim: 14 }))).toContain("p. 12-14");
  });

  it("legislação cita o diploma e o artigo, não a página", () => {
    const c = chunk({ colecao: "legislacao", artigo: "30", diploma: "Lei 13.445/2017" });
    expect(citacaoDe(c)).toBe("Lei 13.445/2017, art. 30");
  });
});

describe("rag · o bloco injetado no prompt", () => {
  it("sem trecho relevante, não injeta nada", () => {
    expect(montarBlocoMaterial([])).toBe("");
  });

  it("proíbe completar a lacuna com conhecimento próprio", () => {
    const bloco = montarBlocoMaterial([chunk()]);
    expect(bloco).toMatch(/NÃO complete a lacuna/i);
    expect(bloco).toMatch(/não tem essa informação/i);
  });

  it("manda responder com as próprias palavras, não ler a cartilha em voz alta", () => {
    const bloco = montarBlocoMaterial([chunk()]);
    expect(bloco.toLowerCase()).toContain("suas palavras");
  });

  it("carrega o texto e a citação do trecho", () => {
    const bloco = montarBlocoMaterial([chunk()]);
    expect(bloco).toContain("sistema Migrante");
    expect(bloco).toContain("Cartilha de Regularização Migratória, p. 12");
  });

  it("MARCA o material anterior à Lei de Migração e manda tratá-lo com ressalva", () => {
    // Mercosul (2010) e refúgio (2010) são 9% do acervo e descrevem regime revogado.
    // Injetar isso sem marcar é o risco jurídico do item 9 da proposta.
    const bloco = montarBlocoMaterial([
      chunk({
        fonte: "mercosul",
        alerta_desatualizacao: "anterior à Lei 13.445/2017",
        escore: 0.02,
      }),
    ]);
    expect(bloco).toContain("MATERIAL DESATUALIZADO");
    expect(bloco).toMatch(/anterior à legislação atual/i);
    expect(bloco).toMatch(/time jurídico/i);
  });

  it("não põe o aviso de desatualizado quando nenhum trecho é antigo", () => {
    const bloco = montarBlocoMaterial([chunk()]);
    expect(bloco).not.toContain("MATERIAL DESATUALIZADO");
  });

  it("respeita o orçamento de caracteres — o histórico não pode ser empurrado para fora", () => {
    const gordos = Array.from({ length: 20 }, (_, i) =>
      chunk({ id: `c${i}`, texto: "x".repeat(1500), escore: 0.02 }),
    );
    expect(montarBlocoMaterial(gordos).length).toBeLessThan(8000);
  });

  it("exige a ressalva de confirmação com o time jurídico", () => {
    expect(montarBlocoMaterial([chunk()])).toMatch(/time jurídico confirma/i);
  });
});
