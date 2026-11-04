import { describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { runFallback } from "@/lib/agent/fallback";
import { detectarOndeEsta, lerCaso } from "@/lib/agent/triagem";
import { detectarIdioma } from "@/lib/agent/idioma";
import { findObjection } from "@/lib/agent/knowledge";
import { despedidaDoOptOut } from "@/lib/agent/opt-out";
import type { AgentTurn } from "@/lib/agent/runner";

// O checkup de novembro rodou o motor de reserva (o que responde quando o DeepSeek cai)
// numa bateria de conversas. Cada caso aqui é uma resposta errada que ele dava.

async function primeira(texto: string): Promise<string> {
  const conv = await getRepository().getOrCreateConversation(`sim:checkup-${Math.random()}`);
  const history: AgentTurn[] = [{ role: "user", content: texto }];
  return (await runFallback({ history, conversationId: conv.id, sombra: true })).reply;
}

describe("quem já chega contando o caso", () => {
  it("não recebe a saudação bilíngue genérica, e sim a próxima pergunta no idioma dela", async () => {
    const r = await primeira("Boa tarde, meu nome é Carlos, sou boliviano e moro em São Paulo há 6 anos");
    expect(r).not.toMatch(/Soy|Cuéntame/);
    expect(r).toMatch(/Imigrar Brasil/);
    expect(r.split("?").length - 1).toBeLessThanOrEqual(1);
  });

  it("em inglês, responde em inglês", async () => {
    const r = await primeira("Hi, I'm from Nigeria, I'm in Lagos and I want to study in Brazil");
    expect(r).toMatch(/I'm .+ from Imigrar Brasil/);
    expect(r).not.toMatch(/Aqui é|Soy/);
  });

  it("'oi' sozinho continua com a porta de entrada nos dois idiomas", async () => {
    const r = await primeira("oi");
    expect(r).toMatch(/Cuéntame/);
  });

  it("quem procura vaga vai para o RH, não para a entrevista de imigração", async () => {
    const r = await primeira("vocês tem vaga de emprego? sou advogada");
    expect(r).toMatch(/trabalhar com a Imigrar Brasil/);
    expect(r).not.toMatch(/nacionalidade|visto/i);
  });
});

describe("o exterior dito pelo nome do lugar", () => {
  it.each([
    ["Hola, soy de Colombia y estoy en Bogotá", "Exterior — Colômbia"],
    ["I'm in Lagos and I want to study in Brazil", "Exterior — Nigéria"],
    ["moro em Luanda com a minha família", "Exterior — Angola"],
  ])("%s", (texto, esperado) => {
    expect(detectarOndeEsta(texto)).toBe(esperado);
  });

  it.each([
    ["moro em Porto Alegre", "Brasil"],
    ["estou em Boa Vista", "Brasil — Boa Vista"],
    // A borda de palavra do JS não entende acento: "Corumbá" nunca fechava o \b.
    ["estou em Corumbá agora", "Brasil — Corumbá"],
  ])("cidade brasileira continua sendo Brasil: %s", (texto, inicio) => {
    expect(detectarOndeEsta(texto) ?? "").not.toMatch(/Exterior/);
    if (inicio.includes("—")) expect(detectarOndeEsta(texto)).toBe(inicio);
  });
});

describe("palavra-chave negada não é pergunta", () => {
  it("'não tenho prazo' não dispara a preocupação sobre prazo", () => {
    expect(findObjection("não tenho prazo")).toBeUndefined();
  });
});

describe("despedida do opt-out", () => {
  it("sai num idioma só, o da pessoa", () => {
    expect(despedidaDoOptOut("pt")).not.toMatch(/Entendido, no le/);
    expect(despedidaDoOptOut("es")).toMatch(/no le enviaremos/);
    expect(despedidaDoOptOut("en")).toMatch(/Understood/);
  });
});

describe("a triagem lê o que a pessoa respondeu", () => {
  it.each(["sem urgência nenhuma", "não tenho prazo", "no tengo prisa", "no deadline, just planning"])(
    "'%s' é sem pressa, nunca imediato",
    (t) => {
      expect(lerCaso(t).prazo).toBe("long");
    },
  );

  it("'quero me naturalizar' é naturalização", () => {
    expect(lerCaso("quero me naturalizar").objetivo).toContain("Naturalização");
  });

  it("espanhol curto com 'soy' e 'estoy' é espanhol", () => {
    expect(detectarIdioma("Hola, soy de Colombia y estoy en Bogotá")).toBe("es");
  });

  it("quem respondeu 'não tenho prazo' não é dispensado como curioso", async () => {
    const conv = await getRepository().getOrCreateConversation(`sim:checkup-${Math.random()}`);
    const history: AgentTurn[] = [
      { role: "user", content: "Boa tarde, meu nome é Carlos, sou boliviano e moro em São Paulo há 6 anos" },
      { role: "assistant", content: "Boa tarde! Aqui é a Cláudia, da Imigrar Brasil. O que você precisa resolver?" },
      { role: "user", content: "quero me naturalizar" },
      { role: "assistant", content: "Existe alguma data que torna o seu caso urgente?" },
      { role: "user", content: "não tenho prazo" },
    ];
    const r = (await runFallback({ history, conversationId: conv.id, sombra: true })).reply;
    expect(r).not.toMatch(/situação concreta|Obrigada pelo contato/);
  });
});
