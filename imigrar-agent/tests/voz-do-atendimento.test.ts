import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, AGENT_REASONING, OBJECTIONS, buildSystemPrompt } from "@/lib/agent/knowledge";
import { BEHAVIOR_RULES, DEFAULT_GUARDRAILS, buildBehaviorRulesBlock } from "@/lib/agent/training";
import { prometeEnvio, revisarTurno } from "@/lib/agent/verificador-de-saida";

// O QUE ESTE ARQUIVO PRENDE NO LUGAR
//
// A equipe entregou dezesseis conversas reais do WhatsApp da Imigrar Brasil para o agente
// "estudar". A atendente daquelas conversas é uma pessoa do time: ela passa valor, afirma
// prazo, pede CPF, manda orçamento e fecha contrato — e isso continua sendo trabalho dela
// e do time jurídico, não da Ana.
//
// Então o que foi aprendido dali é O JEITO DE ESCREVER e AS PERGUNTAS QUE SE FAZ. Estes
// testes garantem as duas metades disso: que o jeito de escrever entrou no prompt, e que
// nenhum dos comportamentos que a Ana não pode ter entrou junto.

const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

describe("a voz do atendimento", () => {
  it("o prompt diz como o time escreve, e avisa que o CONTEÚDO daquelas conversas não é da Ana", () => {
    expect(AGENT_REASONING).toMatch(/COMO O TIME DA IMIGRAR BRASIL REALMENTE ESCREVE/);
    expect(AGENT_REASONING).toMatch(/ele é sobre O JEITO DE ESCREVER/);
    expect(AGENT_REASONING).toMatch(/Nada disso vira seu por estar aqui/);
  });

  it("separa o 'Perfeito' isolado do 'Perfeito!' que carimba a frase", () => {
    // A distinção não é preciosismo: o bloco anterior proíbe o carimbo de abertura, e sem
    // esta ressalva a Ana perde também a bolha curta de confirmação, que é o que mais
    // aproxima a escrita dela da de uma pessoa.
    expect(AGENT_REASONING).toMatch(/SOZINHO É DIFERENTE DE/);
    expect(AGENT_REASONING).toMatch(/O que denuncia robô é o PREFIXO/);
  });

  it("manda corrigir o próprio erro na hora, em vez de trocar de versão em silêncio", () => {
    expect(AGENT_REASONING).toMatch(/QUANDO VOCÊ ERRAR, CORRIJA NA HORA/);
  });

  it("manda escrever em bolhas curtas, não em parágrafo", () => {
    expect(AGENT_REASONING).toMatch(/BOLHA CURTA, NÃO PARÁGRAFO/);
  });
});

describe("a Ana não produz nem envia documento", () => {
  it("tem bloco próprio no raciocínio, e diz o que dizer no lugar", () => {
    expect(AGENT_REASONING).toMatch(/VOCÊ NÃO PRODUZ NEM ENVIA DOCUMENTO/);
    expect(AGENT_REASONING).toMatch(/você não PROMETE nada disso/);
    expect(AGENT_REASONING).toMatch(/O QUE VOCÊ DIZ NO LUGAR/);
  });

  it("está também na lista de guardrails, que é o que o modelo lê por último", () => {
    expect(AGENT_REASONING).toMatch(/PROMETA enviar arquivo, imagem, PDF, orçamento/);
  });

  it("é uma regra ligável em /dashboard/treinar, e vem ligada por padrão", () => {
    const regra = BEHAVIOR_RULES.find((r) => r.id === "nao_prometer_envio");
    expect(regra).toBeDefined();
    expect(DEFAULT_GUARDRAILS.regras.nao_prometer_envio).toBe(true);
    expect(buildBehaviorRulesBlock(DEFAULT_GUARDRAILS.regras)).toContain("Você só escreve texto");
  });

  it("nenhuma tool oferecida ao modelo gera arquivo — a regra não depende só do prompt", async () => {
    const { AGENT_TOOLS } = await import("@/lib/agent/tools");
    const nomes: string[] = AGENT_TOOLS.map((t) => t.name);
    // A lista inteira, e não uma busca por nomes proibidos: uma tool nova que produza
    // arquivo passaria por qualquer lista negra, e a única forma de isso não escapar é o
    // teste quebrar quando o conjunto muda.
    expect(nomes.sort()).toEqual(
      [
        "agendar_followup",
        "buscar_material_oficial",
        "enviar_opcoes",
        "registrar_dados_lead",
        "transferir_para_humano",
      ].sort(),
    );
  });
});

describe("o verificador corta a promessa de enviar documento", () => {
  it("pega a frase nos idiomas em que este atendimento acontece", () => {
    for (const frase of [
      "Vou te enviar o orçamento ainda hoje.",
      "Já mando o contrato para sua assinatura.",
      "Posso preparar a proposta para você analisar.",
      "Te envio o link de pagamento em instantes.",
      "Segue o orçamento em anexo.",
      "Voy a enviarte el presupuesto hoy mismo.",
      "I'll send you the quote shortly.",
    ]) {
      expect(prometeEnvio(frase), frase).toBe(true);
    }
  });

  it("NÃO pega falar do documento sem prometer mandar, nem o link da Defensoria", () => {
    for (const frase of [
      "O orçamento quem monta e envia é o time jurídico.",
      "Contrato e procuração são preparados pelos advogados.",
      "Existe atendimento gratuito na Defensoria: https://www.dpu.def.br/contatos-dpu",
      "Vou pedir para um advogado nosso falar com você.",
      "Posso passar o seu contato para eles?",
      "Você recebeu algum papel da Polícia Federal?",
    ]) {
      expect(prometeEnvio(frase), frase).toBe(false);
    }
  });

  it("corta a frase e deixa o resto da mensagem de pé", () => {
    const original =
      "Entendi a sua situação. Vou te enviar o orçamento ainda hoje. Você já tem CRNM?";
    const { texto, cortes } = revisarTurno(original, { idioma: "pt", encaminhou: false });
    expect(cortes).toHaveLength(1);
    expect(cortes[0]).toContain("orçamento");
    expect(texto).toContain("Entendi a sua situação.");
    expect(texto).toContain("Você já tem CRNM?");
  });

  it("corta mesmo depois de o caso ter ido para o time — a Ana nunca produz documento", () => {
    const { cortes } = revisarTurno("Já mando o contrato para você.", {
      idioma: "pt",
      encaminhou: true,
    });
    expect(cortes).toHaveLength(1);
  });

  it("mensagem que era só a promessa não sai vazia: vira o acolhimento neutro", () => {
    const { texto } = revisarTurno("Vou te enviar o orçamento.", {
      idioma: "pt",
      encaminhou: false,
    });
    expect(texto.trim()).not.toBe("");
    expect(prometeEnvio(texto)).toBe(false);
  });
});

describe("as perguntas que as conversas reais provaram valer", () => {
  const entrevista = DEFAULT_KNOWLEDGE.sections.find((s) => s.id === "qualificacao")!.body;

  it("reunião familiar pergunta se o casamento é formal e ONDE foi registrado", () => {
    const ramoE = entrevista.slice(entrevista.indexOf("RAMO E"), entrevista.indexOf("RAMO F"));
    expect(ramoE).toMatch(/casamento formal ou união estável/i);
    expect(ramoE).toMatch(/ONDE o casamento/);
  });

  it("naturalização separa 'mora aqui desde' de 'tem o documento desde'", () => {
    const ramoF = entrevista.slice(entrevista.indexOf("RAMO F"), entrevista.indexOf("RAMO G"));
    expect(ramoF).toMatch(/a data do documento, não a data em que chegou/);
    // Houve refúgio antes? É a pergunta que muda a leitura — e a Ana pergunta sem concluir.
    expect(ramoF).toMatch(/houve pedido de refúgio/i);
    expect(ramoF).toMatch(/quem faz essa leitura é o advogado/);
  });

  it("existe o ramo de residência por atividade, e ele proíbe afirmar requisito", () => {
    const ramoG = entrevista.slice(entrevista.indexOf("RAMO G"));
    expect(ramoG).toMatch(/trabalho, investimento, nômade digital, missão religiosa/);
    expect(ramoG).toMatch(/NUNCA diga valor mínimo, tempo mínimo/);
    expect(ramoG).toMatch(/Saber o nome não é saber se serve para ela/);
  });
});

describe("as objeções que aparecem cedo em toda conversa real", () => {
  const acha = (id: string) => OBJECTIONS.find((o) => o.objecao.toLowerCase().includes(id));

  it("pedido de orçamento é respondido SEM prometer envio", () => {
    const o = acha("orçamento")!;
    expect(o).toBeDefined();
    expect(o.resposta).toMatch(/quem monta e envia é o time jurídico/);
    expect(prometeEnvio(o.resposta)).toBe(false);
  });

  it("pedido de atendimento presencial tem resposta, e ela não inventa endereço", () => {
    const o = acha("escritório")!;
    expect(o).toBeDefined();
    expect(o.resposta).toMatch(/todo on-line/);
    expect(o.resposta).not.toMatch(/\bRua\b|\bAv\.|\bCEP\b/);
  });

  it("pedido de ligação não devolve telefone nenhum", () => {
    const o = acha("ligar")!;
    expect(o).toBeDefined();
    expect(o.resposta).not.toMatch(/\d{4}/);
  });

  it("nenhuma resposta de objeção promete enviar documento", () => {
    for (const o of OBJECTIONS) {
      expect(prometeEnvio(o.resposta), o.objecao).toBe(false);
    }
  });
});

describe("o que NÃO foi aprendido das conversas", () => {
  // A atendente humana faz todas estas coisas. Nenhuma delas virou comportamento da Ana.
  it("o prompt continua proibindo valor, prazo, promessa de resultado e pedido de documento", () => {
    for (const proibicao of [
      /Informe honorários, valor de serviço ou forma de pagamento/,
      /Prometa resultado, aprovação, prazo ou chance de sucesso/,
      /Estime prazo de análise/,
      /Peça número de documento, senha, dado bancário ou foto de documento/,
      /Diga EM QUE VIA a pessoa se enquadra/,
    ]) {
      expect(prompt, `guardrail perdido: ${proibicao}`).toMatch(proibicao);
    }
  });

  it("o bloco de voz não trouxe nenhuma chave Pix, link de pagamento ou valor em reais", () => {
    const voz = AGENT_REASONING.slice(
      AGENT_REASONING.indexOf("COMO O TIME DA IMIGRAR BRASIL REALMENTE ESCREVE"),
      AGENT_REASONING.indexOf("COMO VOCÊ AGE"),
    );
    expect(voz).not.toMatch(/R\$\s?\d/);
    expect(voz).not.toMatch(/https?:\/\//);
    expect(voz).not.toMatch(/\b\d{11,14}\b/);
  });

  it("nenhum dado de cliente real vazou para o prompt", () => {
    // Nomes, e-mails e documentos das conversas entregues. Se algum aparecer aqui, o
    // estudo virou cópia — e cópia de conversa real com PII dentro é o pior resultado
    // possível deste trabalho.
    for (const vazamento of ["Cláudia", "Cicera", "Cícera", "Judson", "Mohammad", "Angélica", "@gmail.com"]) {
      expect(prompt, `"${vazamento}" não deveria estar no prompt`).not.toContain(vazamento);
    }
  });
});
