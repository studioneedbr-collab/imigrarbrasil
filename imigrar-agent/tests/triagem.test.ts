import { describe, it, expect } from "vitest";
import {
  extractSlots,
  detectarNacionalidade,
  detectarOndeEsta,
  detectarCaminhos,
  detectarSituacao,
} from "@/lib/agent/triagem";

// A extração herdada procurava função de limpeza, quantidade de postos, CNPJ e bairro do
// Rio. Aqui ela procura o que o advogado precisa: de onde a pessoa é, onde ela está, o
// que ela quer conseguir, como entrou e se há prazo.

describe("nacionalidade", () => {
  it("lê o gentílico quando a pessoa fala dela mesma", () => {
    expect(detectarNacionalidade("sou venezuelana e cheguei ano passado")).toBe("Venezuela");
    expect(detectarNacionalidade("sou haitiano")).toBe("Haiti");
    expect(detectarNacionalidade("vim da Bolívia")).toBe("Bolívia");
  });

  it("não atribui à pessoa a nacionalidade de outra alguém", () => {
    expect(detectarNacionalidade("meu marido é sírio e quero trazê-lo")).toBeUndefined();
    expect(detectarNacionalidade("um amigo colombiano me indicou vocês")).toBeUndefined();
  });

  // A regra de idioma do prompt é explícita nisto, e a heurística tem que respeitar:
  // quem escreve em espanhol pode ser de qualquer um de vinte países.
  it("não deduz nacionalidade do idioma da mensagem", () => {
    expect(detectarNacionalidade("hola, necesito ayuda con mi residencia")).toBeUndefined();
  });
});

describe("onde a pessoa está agora", () => {
  it("reconhece quem já está no Brasil, com a cidade quando ela diz", () => {
    expect(detectarOndeEsta("estou no Brasil desde março")).toBe("Brasil");
    expect(detectarOndeEsta("moro em São Paulo")).toBe("Brasil — São Paulo");
  });

  it("reconhece quem ainda está fora, e nomeia o país quando dá", () => {
    expect(detectarOndeEsta("ainda estou no exterior, sou angolano")).toBe("Exterior — Angola");
    expect(detectarOndeEsta("estou fora do Brasil")).toBe("Exterior");
  });

  it("não chuta quando a pessoa não disse", () => {
    expect(detectarOndeEsta("quero saber sobre reunião familiar")).toBeUndefined();
  });
});

describe("o que a pessoa procura", () => {
  it("reconhece os caminhos que a Imigrar Brasil atende", () => {
    expect(detectarCaminhos("preciso pedir refúgio")).toEqual(["Refúgio"]);
    expect(detectarCaminhos("quero trazer minha esposa para o Brasil")).toEqual(["Reunião familiar"]);
    expect(detectarCaminhos("como faço para virar brasileiro?")).toEqual(["Naturalização"]);
    expect(detectarCaminhos("tenho direito pelo Mercosul?")).toEqual(["Residência pelo Mercosul"]);
  });

  it("acumula quando a pessoa cita mais de um", () => {
    const c = detectarCaminhos("quero regularizar minha residência e depois pedir naturalização");
    expect(c).toContain("Regularização migratória");
    expect(c).toContain("Naturalização");
  });

  it("não inventa caminho onde não há", () => {
    expect(detectarCaminhos("bom dia, tudo bem?")).toEqual([]);
  });

  // "Visto", neste domínio, é o pedido feito no consulado por quem ainda está fora. Quem
  // já está aqui com o documento vencido está no caminho oposto — e o rótulo errado manda
  // o advogado abrir a conversa esperando o problema errado.
  it("documento vencido é regularização, não pedido de visto", () => {
    const c = detectarCaminhos("meu visto venceu faz três meses");
    expect(c).toEqual(["Regularização migratória"]);
    expect(detectarCaminhos("estou irregular")).toContain("Regularização migratória");
  });

  it("mas quem vai pedir visto no consulado continua sendo Visto", () => {
    const c = detectarCaminhos("meu passaporte venceu e preciso solicitar o visto no consulado");
    expect(c).toContain("Visto");
    expect(c).toContain("Regularização migratória");
  });
});

describe("como entrou / o que tem hoje", () => {
  it("guarda a frase da pessoa, não uma classificação", () => {
    const s = detectarSituacao("Entrei pela fronteira de Pacaraima em 2024. Tenho protocolo.");
    expect(s).toMatch(/Entrei pela fronteira/);
  });

  it("reconhece o documento vencido, que é o sinal mais comum aqui", () => {
    expect(detectarSituacao("meu visto venceu faz três meses")).toMatch(/venceu/);
  });

  it("silencia quando não há sinal nenhum", () => {
    expect(detectarSituacao("oi, tudo bem?")).toBeUndefined();
  });

  // O chamador passa a conversa inteira, com as mensagens unidas por dois espaços. Sem
  // cortar aí, o painel mostrava ao advogado "oi  sou venezuelana, moro em Boa Vista e
  // meu visto venceu" como se fosse uma frase só.
  it("não gruda a mensagem anterior na situação", () => {
    const s = detectarSituacao("oi  sou venezuelana, moro em Boa Vista e meu visto venceu faz tres meses");
    expect(s).not.toMatch(/^oi/);
    expect(s).toMatch(/^sou venezuelana/);
  });
});

describe("prazo", () => {
  it("prazo correndo é urgência imediata", () => {
    expect(extractSlots("tenho 30 dias para responder uma exigência").urgency).toBeTruthy();
    expect(extractSlots("meu prazo está correndo, é urgente").urgency).toBe("immediate");
  });

  it("quem está só pesquisando não vira urgência", () => {
    expect(extractSlots("estou só pesquisando, sem pressa").urgency).toBe("long");
  });
});

describe("extractSlots junta tudo", () => {
  it("lê nome, nacionalidade, onde está, o que quer e o prazo de uma vez", () => {
    const s = extractSlots(
      "Meu nome é Yolanda, sou venezuelana, moro em Boa Vista e preciso regularizar minha residência. É urgente.",
    );
    expect(s.name).toBe("Yolanda");
    expect(s.nacionalidade).toBe("Venezuela");
    expect(s.ondeEsta).toBe("Brasil — Boa Vista");
    expect(s.caminhos).toContain("Regularização migratória");
    expect(s.urgency).toBe("immediate");
  });

  it("pega o e-mail quando a pessoa oferece", () => {
    expect(extractSlots("pode me escrever em yolanda@exemplo.com").email).toBe("yolanda@exemplo.com");
  });

  // NUNCA peça documento é regra do prompt — e a extração não guarda número de documento
  // nem por acidente. O que ela lê da frase é o CONTEXTO, não o número.
  it("não guarda número de documento", () => {
    const s = extractSlots("meu CPF é 111.444.777-35");
    expect(JSON.stringify(s)).not.toMatch(/111\.?444/);
  });
});
