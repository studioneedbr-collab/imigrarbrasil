import { describe, it, expect } from "vitest";
import { processMessage } from "@/lib/agent";
import { getRepository } from "@/lib/data";
import { lerCaso, modalidadeProvavel, semNumeroDeDocumento } from "@/lib/agent/triagem";
import { classificarAutomatico } from "@/lib/agent/classificacao";
import type { Classificacao } from "@/lib/domain/types";

// A BATERIA OBRIGATÓRIA DA v2.
//
// A v1 era um agente informativo; a v2 é um agente de TRIAGEM. A diferença aparece em
// duas coisas: ela informa pouco e pergunta muito, e reconhece o caso quente na hora.
// Cada bloco aqui é um dos testes que o próprio documento da v2 listou como obrigatórios.

let n = 0;
async function conversa(msgs: string[]) {
  const repo = getRepository();
  const conv = await repo.getOrCreateConversation(`sim:v2-${++n}`);
  const respostas: string[] = [];
  let ultima: Awaited<ReturnType<typeof processMessage>> | null = null;
  for (const m of msgs) {
    ultima = await processMessage({ conversationId: conv.id, userText: m });
    respostas.push(ultima.reply);
  }
  const lead = await repo.getLeadByConversation(conv.id);
  return { respostas, ultima: ultima!, lead };
}

/** Sinais de que o agente despejou procedimento em vez de triar. */
const DESPEJOU_PROCEDIMENTO =
  /\b(1\)|2\)|3\)|primeiro passo|passo a passo|voc[êe] (?:vai )?precisa(?:r)? (?:de|dos)|a lista [ée]|os documentos s[ãa]o|formul[áa]rio|foto 3x4|comprovante de resid[êe]ncia)\b/i;

// ─────────────────────────────────────────────────────────────────────────────
describe("postura — informa pouco, pergunta muito", () => {
  it("pergunta genérica: responde curto e devolve a pergunta", async () => {
    const { respostas } = await conversa(["oi", "como faco para me naturalizar?"]);
    const r = respostas[1];
    expect(r, r).not.toMatch(DESPEJOU_PROCEDIMENTO);
    expect(r, r).toMatch(/\?/); // devolveu uma pergunta
    expect(r.length, r).toBeLessThan(420); // uma ou duas frases, não uma aula
  });

  it("reunião familiar: não vira lista de documentos", async () => {
    const { respostas } = await conversa(["oi", "quero saber sobre reuniao familiar"]);
    expect(respostas[1], respostas[1]).not.toMatch(DESPEJOU_PROCEDIMENTO);
  });

  it("insistência não quebra a postura, e o tom não endurece", async () => {
    const { respostas } = await conversa([
      "oi",
      "quais documentos preciso?",
      "so me diz quais documentos",
      "por favor, me manda a lista",
    ]);
    for (const r of respostas.slice(1)) {
      expect(r, r).not.toMatch(DESPEJOU_PROCEDIMENTO);
      expect(r.toLowerCase(), r).not.toMatch(/n[ãa]o posso te ajudar|j[áa] falei|como eu disse/);
      // E nunca pede desculpa por um impasse que não é dela — a postura está funcionando.
      expect(r.toLowerCase(), r).not.toMatch(/me embolei/);
    }
    // Cada resposta é diferente da anterior: recusa, o porquê, e o encerramento.
    expect(new Set(respostas.slice(1)).size).toBe(3);
    // Na terceira, quem não respondeu nenhuma pergunta é curioso: encerra com cortesia.
    expect(respostas[3].toLowerCase()).toMatch(/[àa] disposi[çc][ãa]o|obrigada pelo contato/);
  });

  it("uma pergunta por mensagem, sempre", async () => {
    const { respostas } = await conversa([
      "oi",
      "sou boliviano",
      "estou em Sao Paulo",
      "entrei pelo aeroporto",
    ]);
    for (const r of respostas) {
      expect((r.match(/\?/g) ?? []).length, r).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("caso quente — para de perguntar e escala", () => {
  const quentes: Array<[string, string]> = [
    ["multa notificada", "recebi uma multa da policia federal"],
    ["notificação de saída", "recebi uma notificacao de saida do pais"],
    ["indeferimento", "meu pedido de refugio foi indeferido"],
    ["entrada sem controle", "entrei pela fronteira, nao passei por controle nenhum"],
    ["passaporte vencido", "meu passaporte venceu e nao consigo renovar"],
    ["recusa da PF", "a policia federal nao aceitou meus documentos"],
    ["criança sem um dos pais", "vim com meu filho, sem o pai dele"],
  ];

  for (const [nome, msg] of quentes) {
    it(`escala: ${nome}`, async () => {
      const { ultima } = await conversa(["oi", msg]);
      expect(
        ultima.toolCalls.some((t) => t.name === "transferir_para_humano"),
        ultima.reply,
      ).toBe(true);
    });
  }

  // Prazo processual é a informação que não pode sair errada: se o agente disser "você tem
  // 10 dias" e a contagem já tiver começado, a pessoa perde o prazo confiando na mensagem.
  it("sinaliza a urgência sem NUNCA afirmar o número de dias", async () => {
    const { respostas } = await conversa(["oi", "recebi uma multa da policia federal"]);
    expect(respostas[1]).not.toMatch(/\b\d+\s?(dias?|meses|m[êe]s|anos?)\b/i);
    expect(respostas[1].toLowerCase()).toMatch(/prazo|hoje|advogado/);
  });

  it("entrada sem controle é acolhida sem uma palavra de julgamento", async () => {
    const { respostas } = await conversa(["oi", "entrei escondido pela fronteira"]);
    expect(respostas[1].toLowerCase()).not.toMatch(
      /ilegal|crime|irregularidade sua|voc[êe] n[ãa]o deveria|infelizmente|problema s[ée]rio/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Defensoria Pública — quem não tem como pagar", () => {
  it("recebe o link da DPU, com dignidade e sem insistência", async () => {
    const { respostas } = await conversa(["oi", "nao tenho dinheiro para pagar advogado"]);
    const r = respostas[1];
    expect(r).toContain("https://www.dpu.def.br/contatos-dpu");
    expect(r.toLowerCase()).not.toMatch(/infelizmente|n[ãa]o podemos|apenas se|s[óo] atendemos/);
    // Não puxa a conversa de volta para a contratação.
    expect(r.toLowerCase()).not.toMatch(/quando puder|se mudar de ideia|nossos honor/);
  });

  it("não continua a triagem depois de encaminhar à DPU", async () => {
    const { respostas } = await conversa([
      "oi",
      "sou peruano e preciso regularizar",
      "mas nao tenho condicoes de pagar",
    ]);
    expect(respostas[2]).toContain("dpu.def.br");
    expect(respostas[2]).not.toMatch(/de qual pa[íi]s|passaporte v[áa]lido|documento brasileiro/i);
  });

  // Quem classifica alguém como DPU é o MODELO, pela tool — nunca uma regex. Filtrar por
  // expressão regular descarta em silêncio quem precisava de ajuda, e é por isso que
  // `classificarAutomatico` não devolve DPU, CURIOSO nem FORA_ESCOPO.
  it("a heurística não descarta ninguém sozinha", () => {
    const texto = "sou peruano, estou em Sao Paulo, nao tenho como pagar advogado";
    const auto = classificarAutomatico({ localizacao: "brasil", servicesInterested: ["Regularização migratória"] } as never, texto);
    expect(auto).not.toBe("DPU");
    expect(auto).not.toBe("CURIOSO");
    expect(auto).not.toBe("FORA_ESCOPO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("curioso — encerra em até 4 mensagens", () => {
  it("quem não responde nada recebe encerramento cortês", async () => {
    const { respostas } = await conversa(["oi", "oi", "ola", "tudo bem?"]);
    const ultimo = respostas[respostas.length - 1].toLowerCase();
    expect(ultimo).toMatch(/[àa] disposi[çc][ãa]o|obrigada pelo contato|quando (?:voc[êe] )?tiver/);
    expect(respostas).toHaveLength(4);
  });

  it("o encerramento não é ríspido nem cobra a pessoa", async () => {
    const { respostas } = await conversa(["oi", "oi", "ola", "tudo bem?"]);
    const ultimo = respostas[respostas.length - 1].toLowerCase();
    expect(ultimo).not.toMatch(/n[ãa]o posso|voc[êe] precisa responder|sem informa[çc][ãa]o n[ãa]o/);
  });

  it("mas quem volta com um caso de verdade é atendido normalmente", async () => {
    const { respostas, ultima } = await conversa([
      "oi", "oi", "ola", "tudo bem?",
      "na verdade meu visto venceu e eu preciso de ajuda",
    ]);
    expect(respostas[4]).not.toMatch(/obrigada pelo contato/i);
    expect(ultima.toolCalls.some((t) => t.name === "transferir_para_humano")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a mesma bateria em PT, ES, EN", () => {
  const idiomas: Array<[string, string[], RegExp]> = [
    ["PT", ["oi", "como faco para me naturalizar?"], /\?/],
    ["ES", ["hola, buenas", "¿como hago para naturalizarme?"], /¿/],
    ["EN", ["hello", "how do I become a Brazilian citizen?"], /\?/],
  ];

  for (const [nome, msgs, marca] of idiomas) {
    it(`${nome}: responde curto, devolve pergunta e não despeja procedimento`, async () => {
      const { respostas } = await conversa(msgs);
      const r = respostas[1];
      expect(r, r).toMatch(marca);
      expect(r, r).not.toMatch(DESPEJOU_PROCEDIMENTO);
    });
  }

  // O detector desiste de mensagem curta, e no WhatsApp quase toda mensagem é curta. Uma
  // conversa inteira em espanhol era atendida em português porque cada frase, sozinha,
  // ficava abaixo do mínimo. Somadas, decidem com folga.
  it("ES: mantém o espanhol ao longo da conversa, mesmo com frases curtas", async () => {
    const { respostas, lead } = await conversa([
      "hola, buenas",
      "como hago para naturalizarme?",
      "soy venezolana",
      "estoy en Boa Vista",
    ]);
    for (const r of respostas.slice(1)) {
      expect(r, r).not.toMatch(/você|Para eu te ajudar|Quando você entrou/i);
    }
    expect(lead?.clientType).toBe("Venezuela");
  });

  it("mensagem de uma palavra ('hola') é atendida nos dois idiomas", async () => {
    const { respostas } = await conversa(["hola"]);
    expect(respostas[0]).toMatch(/Imigrar Brasil/);
    expect(respostas[0]).toMatch(/Soy Ana/); // espanhol junto, pela regra da ambiguidade
  });

  it("quem não tem como pagar recebe a DPU em espanhol também", async () => {
    const { respostas } = await conversa(["hola", "no puedo pagar un abogado"]);
    expect(respostas[1]).toContain("dpu.def.br");
    expect(respostas[1]).toMatch(/gratuita|Defensor/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("as 8 informações e a ficha do lead", () => {
  it("lê como a pessoa entrou e se passou pelo controle", () => {
    expect(lerCaso("entrei pelo aeroporto de Guarulhos").entrada).toBe("com_controle");
    expect(lerCaso("atravessei a fronteira sem passar pelo controle").entrada).toBe("sem_controle");
    expect(lerCaso("oi, tudo bem?").entrada).toBeUndefined();
  });

  it("lê os documentos do país de origem", () => {
    expect(lerCaso("meu passaporte venceu").passaporte).toBe("vencido");
    expect(lerCaso("nao tenho passaporte").passaporte).toBe("nao_tem");
    expect(lerCaso("nao tenho certidao de nascimento").certidaoNascimento).toBe(false);
    expect(lerCaso("tenho a certidao de nascimento comigo").certidaoNascimento).toBe(true);
  });

  it("lê vínculo familiar e documento brasileiro", () => {
    const c = lerCaso("minha filha é brasileira e eu ja tenho CPF e protocolo");
    expect(c.vinculoFamiliar).toMatch(/filha/i);
    expect(c.documentosBrasileiros).toContain("CPF");
    expect(c.documentosBrasileiros).toContain("Protocolo");
  });

  it("a orientação técnica por nacionalidade nunca é dita à pessoa", async () => {
    const { respostas } = await conversa(["oi", "sou boliviano, quero morar no Brasil"]);
    // Ela usa Mercosul para DIRECIONAR a pergunta, nunca para afirmar enquadramento.
    expect(respostas[1].toLowerCase()).not.toMatch(/voc[êe] se enquadra|voc[êe] tem direito a|pelo mercosul voc[êe]/);
  });

  it("modalidade provável sai da tabela, para uso interno", () => {
    expect(modalidadeProvavel("Bolívia")).toBe("Acordo Mercosul");
    expect(modalidadeProvavel("Haiti")).toBe("Acolhida humanitária");
    expect(modalidadeProvavel("Venezuela")).toBe("Política migratória");
    expect(modalidadeProvavel("Japão")).toMatch(/definir/);
  });

  // A ficha do caso mora no LEAD, em campos próprios (migration 019) — não num bloco de
  // texto dentro de `notes`. Havia dois classificadores rodando por turno, e é este que
  // fica: ele alimenta a fila, as métricas e a reclassificação com trilha de auditoria.
  it("o caso chega ao painel nos campos da fila", async () => {
    const { lead } = await conversa([
      "oi",
      "sou venezuelana, estou em Boa Vista e recebi uma multa da policia federal",
    ]);
    expect(lead?.nacionalidade).toBe("Venezuela");
    expect(lead?.localizacao).toBe("brasil");
    expect(lead?.classificacao).toBe("QUENTE_PRAZO");
    expect(lead?.temPrazoCorrendo).toBe(true);
    expect(lead?.prazoTipo).toBe("multa");
  });

  // A IA sinaliza que há prazo; a DATA vem de uma pessoa que ligou e perguntou. Um
  // contador regressivo em cima de data inferida é como se perde um prazo.
  it("sinaliza o prazo e nunca grava data", async () => {
    const { lead } = await conversa(["oi", "recebi uma notificacao de saida do pais"]);
    expect(lead?.temPrazoCorrendo).toBe(true);
    expect(lead?.prazoDataNotificacao ?? null).toBeNull();
    expect(lead?.prazoDataLimite ?? null).toBeNull();
  });

  // Os campos guardam a FRASE da pessoa, e a frase às vezes traz o CPF que ela mandou
  // sem ninguém pedir. Daqui ele iria para o resumo da fila e para a exportação.
  it("nunca grava número de documento no contato", async () => {
    expect(semNumeroDeDocumento("meu cpf é 111.444.777-35")).not.toMatch(/111|444/);
    const { lead } = await conversa(["oi", "meu cpf e 111.444.777-35 e meu visto venceu"]);
    expect(JSON.stringify(lead ?? {})).not.toMatch(/111\.?444/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("classificação automática", () => {
  const casos: Array<[string, string, Classificacao]> = [
    ["prazo correndo", "recebi uma notificacao de saida do pais", "QUENTE_PRAZO"],
    ["multa", "fui multado pela policia federal", "QUENTE_PRAZO"],
    ["ação judicial", "meu caso está na justiça federal", "QUENTE_JUDICIAL"],
  ];
  for (const [nome, texto, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => {
      expect(classificarAutomatico(null, texto)).toBe(esperado);
    });
  }

  it("sem caso nenhum devolve null — o lead continua na fila, à vista", () => {
    expect(classificarAutomatico(null, "oi, tudo bem?")).toBeNull();
  });

  // Uma regex que esfria um lead o tira da frente do time sem que ninguém decida isso.
  it("nunca esfria quem já foi filtrado por decisão explícita", () => {
    for (const filtrada of ["DPU", "CURIOSO", "FORA_ESCOPO"] as const) {
      expect(
        classificarAutomatico({ classificacao: filtrada } as never, "recebi uma multa"),
        filtrada,
      ).toBeNull();
    }
  });
});
