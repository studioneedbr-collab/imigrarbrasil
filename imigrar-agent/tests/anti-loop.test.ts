import { describe, it, expect } from "vitest";
import {
  avaliarImpasse,
  ehFechamentoCordial,
  ehRepeticao,
  similaridade,
} from "@/lib/agent/anti-loop";

// Mensagens reais do atendimento da Vivi (evento no Aterro do Flamengo), em que a
// Shayene reformulou a mesma confirmação três vezes e nunca enviou a proposta.
const VIVI_1 =
  "Vivi, como esse é um evento de 3 diárias de 8h (não um contrato mensal), o valor é montado por diária, não pelo preço mensal padrão. Deixa eu confirmar com você pra montar certinho: o valor que você precisa é por diária de 8h para os 30 staffs e 20 recepcionistas, totalizando os 3 dias? 😊";
const VIVI_2 =
  "Vivi, como esse é um evento pontual de 3 diárias de 8h (e não um contrato mensal), o valor é montado por diária. Vou calcular aqui com base na composição de custos e te retorno em instantes com o valor exato 😊 Só um detalhe: como é um evento de curta duração, o cálculo fica diferente do mensal. Me confirma se as 8h são por dia, totalizando os 3 dias, que eu já fecho o valor pra você.";

describe("rede anti-repetição", () => {
  it("pega a mesma mensagem reenviada", () => {
    expect(ehRepeticao(VIVI_1, [VIVI_1])).toBe(true);
  });

  it("pega a mesma ideia reescrita com outras palavras", () => {
    expect(similaridade(VIVI_1, VIVI_2)).toBeGreaterThan(0.6);
    expect(ehRepeticao(VIVI_1, [VIVI_2, VIVI_1])).toBe(true);
  });

  it("ignora acento, emoji e pontuação", () => {
    expect(
      ehRepeticao("Me confirma a região do serviço para eu calcular certinho? 😊", [
        "Me confirma a regiao do servico, para eu calcular certinho.",
      ]),
    ).toBe(true);
  });

  it("não acusa respostas de assuntos diferentes", () => {
    expect(
      ehRepeticao(
        "Para 2 porteiros na Barra o valor fica em torno de R$ 9.219 por mês, já com tudo incluso.",
        ["Me passa o nome da empresa e o CNPJ para eu gerar a proposta formal?"],
      ),
    ).toBe(false);
  });

  it("não acusa confirmação curta repetida", () => {
    expect(ehRepeticao("Perfeito! 😊", ["Perfeito! 😊"])).toBe(false);
  });

  it("só olha as três últimas respostas", () => {
    const outras = ["a) preço do porteiro", "b) dados da empresa", "c) proposta enviada"];
    expect(ehRepeticao(VIVI_1, [...outras, VIVI_1])).toBe(false);
  });
});

// Atendimento real do Wanderson (candidato a ASG, Campo Grande, 14/08): triagem feita,
// currículo recebido, e no "muito obrigado" final a Shayene repetiu a tranquilização —
// a rede leu como impasse e jogou o candidato na fila do COMERCIAL, oferecendo "os
// valores exatos" para quem estava pedindo emprego.
const RH_TRANQUILIZA =
  "Entendo a urgência, Wanderson. Seu currículo já está com o RH e registrei sua prioridade. Assim que surgir uma oportunidade de ASG na sua região, eles entram em contato. Fica tranquilo que está tudo encaminhado 😊";
const RH_REPETE =
  "Fica tranquilo, Wanderson. Seu currículo está com o RH e sua prioridade registrada. Assim que surgir uma oportunidade de ASG na sua região eles entram em contato 😊";

describe("fechamento cordial", () => {
  it("reconhece o agradecimento do Wanderson (mesmo com 'o brigado')", () => {
    expect(
      ehFechamentoCordial("muito o brigado dona shaiene só Deus sabe o que eu estou passando"),
    ).toBe(true);
  });

  it("reconhece despedidas curtas", () => {
    expect(ehFechamentoCordial("valeu, obrigada! 😊")).toBe(true);
    expect(ehFechamentoCordial("Deus te abençoe")).toBe(true);
  });

  it("não conta como fechamento quando ainda há pedido em aberto", () => {
    expect(ehFechamentoCordial("obrigado! mas me manda o valor do porteiro")).toBe(false);
    expect(ehFechamentoCordial("obrigada, e quanto fica a proposta?")).toBe(false);
  });

  it("mensagem sem agradecimento nenhum não é fechamento", () => {
    expect(ehFechamentoCordial("preciso de 2 ASGs na Barra")).toBe(false);
  });
});

describe("impasse — para quem vai o atendimento travado", () => {
  const base = {
    novaResposta: VIVI_1,
    respostasAnteriores: [VIVI_2, VIVI_1],
    ultimaMensagemDoCliente: "isso mesmo, são 3 dias",
    setor: "comercial" as const,
    fonte: "deepseek" as const,
    jaTransferiu: false,
    // Triagem fechada: é o caso raro em que nem com tudo na mão dá para cotar
    // (evento por diária). Aí sim uma pessoa entra.
    faltamNoDossie: [] as string[],
  };

  it("conversa comercial travada com a triagem completa vai para o comercial, como urgente", () => {
    const r = avaliarImpasse(base);
    expect(r?.acao).toBe("encaminhar");
    expect(r?.setor).toBe("comercial");
    expect(r?.priority).toBe("urgent");
    expect(r?.msg).toMatch(/comercial/i);
  });

  // Decisão do Eduardo: o comercial humano é 1% dos atendimentos, e só depois do PDF.
  // Travar no meio de uma cotação não é motivo para chamar ninguém — é sinal de que
  // falta dado na triagem.
  it("cotação travada com dado faltando NÃO encaminha: pede o que falta", () => {
    const r = avaliarImpasse({
      ...base,
      faltamNoDossie: ["o nome da empresa", "o CNPJ", "o e-mail para enviar a proposta"],
    });
    expect(r?.acao).toBe("destravar");
    expect(r?.msg).toMatch(/nome da empresa/i);
    expect(r?.msg).not.toMatch(/comercial|encaminh|chamei/i);
  });

  it("com a proposta já enviada, o comercial volta a poder entrar", () => {
    const r = avaliarImpasse({ ...base, jaTemProposta: true, faltamNoDossie: ["o CNPJ"] });
    expect(r?.acao).toBe("encaminhar");
  });

  it("fora do expediente, promete o retorno na hora certa em vez de 'já chamei alguém'", () => {
    const r = avaliarImpasse({ ...base, proximoRetorno: "na segunda-feira a partir das 8h" });
    expect(r?.msg).toMatch(/segunda-feira a partir das 8h/);
    expect(r?.msg).not.toMatch(/Já chamei/);
  });

  it("nunca mais oferece 'os valores exatos' de um humano", () => {
    expect(avaliarImpasse(base)?.msg).not.toMatch(/valores exatos/i);
  });

  it("candidato a vaga NUNCA cai no comercial nem ouve falar de valores", () => {
    const r = avaliarImpasse({
      ...base,
      novaResposta: RH_REPETE,
      respostasAnteriores: [RH_TRANQUILIZA],
      ultimaMensagemDoCliente: "eu preciso muito dessa vaga",
      setor: "rh",
    });
    expect(r?.setor).toBe("rh");
    expect(r?.priority).toBe("normal");
    expect(r?.msg).toMatch(/RH/);
    expect(r?.msg).not.toMatch(/comercial|valores/i);
  });

  it("o agradecimento do Wanderson não vira transferência nenhuma", () => {
    expect(
      avaliarImpasse({
        ...base,
        novaResposta: RH_REPETE,
        respostasAnteriores: [RH_TRANQUILIZA],
        ultimaMensagemDoCliente: "muito o brigado dona shaiene só Deus sabe o que eu estou passando",
        setor: "rh",
      }),
    ).toBeNull();
  });

  it("respeita o setor de operacional e DP", () => {
    expect(avaliarImpasse({ ...base, setor: "operacional" })?.msg).toMatch(/operacional/i);
    expect(avaliarImpasse({ ...base, setor: "departamento_pessoal" })?.msg).toMatch(
      /Departamento Pessoal/i,
    );
  });

  it("não age sobre o engine determinístico nem sobre conversa já encaminhada", () => {
    expect(avaliarImpasse({ ...base, fonte: "engine" })).toBeNull();
    expect(avaliarImpasse({ ...base, jaTransferiu: true })).toBeNull();
  });

  it("sem repetição, não há impasse", () => {
    expect(
      avaliarImpasse({ ...base, novaResposta: "Me passa o CNPJ para eu gerar a proposta formal?" }),
    ).toBeNull();
  });
});
