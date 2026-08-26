import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { DEFAULT_TRAINING, buildTechnicalBlock } from "@/lib/agent/training";

// Este arquivo testava a composição de custos em 6 módulos que o agente comercial decorava (piso da
// CCT, percentual de encargo, valor do vale-refeição) e conferia se o texto batia com o
// motor de preço. Nada disso existe no prompt do agente da Imigrar Brasil.
//
// O que ficou no lugar é o invariante que este domínio exige: o prompt NÃO carrega número
// que envelhece. Requisito, prazo, taxa e documento mudam por portaria e só podem vir do
// material oficial recuperado na hora (RAG) — nunca de uma constante do código, que fica
// desatualizada em silêncio e vira informação errada na mão de quem vai agir sobre ela.

const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

describe("o prompt não carrega número que envelhece", () => {
  it("não tem valor em reais", () => {
    expect(prompt).not.toMatch(/R\$\s?\d/);
  });

  it("não tem percentual", () => {
    expect(prompt).not.toMatch(/\d+\s?%/);
  });

  it("não cita artigo de lei nem número de lei", () => {
    expect(prompt).not.toMatch(/\bart\.?\s?\d|\bartigo\s+\d|\bLei\s+n?º?\s?\d|13\.?445/i);
  });

  it("não afirma prazo em dias, meses ou anos", () => {
    // "30 dias", "em 2 anos", "após 4 anos de residência" — tudo isto é procedimento, e
    // procedimento só sai do material oficial.
    //
    // O bloco de EXEMPLOS fica de fora da checagem de propósito: ali os prazos aparecem
    // dentro da FALA DA PESSOA ("meu visto venceu faz 3 meses"), que é justamente o
    // gatilho que a Ana precisa reconhecer — não uma afirmação dela.
    const semExemplos = prompt.split("EXEMPLOS DE RACIOCÍNIO")[0];
    expect(semExemplos).not.toMatch(/\b\d+\s?(dias?|meses|m[êe]s|anos?)\b/i);
  });

  it("manda dizer que não tem a informação em vez de completar a lacuna", () => {
    expect(prompt).toMatch(/não tenho essa informação/i);
    expect(prompt).toMatch(/Nunca preencha a lacuna com conhecimento próprio/i);
  });
});

describe("o conhecimento técnico é glossário, não procedimento", () => {
  const bloco = buildTechnicalBlock(DEFAULT_TRAINING.technical);

  it("traz os termos que a Ana precisa traduzir em uma linha", () => {
    for (const termo of ["CRNM", "CONARE", "Polícia Federal", "Autorização de residência"]) {
      expect(bloco, `glossário sem ${termo}`).toContain(termo);
    }
  });

  it("lista os seis caminhos migratórios atendidos", () => {
    expect(bloco).toContain("CAMINHOS MIGRATÓRIOS ATENDIDOS");
    for (const caminho of ["Visto", "Regularização", "refúgio", "Naturalização", "Mercosul", "Reunião familiar"]) {
      expect(bloco, `caminhos sem ${caminho}`).toContain(caminho);
    }
  });

  it("avisa, no próprio bloco, que ele não é fonte de requisito nem de prazo", () => {
    expect(bloco).toMatch(/NÃO é procedimento/i);
    expect(bloco).toMatch(/material oficial/i);
  });

  it("nenhuma definição do glossário afirma requisito ou prazo", () => {
    for (const t of DEFAULT_TRAINING.technical.termos) {
      expect(t.definicao, t.termo).not.toMatch(/\b\d+\s?(dias?|meses|anos?)\b/i);
      expect(t.definicao, t.termo).not.toMatch(/R\$\s?\d/);
    }
  });
});
