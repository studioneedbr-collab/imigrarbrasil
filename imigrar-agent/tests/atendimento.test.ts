import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";

// ATENDIMENTOS REAIS, DE PONTA A PONTA.
//
// Cada bloco aqui nasceu de um defeito encontrado rodando conversas de verdade contra o
// app, não de uma ideia de teste. O caminho exercitado é o determinístico
// (lib/agent/fallback.ts), que é o que roda sem DEEPSEEK_API_KEY — inclusive nesta suíte.

let n = 0;
async function conversa(msgs: string[]) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(`sim:at-${++n}-${msgs.length}`);
  const respostas: string[] = [];
  let ultima: Awaited<ReturnType<typeof processMessage>> | null = null;
  for (const m of msgs) {
    ultima = await processMessage({ conversationId: conv.id, userText: m });
    respostas.push(ultima.reply);
  }
  const lead = await repo.getLeadByConversation(conv.id);
  return { respostas, ultima: ultima!, lead, conv };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("multi-idioma — o dossiê se preenche em qualquer língua", () => {
  // O dossiê ficava VAZIO para quem escrevia em espanhol: "soy venezolana" e "estoy en
  // São Paulo" não casavam com nada, e o advogado abria o painel sem uma linha — num
  // atendimento em que metade das pessoas não escreve em português.
  it("espanhol: lê nacionalidade, onde está e o que procura", async () => {
    const { lead } = await conversa([
      "hola, buenas",
      "quiero saber como puedo quedarme en Brasil",
      "estoy en Sao Paulo desde hace dos meses",
      "soy venezolana",
    ]);
    expect(lead?.clientType).toBe("Venezuela");
    expect(lead?.region).toMatch(/Brasil/);
    expect(lead?.servicesInterested).toContain("Regularização migratória");
  });

  it("inglês: idem, e a conversa inteira sai em inglês", async () => {
    const { respostas, lead } = await conversa([
      "hello",
      "what do you do?",
      "I am still abroad, in Angola",
      "I want to bring my wife to Brazil",
    ]);
    expect(lead?.clientType).toBe("Angola");
    expect(lead?.region).toMatch(/Exterior/);
    expect(lead?.servicesInterested).toContain("Reunião familiar");
    // Depois da saudação (bilíngue de propósito), nada mais sai em português.
    for (const r of respostas.slice(1)) {
      expect(r).not.toMatch(/você|nosso time|desculpa|me conta/i);
    }
  });

  it("espanhol: a pergunta seguinte também sai em espanhol", async () => {
    const { respostas } = await conversa(["hola, buenas", "quiero quedarme en Brasil"]);
    expect(respostas[1]).toMatch(/¿/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o que a Ana PODE responder", () => {
  it("'o que vocês fazem' recebe o institucional, não uma pergunta", async () => {
    const { respostas } = await conversa(["oi", "o que voces fazem?"]);
    expect(respostas[1].toLowerCase()).toMatch(/assessoria jur[íi]dica/);
  });

  // "o que é refúgio?" é pergunta geral e legítima. Ela dispara a regra de transbordo
  // (tema sensível), e antes o encaminhamento comia a pergunta: a pessoa recebia
  // "isso depende dos detalhes da sua situação" sem nunca saber o que é refúgio.
  it("explica o caminho em uma linha ANTES de encaminhar", async () => {
    const { respostas, ultima } = await conversa(["oi", "o que e refugio?"]);
    expect(respostas[1].toLowerCase()).toMatch(/prote[çc][ãa]o.*(pa[íi]s|persegui)/);
    expect(ultima.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });

  it("explica sem encaminhar quando o tema não é sensível", async () => {
    const { respostas, ultima } = await conversa(["oi", "o que e naturalizacao?"]);
    expect(respostas[1].toLowerCase()).toMatch(/estrangeir|brasileir/);
    expect(ultima.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o que a Ana NÃO pode responder", () => {
  // A pergunta mais comum de todas, e a que mais tenta o agente a inventar.
  it("lista de documentos: diz que não tem, em vez de perguntar outra coisa", async () => {
    const { respostas } = await conversa(["oi", "quais documentos preciso para reuniao familiar?"]);
    expect(respostas[1].toLowerCase()).toMatch(/time jur[íi]dico/);
    // E não inventa lista nenhuma.
    expect(respostas[1].toLowerCase()).not.toMatch(/certid[ãa]o|passaporte v[áa]lido|comprovante de/);
  });

  it("nunca informa honorários", async () => {
    for (const pergunta of ["quanto custa?", "quanto voces cobram?", "qual o valor do servico?"]) {
      const { respostas } = await conversa(["oi", pergunta]);
      expect(respostas[1], pergunta).not.toMatch(/R\$\s?\d/);
      expect(respostas[1].toLowerCase(), pergunta).toMatch(/time jur[íi]dico/);
    }
  });

  // Regra do prompt: não julgar, não dar sermão, e não deixar passar. Antes disto a
  // proposta de "dar um jeitinho" era respondida com uma pergunta de cadastro — que lido
  // de fora parece que a proposta foi aceita.
  it("pedido de contorno é recusado sem sermão", async () => {
    const { respostas } = await conversa(["oi", "tem como dar um jeitinho? conheco quem faca por fora"]);
    expect(respostas[1].toLowerCase()).toMatch(/n[ãa]o [ée] uma op[çc][ãa]o|caminho legal/);
    expect(respostas[1].toLowerCase()).not.toMatch(/crime|ilegal|proibido|voc[êe] n[ãa]o deveria/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a conversa não vira interrogatório", () => {
  // Três cumprimentos seguidos viravam três perguntas de cadastro enfileiradas, com
  // alguém que ainda não tinha dito nada.
  it("cumprimento repetido reconvida, não dispara a lista de perguntas", async () => {
    const { respostas } = await conversa(["oi", "oi", "ola", "tudo bem?"]);
    const depois = respostas.slice(1);
    expect(depois.filter((r) => /de qual pa[íi]s|algum prazo/i.test(r))).toHaveLength(0);
    // E os reconvites não se repetem palavra por palavra.
    expect(new Set(depois).size).toBe(depois.length);
  });

  it("monossílabos e teclado batido também não avançam a lista", async () => {
    const { respostas } = await conversa(["oi", "sim", "kadksd", "?????"]);
    expect(respostas.slice(1).filter((r) => /de qual pa[íi]s|algum prazo/i.test(r))).toHaveLength(0);
  });

  // A rede anti-repetição existe para detectar que o AGENTE travou. Diante de "oi", "sim",
  // "ta", repetir um convite é o certo — acusar impasse produzia um "acho que me embolei
  // aqui, desculpa" por algo que a Ana não fez.
  it("não pede desculpas por um impasse que não existe", async () => {
    const { respostas } = await conversa(["oi", "oi", "ola", "tudo bem?", "ok"]);
    for (const r of respostas) expect(r).not.toMatch(/me embolei/i);
  });

  // UMA PERGUNTA POR VEZ é regra do prompt. Quando o portão segurava o encaminhamento, a
  // resposta ("quer que eu peça para eles falarem com você?") vinha emendada com a
  // pergunta da triagem — duas de uma vez, que é o que faz a conversa parecer formulário.
  it("nunca manda duas perguntas na mesma mensagem", async () => {
    const casos = [
      ["oi", "tem como dar um jeitinho? conheco quem faca por fora"],
      ["oi", "quais documentos preciso para reuniao familiar?"],
      ["oi", "quanto voces cobram?"],
    ];
    for (const msgs of casos) {
      const { respostas } = await conversa(msgs);
      const perguntas = (respostas[1].match(/\?/g) ?? []).length;
      expect(perguntas, respostas[1]).toBeLessThanOrEqual(1);
    }
  });

  it("quem se despede não recebe mais uma pergunta", async () => {
    const { respostas } = await conversa(["oi", "era so isso mesmo, muito obrigado"]);
    expect(respostas[1]).not.toMatch(/\?/);
    expect(respostas[1].toLowerCase()).toMatch(/disposi[çc][ãa]o|chamar/);
  });

  it("não repete a pergunta que a pessoa acabou de responder", async () => {
    const { respostas } = await conversa([
      "oi",
      "estou fora do Brasil",
      "quero pedir visto de trabalho",
      "sou nigeriano",
    ]);
    const perguntasDeOnde = respostas.filter((r) => /j[áa] est[áa] no Brasil ou ainda/i.test(r));
    expect(perguntasDeOnde.length).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o caso chega ao time jurídico", () => {
  // Encaminhamento sem card é caso perdido: o advogado abria o painel e não via o caso em
  // lugar nenhum. E este é justamente o que menos pode sumir.
  it("caso urgente aparece no funil, não só na lista de conversas", async () => {
    const { lead, ultima } = await conversa([
      "estou com medo, sai do meu pais porque estavam me ameacando",
    ]);
    expect(ultima.status).toBe("transferred");
    expect(lead).toBeTruthy();
    expect(lead?.stage).toBe("transferido");
    expect(lead?.setor).toBe("comercial"); // o funil "comercial" é o do time jurídico
  });

  it("pedido explícito por uma pessoa também vira card", async () => {
    const { lead } = await conversa(["oi", "quero falar com uma pessoa de verdade"]);
    expect(lead?.stage).toBe("transferido");
  });

  // CHAMAR A TOOL NÃO É TER ENCAMINHADO. O portão recusa quando a conversa ainda não tem
  // caso nenhum; contar a chamada marcava a conversa como "transferida" no painel sem
  // ninguém ter sido chamado.
  it("encaminhamento recusado pelo portão NÃO marca a conversa como transferida", async () => {
    const { ultima } = await conversa(["oi", "tem como dar um jeitinho?"]);
    const chamada = ultima.toolCalls.find((t) => t.name === "transferir_para_humano");
    expect(chamada).toBeTruthy();
    if ((chamada!.result as { ok?: boolean })?.ok === false) {
      expect(ultima.status).not.toBe("transferred");
    }
  });

  it("depois de encaminhar, a Ana continua respondendo", async () => {
    const { respostas } = await conversa([
      "oi",
      "meu visto venceu",
      "e enquanto isso eu posso trabalhar?",
    ]);
    expect(respostas[2].length).toBeGreaterThan(20);
    expect(respostas[2]).not.toBe(respostas[1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("dado sensível e pedido de parar", () => {
  it("documento mandado por conta própria: agradece e não repete o número", async () => {
    const { respostas } = await conversa(["oi", "meu cpf e 111.444.777-35, pode anotar"]);
    expect(respostas[1]).not.toMatch(/111|444|777/);
    expect(respostas[1].toLowerCase()).toMatch(/n[ãa]o precisa/);
  });

  it("o dossiê nunca guarda o número do documento", async () => {
    const { lead } = await conversa(["oi", "meu cpf e 111.444.777-35"]);
    expect(JSON.stringify(lead ?? {})).not.toMatch(/111\.?444/);
  });

  // O que derruba um número de WhatsApp não é volume, é denúncia — e o caminho mais curto
  // para uma é a pessoa pedir para parar e continuar recebendo pergunta.
  it("quem pede para parar recebe despedida, não outra pergunta", async () => {
    const { respostas } = await conversa(["oi", "para de me mandar mensagem por favor"]);
    expect(respostas[1]).not.toMatch(/\?/);
    expect(respostas[1].toLowerCase()).toMatch(/n[ãa]o te mando mais/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("fora do escopo e vaga de emprego", () => {
  it("imigração para outro país sai do escopo sem indicar terceiros", async () => {
    for (const m of ["voces fazem visto americano?", "preciso de cidadania italiana"]) {
      const { respostas } = await conversa(["oi", m]);
      expect(respostas[1].toLowerCase(), m).toMatch(/imigra[çc][ãa]o para o brasil/);
      expect(respostas[1].toLowerCase(), m).not.toMatch(/recomendo|indico o|procure o/);
    }
  });

  it("candidato a vaga vai para o funil de RH, não para o jurídico", async () => {
    const { lead } = await conversa(["boa tarde, me chamo Erica e queria mandar meu curriculo"]);
    expect(lead?.setor).toBe("rh");
    expect(lead?.contactName).toBe("Erica");
  });
});
