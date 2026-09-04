import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, AGENT_REASONING, buildSystemPrompt } from "@/lib/agent/knowledge";
import { avaliarEncaminhamentoComercial } from "@/lib/agent/transfer-gate";
import { qualificacaoFaltando } from "@/lib/agent/lead-capture";
import type { Lead } from "@/lib/domain/types";

// A v3 NASCEU DE UMA CONVERSA REAL que deu errado: pessoa boliviana, na Bolívia, aprovada
// numa universidade. A Ana perguntou sobre CRNM antes de saber onde ela estava, anunciou
// que a Bolívia é país do Mercosul, e duas mensagens depois disse que "o caminho é
// solicitar o visto no consulado" — as duas frases se contradizem e a segunda
// provavelmente estava errada. A conversa foi transferida em dez mensagens, sem o nome da
// pessoa, sem ninguém saber quando começavam as aulas e sem ninguém ter perguntado se ela
// queria contratar.
//
// Estes testes prendem no lugar o que mudou por causa disso. Eles verificam o TEXTO do
// prompt e as travas determinísticas — o comportamento do modelo em si depende do RAG e
// se verifica na simulação (tests/_simulacao.manual.ts).

const prompt = buildSystemPrompt(DEFAULT_KNOWLEDGE);

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "l1", conversationId: "c1", whatsappNumber: "+55", status: "new",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...p,
  } as Lead;
}

describe("v3 — a ordem de abertura", () => {
  it("exige nome, nacionalidade e localização antes de qualquer modalidade", () => {
    expect(AGENT_REASONING).toMatch(/ORDEM OBRIGATÓRIA DE ABERTURA/);
    expect(AGENT_REASONING).toMatch(/O NOME da pessoa/);
    expect(AGENT_REASONING).toMatch(/não mencione Mercosul, reunião familiar, refúgio/);
  });

  it("manda reconhecer o objetivo em uma frase e ir para as três perguntas", () => {
    expect(AGENT_REASONING).toMatch(/SE A PESSOA ABRIR COM UM OBJETIVO/);
    expect(AGENT_REASONING).toMatch(/Não comece a explicar o objetivo/);
  });
});

describe("v3 — o silêncio factual sobre o Mercosul", () => {
  it("proíbe presumir visto consular para nacionais dos países do acordo", () => {
    const texto = `${AGENT_REASONING}\n${prompt}`;
    expect(texto).toMatch(/NUNCA presuma[^.]*visto consular|visto consular/i);
    for (const pais of ["Argentina", "Bolívia", "Chile", "Colômbia", "Equador", "Paraguai", "Peru", "Uruguai"]) {
      expect(AGENT_REASONING, `sem ${pais} na regra do Mercosul`).toContain(pais);
    }
  });

  it("manda conferir a mensagem contra o que já foi dito na conversa", () => {
    expect(AGENT_REASONING).toMatch(/CONFIRA CONTRA O QUE VOCÊ JÁ DISSE/);
    expect(AGENT_REASONING).toMatch(/Contradiga, na mesma conversa/);
  });

  it("a orientação por nacionalidade avisa do Mercosul em vez de só apontar a via", () => {
    const s = DEFAULT_KNOWLEDGE.sections.find((x) => x.id === "orientacao_tecnica")!.body;
    expect(s).toMatch(/NUNCA presuma nem diga que essas pessoas precisam de visto consular/);
  });
});

describe("v3 — a entrevista por ramo", () => {
  const entrevista = DEFAULT_KNOWLEDGE.sections.find((s) => s.id === "qualificacao")!.body;

  it("tem os sete ramos, cada um com o seu conjunto", () => {
    for (const ramo of ["RAMO A", "RAMO B", "RAMO C", "RAMO D", "RAMO E", "RAMO F", "RAMO G"]) {
      expect(entrevista, `sem ${ramo}`).toContain(ramo);
    }
  });

  it("quem está no exterior é perguntado sobre passaporte, antecedentes e quando precisa chegar", () => {
    const ramoA = entrevista.slice(entrevista.indexOf("RAMO A"), entrevista.indexOf("RAMO B"));
    expect(ramoA).toMatch(/passaporte válido/i);
    expect(ramoA).toMatch(/antecedentes criminais/i);
    expect(ramoA).toMatch(/quando começam as aulas/i);
  });

  it("o ramo de quem está sem documento manda parar e escalar, sem tom de fiscalização", () => {
    const ramoC = entrevista.slice(entrevista.indexOf("RAMO C"), entrevista.indexOf("RAMO D"));
    expect(ramoC).toMatch(/não use nenhuma palavra que soe a fiscalização/i);
    expect(ramoC).toMatch(/PARE a entrevista e escale/);
  });

  it("reunião familiar pergunta QUAL o documento do chamante", () => {
    const ramoE = entrevista.slice(entrevista.indexOf("RAMO E"), entrevista.indexOf("RAMO F"));
    expect(ramoE).toMatch(/quem obteve residência POR reunião familiar pode não poder chamar/);
  });
});

describe("v3 — o relógio do caso", () => {
  it("o prompt trata prazo como mais do que multa e indeferimento", () => {
    expect(AGENT_REASONING).toMatch(/TODO CASO TEM UM RELÓGIO/);
    for (const relogio of ["início das aulas", "vencimento do passaporte", "vencimento do CRNM"]) {
      expect(AGENT_REASONING, `sem ${relogio}`).toContain(relogio);
    }
  });

  it("continua proibindo dizer quantos dias faltam", () => {
    expect(AGENT_REASONING).toMatch(/Quem informa prazo é o advogado/);
  });

  it("separa o relógio do caso do prazo processual — a fila de prazos não pode encher de matrícula", () => {
    const prazo = DEFAULT_KNOWLEDGE.sections.find((s) => s.id === "prazo-sinalizar-nao-datar")!.body;
    expect(prazo).toMatch(/NÃO liga \\?`?tem_prazo_correndo/);
  });
});

describe("v3 — o teste de intenção", () => {
  it("está no prompt, é feito uma vez e não é o 'posso pedir para o time te orientar?'", () => {
    expect(AGENT_REASONING).toMatch(/TESTE DE INTENÇÃO/);
    expect(AGENT_REASONING).toMatch(/tocar o processo por conta própria/);
    expect(AGENT_REASONING).toMatch(/UMA VEZ SÓ/);
    expect(AGENT_REASONING).toMatch(/não separa nada, porque toda pessoa aceita ajuda de graça/);
  });

  it("quem prefere seguir sozinho é encerrado com cortesia, como CURIOSO", () => {
    expect(AGENT_REASONING).toMatch(/encerre com cortesia e classifique como CURIOSO/);
  });

  it("quem não tem como pagar continua indo para a Defensoria", () => {
    expect(prompt).toContain("https://www.dpu.def.br/contatos-dpu");
  });
});

describe("v3 — a ficha mínima", () => {
  const completa = lead({
    contactName: "Rosa", clientType: "Bolívia", region: "Exterior — Bolívia",
    servicesInterested: ["Visto de estudo"], relogioDoCaso: "as aulas começam em março",
    intencao: "contratar",
  });

  it("o prompt lista os seis campos obrigatórios", () => {
    expect(AGENT_REASONING).toMatch(/A FICHA MÍNIMA — VOCÊ NÃO TRANSFERE SEM ISSO/);
  });

  it("o portão segura a transferência quando não há urgência e a ficha está pela metade", () => {
    const r = avaliarEncaminhamentoComercial({
      dossieCompleto: false,
      textoRecente: "fui aprovada numa universidade aí e quero estudar no Brasil",
      assuntoExigePessoa: false,
    });
    expect(r.liberado).toBe(false);
    expect(r.motivo).toMatch(/ficha ainda está pela metade/);
  });

  it("com a ficha completa, passa", () => {
    expect(qualificacaoFaltando(completa).completo).toBe(true);
    expect(
      avaliarEncaminhamentoComercial({
        dossieCompleto: true,
        textoRecente: "quero estudar no Brasil",
        assuntoExigePessoa: false,
      }).liberado,
    ).toBe(true);
  });

  it("URGENTE passa com a ficha vazia — prazo correndo vale mais que ficha completa", () => {
    for (const msg of [
      "recebi uma multa da Polícia Federal",
      "meu refúgio foi indeferido",
      "estou sendo ameaçado no meu país",
      "quero falar com um advogado",
    ]) {
      expect(
        avaliarEncaminhamentoComercial({
          dossieCompleto: false,
          textoRecente: msg,
          assuntoExigePessoa: false,
        }).liberado,
        msg,
      ).toBe(true);
    }
    expect(qualificacaoFaltando(lead()).completo).toBe(false);
  });
});
