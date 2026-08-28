import { describe, it, expect, vi, afterEach } from "vitest";
import { detectarIdiomaComModelo, idiomaDaConversaOuModelo } from "@/lib/agent/idioma-modelo";
import { buildIdiomaBlock, NOME_DO_IDIOMA } from "@/lib/agent/idioma";

// O DETECTOR POR MODELO É A ÚLTIMA INSTÂNCIA, e por isso a suíte inteira gira em torno de
// uma pergunta só: quando ele NÃO deve responder nada. Um palpite errado aqui grava a
// língua errada no contato e o follow-up automático sai nela pelo resto do atendimento.

/** Uma resposta do DeepSeek com o conteúdo que se quiser no `content`. */
function respostaCom(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }], usage: {} }),
    text: async () => "",
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectarIdiomaComModelo", () => {
  it("devolve o código ISO que o modelo respondeu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaCom("tr")));
    expect(await detectarIdiomaComModelo("merhaba, Brezilya'da oturma izni almak istiyorum")).toBe("tr");
  });

  it("tolera espaço, ponto e maiúscula em volta do código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaCom("  ES.  ")));
    expect(await detectarIdiomaComModelo("necesito ayuda con mis documentos")).toBe("es");
  });

  it("desiste quando o modelo responde 'xx' (ele mesmo não soube)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaCom("xx")));
    expect(await detectarIdiomaComModelo("aaaaaaaaaaaaaaaaaaaa")).toBeUndefined();
  });

  it("desiste quando o modelo responde prosa em vez de um código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaCom("Não consigo saber, parece espanhol")));
    expect(await detectarIdiomaComModelo("necesito ayuda con mis documentos")).toBeUndefined();
  });

  it("não gasta chamada com mensagem curta demais para dizer alguma coisa", async () => {
    const chamada = vi.fn(async () => respostaCom("es"));
    vi.stubGlobal("fetch", chamada);
    expect(await detectarIdiomaComModelo("ok")).toBeUndefined();
    expect(chamada).not.toHaveBeenCalled();
  });

  it("engole erro de rede — detectar idioma não pode derrubar o atendimento", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    expect(await detectarIdiomaComModelo("guten Tag, ich brauche Hilfe mit meinen Papieren")).toBeUndefined();
  });

  it("engole erro HTTP do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 500, text: async () => "boom", json: async () => ({}),
    }) as unknown as Response));
    expect(await detectarIdiomaComModelo("guten Tag, ich brauche Hilfe mit meinen Papieren")).toBeUndefined();
  });
});

describe("nome do idioma para as línguas que só o modelo alcança", () => {
  it("conhece línguas que a heurística nunca detectou", () => {
    for (const codigo of ["tr", "de", "it", "el", "he", "sw", "wo", "ti", "ps", "vi"]) {
      expect(NOME_DO_IDIOMA[codigo], `faltou o nome de "${codigo}"`).toBeTruthy();
    }
  });

  it("não manda o modelo falar 'zz' quando o código é desconhecido", () => {
    const bloco = buildIdiomaBlock("zz");
    expect(bloco).not.toMatch(/falando zz/);
    expect(bloco).toMatch(/zz/);
    // A frase é lida por um modelo, e frase capenga instrui mal: "Continue em o idioma
    // de código" era o que saía quando o rótulo desconhecido entrava nos dois lugares.
    expect(bloco).not.toMatch(/em o idioma/);
  });

  it("mantém a frase natural quando o nome do idioma é conhecido", () => {
    expect(buildIdiomaBlock("es")).toMatch(/falando espanhol nesta conversa\. Continue em espanhol/);
  });
});

describe("idiomaDaConversaOuModelo — a ordem de quem decide", () => {
  it("não gasta chamada quando a heurística já reconheceu a língua", async () => {
    const chamada = vi.fn(async () => respostaCom("en"));
    vi.stubGlobal("fetch", chamada);
    const idioma = await idiomaDaConversaOuModelo(
      "necesito saber qué documentos tengo que presentar",
      "necesito saber qué documentos tengo que presentar",
      null,
      { habilitado: true },
    );
    expect(idioma).toBe("es");
    expect(chamada).not.toHaveBeenCalled();
  });

  it("não gasta chamada quando o contato já tem idioma gravado", async () => {
    const chamada = vi.fn(async () => respostaCom("en"));
    vi.stubGlobal("fetch", chamada);
    expect(await idiomaDaConversaOuModelo("ok", "ok", "ht", { habilitado: true })).toBe("ht");
    expect(chamada).not.toHaveBeenCalled();
  });

  it("chama o modelo quando a heurística desistiu e não há nada gravado", async () => {
    const chamada = vi.fn(async () => respostaCom("de"));
    vi.stubGlobal("fetch", chamada);
    const texto = "guten Tag, ich brauche Hilfe mit meinen Papieren in Brasilien";
    expect(await idiomaDaConversaOuModelo(texto, texto, null, { habilitado: true })).toBe("de");
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it("fica só com a heurística quando o provedor não está configurado", async () => {
    const chamada = vi.fn(async () => respostaCom("de"));
    vi.stubGlobal("fetch", chamada);
    const texto = "guten Tag, ich brauche Hilfe mit meinen Papieren in Brasilien";
    expect(await idiomaDaConversaOuModelo(texto, texto, null, { habilitado: false })).toBeUndefined();
    expect(chamada).not.toHaveBeenCalled();
  });
});
