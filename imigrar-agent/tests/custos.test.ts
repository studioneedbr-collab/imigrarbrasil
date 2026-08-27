import { describe, it, expect, afterEach } from "vitest";
import { custoDaChamada } from "@/lib/custos/precos";
import { resumirCustos, saudeDoProvedor } from "@/lib/custos/resumo";
import { cambio, emReais } from "@/lib/custos/cambio";
import type { ChamadaLlm } from "@/lib/domain/types";

const DE = new Date("2026-08-01T00:00:00Z");
const ATE = new Date("2026-08-31T23:59:59Z");

const chamada = (patch: Partial<ChamadaLlm> = {}): ChamadaLlm => ({
  id: "c1",
  provedor: "deepseek",
  modelo: "deepseek-chat",
  tipo: "redacao",
  conversationId: "conv1",
  tokensEntrada: 1_000_000,
  tokensSaida: 0,
  custoUsd: 0.27,
  precoConhecido: true,
  ok: true,
  criadoEm: "2026-08-10T12:00:00Z",
  ...patch,
});

describe("o preço de uma chamada", () => {
  it("cobra entrada e saída por milhão de tokens", () => {
    const c = custoDaChamada({
      modelo: "deepseek-chat",
      tipo: "redacao",
      tokensEntrada: 1_000_000,
      tokensSaida: 1_000_000,
    });
    expect(c.conhecido).toBe(true);
    expect(c.usd).toBeCloseTo(0.27 + 1.1, 6);
  });

  it("cobra transcrição por tempo de áudio, não por token", () => {
    const c = custoDaChamada({ modelo: "whisper-1", tipo: "transcricao", segundos: 120 });
    expect(c.usd).toBeCloseTo(0.012, 6); // 2 minutos
  });

  it("modelo fora da tabela é DESCONHECIDO, não grátis", () => {
    // A distinção é o ponto: somar zero calado faria o custo sumir no dia em que
    // alguém trocasse o modelo — exatamente quando a tela mais precisa avisar.
    const c = custoDaChamada({ modelo: "modelo-novo-de-alguem", tipo: "redacao", tokensEntrada: 9_000_000 });
    expect(c.conhecido).toBe(false);
    expect(c.usd).toBe(0);
  });

  it("transcrição sem duração é desconhecida, e não zero", () => {
    const c = custoDaChamada({ modelo: "whisper-1", tipo: "transcricao", segundos: null });
    expect(c.conhecido).toBe(false);
  });
});

describe("o custo do período", () => {
  it("o número que fecha preço é o custo MÉDIO POR CONVERSA", () => {
    const r = resumirCustos(
      [
        chamada({ id: "a", conversationId: "c1", custoUsd: 0.1 }),
        chamada({ id: "b", conversationId: "c1", custoUsd: 0.1 }),
        chamada({ id: "c", conversationId: "c2", custoUsd: 0.2 }),
      ],
      new Map(),
      DE,
      ATE,
    );
    expect(r.conversas).toBe(2);
    expect(r.mediaPorConversaUsd).toBeCloseTo(0.2, 6);
  });

  it("chamada sem conversa entra no total, mas não na média por conversa", () => {
    // Busca feita por alguém do time no painel é custo real — mas dividir por conversa
    // incluindo esse trabalho inventaria um custo de atendimento que não existe.
    const r = resumirCustos(
      [
        chamada({ id: "a", conversationId: "c1", custoUsd: 0.1 }),
        chamada({ id: "b", conversationId: null, tipo: "embedding", custoUsd: 0.9 }),
      ],
      new Map(),
      DE,
      ATE,
    );
    expect(r.totalUsd).toBeCloseTo(1.0, 6);
    expect(r.conversas).toBe(1);
    expect(r.mediaPorConversaUsd).toBeCloseTo(0.1, 6);
  });

  it("a chamada que falhou continua custando", () => {
    // O provedor cobra tentativa, não sucesso. Tirar as falhas faria o custo cair
    // justamente no dia em que o provedor está instável — o dia em que ele mais custa.
    const r = resumirCustos([chamada({ ok: false, custoUsd: 0.5 })], new Map(), DE, ATE);
    expect(r.totalUsd).toBeCloseTo(0.5, 6);
  });

  it("quebra o custo por idioma, com média por conversa de cada um", () => {
    const idiomas = new Map([["c1", "pt"], ["c2", "ht"], ["c3", "ht"]]);
    const r = resumirCustos(
      [
        chamada({ id: "a", conversationId: "c1", custoUsd: 0.1 }),
        chamada({ id: "b", conversationId: "c2", custoUsd: 0.4 }),
        chamada({ id: "c", conversationId: "c3", custoUsd: 0.2 }),
      ],
      idiomas,
      DE,
      ATE,
    );
    const ht = r.porIdioma.find((l) => l.chave === "ht");
    expect(ht?.conversas).toBe(2);
    expect(ht?.mediaUsd).toBeCloseTo(0.3, 6);
    expect(r.porIdioma.find((l) => l.chave === "pt")?.mediaUsd).toBeCloseTo(0.1, 6);
  });

  it("conversa sem idioma detectado aparece como '—' em vez de sumir", () => {
    const r = resumirCustos([chamada({ conversationId: "c9" })], new Map(), DE, ATE);
    expect(r.porIdioma.map((l) => l.chave)).toEqual(["—"]);
  });

  it("quebra por modelo e por tipo — é como se confere se o modelo barato está em uso", () => {
    const r = resumirCustos(
      [
        chamada({ id: "a", modelo: "deepseek-chat", tipo: "redacao", custoUsd: 1 }),
        chamada({ id: "b", modelo: "whisper-1", tipo: "transcricao", custoUsd: 0.05, provedor: "openai" }),
        chamada({ id: "c", modelo: "whisper-1", tipo: "transcricao", custoUsd: 0.05, provedor: "openai" }),
      ],
      new Map(),
      DE,
      ATE,
    );
    expect(r.porModelo[0].chave).toBe("deepseek-chat");
    expect(r.porModelo.find((m) => m.chave === "whisper-1")?.chamadas).toBe(2);
    expect(r.porTipo.map((t) => t.tipo).sort()).toEqual(["redacao", "transcricao"]);
  });

  it("chamada sem preço conhecido é contada à parte, e não soma zero em silêncio", () => {
    const r = resumirCustos(
      [chamada({ precoConhecido: false, custoUsd: 0, modelo: "modelo-desconhecido" })],
      new Map(),
      DE,
      ATE,
    );
    expect(r.semPreco).toBe(1);
    expect(r.totalUsd).toBe(0);
  });

  it("ignora o que está fora do período escolhido", () => {
    const r = resumirCustos([chamada({ criadoEm: "2026-07-01T12:00:00Z" })], new Map(), DE, ATE);
    expect(r.chamadas).toBe(0);
    expect(r.mediaPorConversaUsd).toBeNull();
  });
});

describe("a saúde de um provedor", () => {
  const agora = new Date("2026-08-20T12:00:00Z");
  const ontem = new Date(agora.getTime() - 24 * 3600_000);

  it("um provedor configurado e SEM CHAMADAS nas 24h aparece com zero", () => {
    // É o sintoma de roteamento que não está usando o provedor — e o antigo painel não
    // tinha como mostrar isso: chave presente parecia provedor em uso.
    const s = saudeDoProvedor([chamada({ provedor: "openai", criadoEm: "2026-08-01T12:00:00Z" })], "openai", ontem);
    expect(s.chamadas24h).toBe(0);
    expect(s.ultimaOk).toBe("2026-08-01T12:00:00Z"); // mas a última vez que funcionou continua visível
  });

  it("conta falhas das 24h e diz para que o provedor está sendo usado", () => {
    const s = saudeDoProvedor(
      [
        chamada({ provedor: "deepseek", tipo: "redacao", criadoEm: "2026-08-20T10:00:00Z" }),
        chamada({ provedor: "deepseek", tipo: "extracao", criadoEm: "2026-08-20T11:00:00Z" }),
        chamada({ provedor: "deepseek", ok: false, criadoEm: "2026-08-20T11:30:00Z" }),
      ],
      "deepseek",
      ontem,
    );
    expect(s.chamadas24h).toBe(3);
    expect(s.falhas24h).toBe(1);
    expect(s.usos.sort()).toEqual(["extracao", "redacao"]);
  });
});

describe("o dólar", () => {
  afterEach(() => {
    delete process.env.USD_BRL;
  });

  it("usa a cotação configurada e diz que ela foi configurada", () => {
    process.env.USD_BRL = "5.9";
    expect(cambio()).toEqual({ usdBrl: 5.9, configurado: true });
    expect(emReais(2)).toBeCloseTo(11.8, 6);
  });

  it("sem configuração, avisa que está usando o padrão do código", () => {
    expect(cambio().configurado).toBe(false);
  });
});
