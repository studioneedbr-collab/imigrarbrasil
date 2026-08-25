import { describe, it, expect } from "vitest";
import {
  DEFAULT_KNOWLEDGE, findObjection, TRANSFER_RULES, CONFIDENTIAL, buildSystemPrompt,
} from "@/lib/agent/knowledge";

describe("base de conhecimento", () => {
  it("persona é a Ana, da Imigrar Brasil, e não uma advogada", () => {
    const p = DEFAULT_KNOWLEDGE.persona.toLowerCase();
    expect(p).toContain("ana");
    expect(p).toContain("imigrar brasil");
    expect(p).toMatch(/não é advogada|nao é advogada/);
  });

  it("cobre os seis caminhos migratórios do escopo", () => {
    const escopo = DEFAULT_KNOWLEDGE.sections.find((s) => s.id === "escopo")!.body.toLowerCase();
    for (const tema of ["visto", "regulariza", "naturaliza", "refúgio", "mercosul", "reunião familiar"]) {
      expect(escopo, `escopo sem ${tema}`).toContain(tema);
    }
  });

  it("findObjection mapeia pergunta de preço para a resposta que NÃO dá valor", () => {
    const o = findObjection("quanto custa para vocês fazerem isso?");
    expect(o?.resposta.toLowerCase()).toMatch(/time jurídico/);
    expect(o?.resposta).not.toMatch(/R\$\s?\d/);
  });

  it("nenhuma preocupação frequente promete resultado ou cita valor", () => {
    for (const o of DEFAULT_KNOWLEDGE.objections) {
      expect(o.resposta, `objeção "${o.objecao}"`).not.toMatch(/R\$\s?\d/);
      expect(o.resposta.toLowerCase(), `objeção "${o.objecao}"`).not.toMatch(
        /garanto|com certeza vai|é certo que|você consegue sim/,
      );
    }
  });

  it("os gatilhos de transbordo cobrem o que o documento manda encaminhar", () => {
    const casos: Array<[string, string]> = [
      ["meu visto venceu faz três meses", "situacao_irregular"],
      ["recebi uma exigência e tenho prazo para responder", "processo_em_andamento"],
      ["preciso pedir refúgio, estou sendo perseguido", "refugio_e_protecao"],
      ["quanto custa o serviço de vocês?", "honorarios_e_contratacao"],
      ["queria falar com um advogado", "advogado_ou_juridico"],
      ["no meu caso vocês acham que dá certo?", "pedido_de_analise"],
      ["vocês fazem visto americano?", "fora_do_escopo"],
    ];
    for (const [texto, categoria] of casos) {
      const regra = TRANSFER_RULES.find((r) => r.regex.test(texto));
      expect(regra?.categoria, `"${texto}" não caiu em ${categoria}`).toBe(categoria);
    }
  });

  it("uma dúvida geral NÃO dispara transbordo automático", () => {
    // Se "visto" ou "residência" fossem gatilho, o agente viraria um encaminhador que
    // nunca informa nada — e o cliente pediu justamente um agente que informa.
    for (const generica of [
      "o que é a CRNM?",
      "vocês atendem quem está no exterior?",
      "como funciona a residência pelo Mercosul?",
    ]) {
      expect(TRANSFER_RULES.some((r) => r.regex.test(generica)), `"${generica}"`).toBe(false);
    }
  });

  it("guardrail trata honorários e dados de terceiros como confidenciais", () => {
    expect(CONFIDENTIAL.some((c) => /honor[áa]rio/.test(c))).toBe(true);
    expect(CONFIDENTIAL.some((c) => /outros clientes|terceiros/.test(c))).toBe(true);
  });
});

// O que este projeto não pode perder de vista: o agente informa, não opina. Se qualquer
// uma destas regras sair do prompt, ele volta a ser um agente comercial com outro assunto.
describe("o prompt segura o agente do lado certo da linha", () => {
  const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

  it("põe a regra de idioma como prioridade máxima", () => {
    expect(prompt).toContain("REGRA DE IDIOMA — PRIORIDADE MÁXIMA");
    expect(prompt).toMatch(/responda em português E em espanhol na MESMA mensagem/i);
    expect(prompt).toMatch(/nunca presuma a nacionalidade/i);
  });

  it("proíbe responder fora do material oficial", () => {
    expect(prompt).toContain("DE ONDE VEM O QUE VOCÊ DIZ");
    expect(prompt).toMatch(/NUNCA cite de cabeça/i);
    expect(prompt).toMatch(/não tenho essa informação/i);
  });

  it("marca o limite da consultoria jurídica", () => {
    expect(prompt).toContain("O LIMITE — ISTO NÃO É CONSULTORIA JURÍDICA");
    expect(prompt).toMatch(/Prometa resultado, aprovação, prazo ou chance de sucesso/i);
    expect(prompt).toMatch(/Informe honorários/i);
  });

  it("manda avisar e confirmar antes de transferir", () => {
    expect(prompt).toContain("QUANDO ENCAMINHAR PARA O TIME JURÍDICO");
    expect(prompt).toMatch(/NUNCA transfira sem avisar/i);
    expect(prompt).toMatch(/risco imediato/i);
  });

  it("proíbe pedir documento e dado sensível", () => {
    expect(prompt).toMatch(/NUNCA PEÇA DADO SENSÍVEL/i);
    expect(prompt).toMatch(/nunca peça foto de documento|NUNCA peça foto de documento/i);
  });

  it("não sobrou nada do atendimento comercial herdado", () => {
    expect(prompt).not.toMatch(/Shayene|Shine Rio/);
    expect(prompt).not.toMatch(/proposta em PDF|gerar_proposta_pdf|calcular_preco_servico/);
    expect(prompt).not.toMatch(/posto|CCT|conven[çc][ãa]o coletiva/i);
    // "CNPJ" só pode aparecer na lista do que o agente NÃO tem para informar.
    for (const linha of prompt.split("\n").filter((l) => l.includes("CNPJ"))) {
      expect(linha).toMatch(/DADOS QUE VOCÊ NÃO TEM/);
    }
  });
});
