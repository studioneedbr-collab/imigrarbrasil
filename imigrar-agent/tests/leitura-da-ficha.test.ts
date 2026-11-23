import { describe, it, expect, vi, afterEach } from "vitest";

// A ABERTURA (nome, nacionalidade, onde está) LIDA PELO MODELO quando a regra não
// reconhece — e o estado do turno indo DEPOIS do histórico, onde o modelo lê por último.

import { interpretarLeitura, patchDaLeitura, faltaAbertura } from "@/lib/agent/leitura-da-ficha";
import { montarEstadoDoTurno } from "@/lib/agent";
import { conduzirComLlm } from "@/lib/agent/conducao";
import type { Lead } from "@/lib/domain/types";
import type { Llm } from "@/lib/agent/llm";

describe("leitura da abertura pelo modelo", () => {
  it("lê o JSON, inclusive cercado de ```", () => {
    expect(
      interpretarLeitura('```json\n{"nome":"Angelo","nacionalidade":"Portugal","onde_esta":"exterior","pais_atual":"Suíça","cidade":null}\n```'),
    ).toEqual({ nome: "Angelo", nacionalidade: "Portugal", ondeEsta: "exterior", paisAtual: "Suíça", cidade: null });
  });

  it("descarta lixo: texto sem JSON, nome com número, valor 'desconhecido'", () => {
    expect(interpretarLeitura("não sei")).toBeNull();
    const l = interpretarLeitura('{"nome":"5547999","nacionalidade":"desconhecida","onde_esta":"talvez"}')!;
    expect(l).toEqual({ nome: null, nacionalidade: null, ondeEsta: null, paisAtual: null, cidade: null });
    for (const vazio of ["None", "N/A", "unknown", "-", "não informado", "desconocido"]) {
      expect(interpretarLeitura(`{"nacionalidade":"${vazio}"}`)?.nacionalidade).toBeNull();
    }
  });

  it("não escreve outro lugar por cima do que a ficha já diz", () => {
    expect(
      patchDaLeitura({ nome: null, nacionalidade: null, ondeEsta: "exterior", paisAtual: "Suíça", cidade: null }, { localizacao: "brasil" } as Lead),
    ).toBeNull();
  });

  it("o caso dos prints: português na Suíça vira ficha completa de localização", () => {
    const patch = patchDaLeitura(
      { nome: null, nacionalidade: "Portugal", ondeEsta: "exterior", paisAtual: "Suíça", cidade: null },
      null,
    );
    expect(patch).toEqual({
      clientType: "Portugal",
      nacionalidade: "Portugal",
      region: "Exterior — Suíça",
      localizacao: "exterior",
      paisExterior: "Suíça",
    });
  });

  it("brasileiro respondido seco; no Brasil com cidade", () => {
    expect(patchDaLeitura({ nome: null, nacionalidade: "Brasil", ondeEsta: "brasil", paisAtual: null, cidade: "Joinville" }, null))
      .toMatchObject({ clientType: "Brasil", region: "Brasil — Joinville", localizacao: "brasil" });
  });

  it("nunca sobrescreve o que já está na ficha", () => {
    const lead = { contactName: "Claudio", clientType: "Brasil", region: "Exterior — Bélgica" } as Lead;
    expect(patchDaLeitura({ nome: "Outro", nacionalidade: "Portugal", ondeEsta: "brasil", paisAtual: null, cidade: null }, lead)).toBeNull();
    expect(faltaAbertura(lead)).toBe(false);
    expect(faltaAbertura({ contactName: "Claudio" } as Lead)).toBe(true);
  });
});

describe("estado do turno", () => {
  it("diz o que ela já respondeu e proíbe perguntar de novo", () => {
    const e = montarEstadoDoTurno({ contactName: "Angelo", clientType: "Portugal", region: "Exterior — Suíça" } as Lead, 2);
    expect(e).toContain("nacionalidade: Portugal");
    expect(e).toContain("onde está agora: Exterior — Suíça");
    expect(e).toContain("nem peça confirmação");
    expect(e).toContain("As últimas 2 mensagens dela são UMA fala só");
  });

  it("sem rajada e sem ficha, só a regra", () => {
    const e = montarEstadoDoTurno(null, 1);
    expect(e).not.toContain("JÁ respondeu");
    expect(e).not.toContain("UMA fala só");
    expect(e).toContain("no máximo UMA pergunta");
  });
});

describe("o estado vai depois do histórico", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("é a última mensagem enviada ao modelo", async () => {
    let corpo: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        corpo = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Olá" } }] }));
      }),
    );
    const llm: Llm = {
      provedor: "openai", nome: "ChatGPT", baseUrl: "https://exemplo.invalid", key: "k",
      modelo: "gpt-4.1", configurado: true, origemDaChave: "ambiente",
    };
    await conduzirComLlm({
      llm,
      systemPrompt: "PROMPT",
      history: [{ role: "user", content: "Sou português" }, { role: "user", content: "Estou na Suíça" }],
      conversationId: "c1",
      estadoDoTurno: "ESTADO X",
    });
    const msgs = corpo!.messages;
    expect(msgs[0].role).toBe("system");
    // Dentro da última fala, e não como `system` solto: o DeepSeek junta as mensagens
    // `system` no começo, e a nota voltaria a ficar enterrada.
    const ultima = msgs.at(-1)!;
    expect(ultima.role).toBe("user");
    expect(ultima.content.startsWith("Estou na Suíça")).toBe(true);
    expect(ultima.content).toContain("NOTA INTERNA");
    expect(ultima.content).toContain("ESTADO X");
    expect(msgs.filter((m) => m.role === "system")).toHaveLength(1);
  });
});
