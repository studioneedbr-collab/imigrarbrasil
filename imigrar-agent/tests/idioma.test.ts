import { describe, it, expect } from "vitest";
import { detectarIdioma, idiomaEfetivo, buildIdiomaBlock, NOME_DO_IDIOMA } from "@/lib/agent/idioma";
import { normalizarIdioma } from "@/lib/agent/audio";
import { followupFallback } from "@/lib/agent/followup";

describe("idioma · detecção", () => {
  it("reconhece português", () => {
    expect(detectarIdioma("meu visto de turista venceu, o que eu preciso fazer agora?")).toBe("pt");
    expect(detectarIdioma("não sei se posso trabalhar com esse documento")).toBe("pt");
  });

  it("reconhece espanhol e não confunde com português", () => {
    expect(detectarIdioma("necesito saber qué documentos tengo que presentar")).toBe("es");
    expect(detectarIdioma("¿cómo puedo pedir refugio en Brasil?")).toBe("es");
    expect(detectarIdioma("hola, soy de Venezuela y quiero regularizar mi situación")).toBe("es");
  });

  it("reconhece inglês, francês e crioulo haitiano", () => {
    expect(detectarIdioma("i need to know what documents are required for a work visa")).toBe("en");
    expect(detectarIdioma("bonjour, j'ai besoin de papiers pour mon séjour au Brésil")).toBe("fr");
    expect(detectarIdioma("mwen bezwen papye pou mwen ka rete nan Brezil, tanpri")).toBe("ht");
  });

  it("reconhece escrita não latina pelo alfabeto", () => {
    expect(detectarIdioma("أحتاج إلى مساعدة في تأشيرة الإقامة")).toBe("ar");
    expect(detectarIdioma("мне нужна помощь с документами для проживания")).toBe("ru");
    expect(detectarIdioma("мені потрібна допомога з документами")).toBe("uk");
    expect(detectarIdioma("我需要办理巴西居留签证的帮助")).toBe("zh");
  });

  it("NÃO chuta em mensagem curta — um palpite errado gruda no contato", () => {
    for (const t of ["ok", "sim", "1", "visa", "obrigado", "?"]) {
      expect(detectarIdioma(t), `"${t}" não devia gerar palpite`).toBeUndefined();
    }
  });

  it("NÃO chuta quando nada é distintivo", () => {
    expect(detectarIdioma("2025 2026 11 999999999")).toBeUndefined();
  });
});

describe("idioma · o que vale no turno", () => {
  it("a mensagem de agora vence o que estava gravado — ela trocou de idioma", () => {
    expect(idiomaEfetivo("necesito saber qué documentos tengo que presentar", "pt")).toBe("es");
  });

  it("mensagem sem sinal cai no que já estava gravado", () => {
    expect(idiomaEfetivo("ok", "es")).toBe("es");
  });

  it("sem sinal e sem histórico, ninguém se compromete", () => {
    expect(idiomaEfetivo("ok", null)).toBeUndefined();
  });
});

describe("idioma · bloco do prompt", () => {
  it("não injeta bloco para português (é o padrão do material)", () => {
    expect(buildIdiomaBlock("pt")).toBe("");
    expect(buildIdiomaBlock(null)).toBe("");
  });

  it("manda traduzir o material oficial em vez de devolver o trecho em português", () => {
    const b = buildIdiomaBlock("ht");
    expect(b).toContain(NOME_DO_IDIOMA.ht);
    expect(b).toMatch(/traduza o conteúdo/i);
    expect(b).toMatch(/nunca devolva o trecho em português/i);
  });

  it("permite a pessoa trocar de idioma no meio", () => {
    expect(buildIdiomaBlock("es")).toMatch(/siga a língua de agora/i);
  });
});

describe("idioma · o Whisper devolve o nome por extenso", () => {
  it("converte para ISO-639-1", () => {
    expect(normalizarIdioma("portuguese")).toBe("pt");
    expect(normalizarIdioma("Spanish")).toBe("es");
    expect(normalizarIdioma("haitian creole")).toBe("ht");
  });

  it("deixa passar o que já é ISO", () => {
    expect(normalizarIdioma("pt")).toBe("pt");
  });

  it("idioma desconhecido não vira lixo no contato", () => {
    expect(normalizarIdioma("klingon")).toBeUndefined();
    expect(normalizarIdioma(undefined)).toBeUndefined();
  });
});

describe("idioma · follow-up automático", () => {
  it("sai no idioma gravado do contato", () => {
    expect(followupFallback("en")).toMatch(/I'm here/i);
    expect(followupFallback("ht")).toMatch(/Bonjou/i);
    expect(followupFallback("fr")).toMatch(/Bonjour/i);
  });

  it("sem idioma conhecido, mantém o par PT/ES", () => {
    const f = followupFallback(null);
    expect(f).toMatch(/Estou por aqui/);
    expect(f).toMatch(/Estoy por aquí/);
  });

  it("idioma sem texto pronto cai no padrão em vez de mandar undefined", () => {
    expect(followupFallback("zh")).toMatch(/Estou por aqui/);
  });
});
