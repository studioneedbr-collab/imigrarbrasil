import { describe, it, expect } from "vitest";
import {
  avaliarImpasse,
  ehFechamentoCordial,
  ehRepeticao,
  similaridade,
} from "@/lib/agent/anti-loop";

// A Ana reformulando a MESMA pergunta de triagem sem sair do lugar. Num atendimento
// comercial isso custava uma proposta; aqui custa o atendimento inteiro — quem está com
// um prazo correndo lê a terceira mensagem repetida como não estar sendo ouvido, e some.
const TRIAGEM_1 =
  "Para eu te ajudar com o seu caso, preciso entender melhor a sua situação. Você já está no Brasil ou ainda está no exterior, e como foi a sua entrada no país? 😊";
const TRIAGEM_2 =
  "Deixa eu entender melhor a sua situação para poder te ajudar. Você já está no Brasil ou ainda está no exterior? E como foi a sua entrada no país?";

describe("rede anti-repetição", () => {
  it("pega a mesma mensagem reenviada", () => {
    expect(ehRepeticao(TRIAGEM_1, [TRIAGEM_1])).toBe(true);
  });

  it("pega a mesma ideia reescrita com outras palavras", () => {
    expect(similaridade(TRIAGEM_1, TRIAGEM_2)).toBeGreaterThan(0.6);
    expect(ehRepeticao(TRIAGEM_1, [TRIAGEM_2, TRIAGEM_1])).toBe(true);
  });

  it("ignora acento, emoji e pontuação", () => {
    expect(
      ehRepeticao("Me confirma a sua nacionalidade para eu registrar certinho? 😊", [
        "Me confirma a sua nacionalidade, para eu registrar certinho.",
      ]),
    ).toBe(true);
  });

  it("não acusa respostas de assuntos diferentes", () => {
    expect(
      ehRepeticao(
        "Reunião familiar é o caminho de quem quer trazer para perto cônjuge, filhos ou pais.",
        ["Me conta de quem se trata, para o time jurídico já saber o contexto do seu caso."],
      ),
    ).toBe(false);
  });

  it("não acusa confirmação curta repetida", () => {
    expect(ehRepeticao("Entendi 😊", ["Entendi 😊"])).toBe(false);
  });

  it("só olha as três últimas respostas", () => {
    const outras = ["a) o que é refúgio", "b) onde você está hoje", "c) caso encaminhado"];
    expect(ehRepeticao(TRIAGEM_1, [...outras, TRIAGEM_1])).toBe(false);
  });
});

// Quem chega aqui se despede assim: "muito obrigado, só Deus sabe o que estou passando".
// A repetição da tranquilização depois disso é o desfecho CERTO, não um impasse — sem esta
// distinção, o agradecimento virava chamado para uma pessoa que não tinha nada a fazer.
const RH_TRANQUILIZA =
  "Anotei aqui o seu interesse em fazer parte do time. Assim que abrir uma vaga na sua área, quem cuida das vagas aqui entra em contato com você 😊";
const RH_REPETE =
  "Já registrei o seu interesse em fazer parte do time. Quando abrir uma vaga na sua área, quem cuida das vagas aqui entra em contato com você.";

describe("fechamento cordial", () => {
  it("reconhece o agradecimento mesmo escrito torto ('o brigado')", () => {
    expect(
      ehFechamentoCordial("muito o brigado só Deus sabe o que eu estou passando"),
    ).toBe(true);
  });

  it("reconhece despedidas curtas", () => {
    expect(ehFechamentoCordial("valeu, obrigada! 😊")).toBe(true);
    expect(ehFechamentoCordial("Deus te abençoe")).toBe(true);
  });

  it("não conta como fechamento quando ainda há pedido em aberto", () => {
    expect(ehFechamentoCordial("obrigado! mas ainda preciso saber do prazo")).toBe(false);
    expect(ehFechamentoCordial("obrigada, e o meu protocolo?")).toBe(false);
  });

  it("mensagem sem agradecimento nenhum não é fechamento", () => {
    expect(ehFechamentoCordial("meu visto vence semana que vem")).toBe(false);
  });
});

describe("impasse — para quem vai o atendimento travado", () => {
  const base = {
    novaResposta: TRIAGEM_1,
    respostasAnteriores: [TRIAGEM_2, TRIAGEM_1],
    ultimaMensagemDoCliente: "já respondi isso, estou no Brasil",
    setor: "comercial" as const,
    fonte: "deepseek" as const,
    jaTransferiu: false,
    // Qualificação fechada: o caso raro em que, mesmo com tudo na mão, ela travou.
    // Aí sim uma pessoa entra.
    faltamNoDossie: [] as string[],
  };

  it("atendimento de imigração travado vai para o time jurídico, como urgente", () => {
    const r = avaliarImpasse(base);
    expect(r?.acao).toBe("encaminhar");
    expect(r?.setor).toBe("comercial"); // o funil "comercial" é o do time jurídico
    expect(r?.priority).toBe("urgent");
    expect(r?.msg).toMatch(/jurídico/i);
  });

  // Travar com a qualificação pela metade não é motivo para chamar ninguém: o mais
  // provável é que ela tenha se enrolado numa pergunta.
  it("qualificação pela metade NÃO encaminha: pede o que falta", () => {
    const r = avaliarImpasse({
      ...base,
      faltamNoDossie: ["a nacionalidade", "se há prazo ou urgência"],
    });
    expect(r?.acao).toBe("destravar");
    expect(r?.msg).toMatch(/nacionalidade/i);
    expect(r?.msg).not.toMatch(/encaminh|chamei/i);
  });

  it("fora do expediente, promete o retorno na hora certa em vez de 'já chamei alguém'", () => {
    const r = avaliarImpasse({ ...base, proximoRetorno: "na segunda-feira a partir das 8h" });
    expect(r?.msg).toMatch(/segunda-feira a partir das 8h/);
    expect(r?.msg).not.toMatch(/Já chamei/);
  });

  it("nunca mais oferece 'os valores exatos' de um humano", () => {
    expect(avaliarImpasse(base)?.msg).not.toMatch(/valores exatos|proposta|orçamento/i);
  });

  it("candidato a vaga NUNCA cai na fila do jurídico nem ouve falar do caso dele", () => {
    const r = avaliarImpasse({
      ...base,
      novaResposta: RH_REPETE,
      respostasAnteriores: [RH_TRANQUILIZA],
      ultimaMensagemDoCliente: "eu preciso muito dessa vaga",
      setor: "rh",
    });
    expect(r?.setor).toBe("rh");
    expect(r?.priority).toBe("normal");
    expect(r?.msg).toMatch(/vagas/i);
    expect(r?.msg).not.toMatch(/jurídico/i);
  });

  it("o agradecimento no fim não vira transferência nenhuma", () => {
    expect(
      avaliarImpasse({
        ...base,
        novaResposta: RH_REPETE,
        respostasAnteriores: [RH_TRANQUILIZA],
        ultimaMensagemDoCliente: "muito obrigado, só Deus sabe o que eu estou passando",
        setor: "rh",
      }),
    ).toBeNull();
  });

  it("respeita o setor da conversa e nunca promete quem não existe", () => {
    expect(avaliarImpasse({ ...base, setor: "operacional" })?.msg).toMatch(/nosso time/i);
    expect(avaliarImpasse({ ...base, setor: "departamento_pessoal" })?.msg).toMatch(
      /administrativo/i,
    );
  });

  it("não age sobre conversa já encaminhada", () => {
    expect(avaliarImpasse({ ...base, jaTransferiu: true })).toBeNull();
  });

  // A rede valia só para o modelo enquanto o caminho determinístico era um menu, que
  // repete a tela de propósito. Sem menu, repetição ali é o mesmo defeito — e foi
  // exatamente o que apareceu no primeiro teste real: a mesma pergunta duas vezes
  // seguidas, logo depois de a pessoa tê-la respondido.
  it("cobre também o caminho sem LLM", () => {
    expect(avaliarImpasse({ ...base, fonte: "fallback" })?.acao).toBe("encaminhar");
  });

  it("sem repetição, não há impasse", () => {
    expect(
      avaliarImpasse({
        ...base,
        novaResposta: "Me confirma a sua nacionalidade para eu registrar no seu atendimento?",
      }),
    ).toBeNull();
  });
});
