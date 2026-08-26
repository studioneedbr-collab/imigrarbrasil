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

  // O QUE O TESTE REAL DE 26/08/2026 PEGOU.
  //
  // Num atendimento inteiro no chat, o agente cumpriu quase tudo e vazou em três pontos:
  // disse em que via a pessoa se enquadrava ("Bolívia faz parte do Mercosul... é uma das
  // vias mais diretas"), afirmou ONDE se faz ("solicitar o visto no consulado") e disse a
  // ORDEM ("o primeiro passo é regularizar"). Nada disso foi pedido — caiu sozinho no meio
  // de frases gentis, que é justamente o modo de falha que os exemplos não cobriam.
  describe("a linha que o agente não cruza", () => {
    it("separa O QUE um caminho é de COMO/ONDE/EM QUE ORDEM se faz", () => {
      expect(prompt).toContain("A LINHA QUE VOCÊ NÃO CRUZA");
      expect(prompt).toMatch(/isso é ONDE/);
      expect(prompt).toMatch(/isso é EM QUE ORDEM/);
      expect(prompt).toMatch(/isso é ENQUADRAMENTO/);
    });

    it("nomeia a conveniência — e não só a insistência — como a armadilha", () => {
      expect(prompt).toMatch(/A ARMADILHA É A CONVENIÊNCIA/i);
      expect(prompt).toMatch(/ningu[ée]m pediu/i);
    });

    it("manda usar a nacionalidade para perguntar, não para explicar", () => {
      expect(prompt).toMatch(/NACIONALIDADE É PARA PERGUNTAR, NÃO PARA EXPLICAR/i);
      // E o exemplo do caso que vazou está lá, com o nome do país.
      expect(prompt).toMatch(/sou da Bol[íi]via/i);
    });

    it("tem uma checagem explícita antes de enviar", () => {
      expect(prompt).toMatch(/TEM PROCEDIMENTO NA MINHA RESPOSTA\?/);
    });

    it("proíbe nominalmente os três vazamentos na lista do NUNCA", () => {
      expect(prompt).toMatch(/Diga ONDE se faz/);
      expect(prompt).toMatch(/Diga EM QUE ORDEM/);
      expect(prompt).toMatch(/Diga EM QUE VIA a pessoa se enquadra/);
      expect(prompt).toMatch(/Ofereça procedimento que ninguém pediu/);
    });

    it("trata o elogio automático como vício de robô", () => {
      expect(prompt).toMatch(/ELOGIO AUTOMÁTICO/i);
    });

    // A cartilha de regularização é explícita: quem entrou sem passar pelo controle
    // migratório e se apresenta à PF recebe multa E notificação de saída, e fica impedido
    // de pedir refúgio ou residência pela via comum. Mandar alguém "ir à Polícia Federal"
    // parece inofensivo e pode ser o pior conselho da vida da pessoa.
    it("justifica a proibição de dizer ONDE com a consequência real", () => {
      expect(prompt).toMatch(/NOTIFICAÇÃO DE SAÍDA DO PAÍS/);
      expect(prompt).toMatch(/nem PF, nem consulado, nem CONARE/i);
    });
  });

  // O TESTE EM ESPANHOL DE 26/08/2026: a conversa correu em espanhol e, na sexta
  // mensagem, o agente escorregou para o português — sem a pessoa ter pedido nada. É o
  // modo de falha do prompt estar todo escrito em português.
  describe("a regra de idioma se defende do próprio prompt", () => {
    it("avisa que o português do documento não é instrução de idioma", () => {
      expect(prompt).toMatch(/ESTE PROMPT ESTÁ ESCRITO EM PORTUGUÊS\. ISSO NÃO É UMA INSTRUÇÃO DE IDIOMA/);
    });

    it("manda conferir o idioma antes de enviar", () => {
      expect(prompt).toMatch(/ANTES DE ENVIAR, releia a sua mensagem e confirme: está no idioma dela/);
    });

    it("impede que um 'ok' curto reabra a decisão de idioma", () => {
      expect(prompt).toMatch(/NÃO reabre a decisão de idioma/);
    });
  });

  // Vieram das cartilhas oficiais, não de suposição: são as distinções que mudam a
  // conduta da triagem.
  describe("o que as cartilhas ensinaram à triagem", () => {
    it("separa ter o documento de ter o documento EM MÃOS", () => {
      expect(prompt).toMatch(/TER NÃO É TER EM MÃOS/);
    });

    it("sabe que existem quatro prazos diferentes", () => {
      expect(prompt).toMatch(/prazo de validade do visto, prazo para registro, prazo de estada ou prazo de residência/);
    });

    it("reconhece o vocabulário que a pessoa usa de verdade", () => {
      expect(prompt).toMatch(/\bRNE\b/); // nome antigo do CRNM, ainda em uso
      expect(prompt).toMatch(/\bRER\b/); // o que a pessoa chama de "protocolo"
      expect(prompt).toMatch(/Trocha|trocha/); // entrada por passagem não controlada
      expect(prompt).toMatch(/Chamante|chamante/); // reunião familiar
    });

    it("escala quem é refugiado e fala em viajar", () => {
      expect(prompt).toMatch(/refugiado_quer_viajar/);
    });
  });

  it("não sobrou nada do atendimento comercial herdado", () => {
    expect(prompt).not.toMatch(/Shayene|Shine Rio/);
    expect(prompt).not.toMatch(/proposta em PDF|gerar_proposta_pdf|calcular_preco_servico/);
    // "posto" no sentido comercial (posto de trabalho, N postos). "Posto de fronteira" é
    // vocabulário legítimo da triagem v2 — é onde a pessoa entra no país.
    expect(prompt).not.toMatch(/posto de (?:trabalho|servi[çc]o)|\d+ postos?\b|CCT|conven[çc][ãa]o coletiva/i);
    // "CNPJ" só pode aparecer na lista do que o agente NÃO tem para informar.
    for (const linha of prompt.split("\n").filter((l) => l.includes("CNPJ"))) {
      expect(linha).toMatch(/DADOS QUE VOCÊ NÃO TEM/);
    }
  });
});
