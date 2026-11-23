import { describe, it, expect } from "vitest";
import { leitorDeDocumento, parteDoAnexo } from "@/lib/agent/vision";
import type { Llm } from "@/lib/agent/llm";

// A LEITURA DE DOCUMENTO SEGUE O MODELO ESCOLHIDO, quando ele enxerga.

const openai: Llm = {
  provedor: "openai", nome: "ChatGPT", baseUrl: "https://api.openai.com/v1", key: "k",
  modelo: "gpt-4.1", configurado: true, origemDaChave: "ambiente",
};
const deepseek: Llm = {
  provedor: "deepseek", nome: "DeepSeek", baseUrl: "https://api.deepseek.com", key: "k",
  modelo: "deepseek-chat", configurado: true, origemDaChave: "ambiente",
};

describe("quem lê o documento", () => {
  it("o ChatGPT escolhido lê, com o modelo escolhido", () => {
    expect(leitorDeDocumento([openai, deepseek])?.modelo).toBe("gpt-4.1");
  });

  it("com o DeepSeek escolhido (só texto), ninguém lê — a reserva não recebe documento", () => {
    expect(leitorDeDocumento([deepseek, openai])).toBeNull();
  });

  it("ninguém enxerga: não lê", () => {
    expect(leitorDeDocumento([deepseek])).toBeNull();
    expect(leitorDeDocumento([{ ...openai, configurado: false }])).toBeNull();
  });
});

describe("o anexo no formato do chat", () => {
  const buf = Buffer.from("x");
  it("imagem vai como image_url nos dois provedores", () => {
    expect(parteDoAnexo(deepseek, "image/png", "a.png", buf)).toMatchObject({ type: "image_url" });
    expect(parteDoAnexo(openai, "image/jpeg", "a.jpg", buf)).toMatchObject({ type: "image_url" });
  });
  it("PDF só na OpenAI, como arquivo", () => {
    expect(parteDoAnexo(openai, "application/pdf", "passaporte.pdf", buf)).toMatchObject({
      type: "file",
      file: { filename: "passaporte.pdf" },
    });
    expect(parteDoAnexo(deepseek, "application/pdf", "p.pdf", buf)).toBeNull();
    expect(parteDoAnexo(openai, "audio/ogg", "a.ogg", buf)).toBeNull();
  });
});
