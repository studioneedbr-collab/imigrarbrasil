import { describe, it, expect, beforeEach } from "vitest";
import { getRepository } from "@/lib/data";
import { getSystemPrompt } from "@/lib/agent/system-prompt";
import { MATERIAIS, blocoDoAcervo } from "@/lib/agent/material-oficial";
import {
  MATERIAL_MAX_BYTES,
  fonteDoArquivo,
  listarAcervo,
  removerDoAcervo,
  salvarAdicionado,
  type MaterialAdicionado,
} from "@/lib/agent/acervo";
import { quebrarEmTrechos } from "@/lib/agent/ingestao";
import { nomeSeguro } from "@/lib/agent/acervo-arquivos";

// O ACERVO EDITÁVEL PELO PAINEL.
//
// O risco deste recurso não é a tela: é ela funcionar pela metade. Documento acrescentado
// que entra na base e não no prompt (a Ana indexa e nunca oferece), documento removido que
// sai do prompt e fica na base (ela responde com material revogado sem ninguém ver), e
// acervo vazio virando uma lista vazia que o modelo ignora. Os três estão aqui.

const novo = (over: Partial<MaterialAdicionado> = {}): MaterialAdicionado => ({
  arquivo: "reuniao-familiar.pdf",
  titulo: "Reunião familiar",
  cobre: "quem quer trazer cônjuge, filhos ou pais para o Brasil",
  colecao: "cartilha",
  fonte: "reuniao-familiar",
  atualizadoEm: "fevereiro/2026",
  paginas: 12,
  caracteres: 20_000,
  trechos: 18,
  criadoEm: new Date().toISOString(),
  ...over,
});

describe("o acervo que vale é o do banco, não a constante do código", () => {
  beforeEach(async () => {
    const repo = getRepository();
    await repo.setConfig("material_oficial_extra", []);
    await repo.setConfig("material_oficial_removidos", []);
  });

  it("sem nada no banco, é a lista do código", async () => {
    const { documentos } = await listarAcervo();
    expect(documentos.map((d) => d.arquivo)).toEqual(MATERIAIS.map((m) => m.arquivo));
  });

  it("documento acrescentado entra na lista E no prompt do agente", async () => {
    await salvarAdicionado(novo());

    const { documentos, adicionados } = await listarAcervo();
    expect(documentos).toHaveLength(MATERIAIS.length + 1);
    expect(adicionados).toHaveLength(1);

    // A parte que faz o agente "aprender": sem esta linha no prompt, ele tem os trechos na
    // base e continua dizendo que o assunto não é a área dele.
    const prompt = await getSystemPrompt();
    expect(prompt).toContain("· Reunião familiar: quem quer trazer cônjuge");
  });

  it("documento do código removido sai do prompt", async () => {
    const alvo = MATERIAIS[0];
    expect(await getSystemPrompt()).toContain(`· ${alvo.titulo}:`);

    const r = await removerDoAcervo(alvo.arquivo);
    expect(r).toMatchObject({ ok: true, tipo: "codigo" });

    const { documentos, removidos } = await listarAcervo();
    expect(documentos.map((d) => d.arquivo)).not.toContain(alvo.arquivo);
    expect(removidos).toContain(alvo.arquivo);
    expect(await getSystemPrompt()).not.toContain(`· ${alvo.titulo}:`);
  });

  it("remover um documento acrescentado devolve a fonte, para os trechos serem apagados", async () => {
    await salvarAdicionado(novo());
    const r = await removerDoAcervo("reuniao-familiar.pdf");
    expect(r).toEqual({ ok: true, tipo: "adicionado", fonte: "reuniao-familiar" });
    expect((await listarAcervo()).documentos).toHaveLength(MATERIAIS.length);
  });

  it("re-adicionar um documento que havia sido removido desfaz a remoção", async () => {
    const alvo = MATERIAIS[1];
    await removerDoAcervo(alvo.arquivo);
    await salvarAdicionado(novo({ arquivo: alvo.arquivo, titulo: alvo.titulo, fonte: fonteDoArquivo(alvo.arquivo) }));

    const { documentos, removidos } = await listarAcervo();
    expect(removidos).not.toContain(alvo.arquivo);
    expect(documentos.filter((d) => d.arquivo === alvo.arquivo)).toHaveLength(1);
  });

  it("remover algo que não existe não inventa entrada", async () => {
    expect(await removerDoAcervo("nao-existe.pdf")).toEqual({
      ok: false,
      erro: "Documento não encontrado no acervo.",
    });
  });
});

describe("acervo vazio é instrução, não lista vazia", () => {
  // O estado em que alguém removeu o último documento. Uma lista vazia no prompt é ruído que
  // o modelo ignora, voltando a responder de memória — que é exatamente o que este bloco
  // existe para impedir.
  it("diz em palavras que não há fonte, e manda encaminhar", () => {
    const bloco = blocoDoAcervo([]);
    expect(bloco).toContain("NÃO HÁ MATERIAL OFICIAL CARREGADO");
    expect(bloco).toContain("encaminhe");
    expect(bloco).not.toContain("O acervo disponível cobre:");
  });

  it("com documentos, lista um por linha", () => {
    const bloco = blocoDoAcervo([
      { arquivo: "a.pdf", titulo: "A", cobre: "assunto a", colecao: "cartilha" },
    ]);
    expect(bloco).toContain("· A: assunto a");
  });
});

describe("nome do arquivo virando fonte dos trechos", () => {
  it("tira acento, extensão e pontuação", () => {
    expect(fonteDoArquivo("Reunião Familiar 2026.pdf")).toBe("reuniao-familiar-2026");
    expect(fonteDoArquivo("cartilha_da_DPU.PDF")).toBe("cartilha-da-dpu");
  });

  it("não devolve fonte com borda suja", () => {
    expect(fonteDoArquivo("--- .pdf")).toBe("");
  });

  // O NOME CANÔNICO TEM DE PASSAR PELO FILTRO DO DOWNLOAD.
  //
  // Este é o furo que existiu por alguns minutos: o upload guardava o nome como veio, e
  // "Reunião Familiar.pdf" era indexado com os trechos certos e respondia 404 no botão
  // Baixar, porque `nomeSeguro` recusa acento e espaço. Os dois lados precisam concordar.
  it("o nome derivado é sempre aceito pelo download", () => {
    for (const original of [
      "Reunião Familiar (2).pdf",
      "CARTILHA — visto de trabalho.pdf",
      "lei 13.445 de 2017.PDF",
      "acordo_mercosul v2.pdf",
    ]) {
      const canonico = `${fonteDoArquivo(original)}.pdf`;
      expect(nomeSeguro(canonico), original).toBe(canonico);
    }
  });
});

describe("quebra em trechos", () => {
  const paragrafo = (n: number) => `Parágrafo ${n}. ${"palavra ".repeat(60)}`.trim();

  it("mantém os trechos na faixa da base que já está no ar", () => {
    const paginas = [Array.from({ length: 12 }, (_, i) => paragrafo(i)).join("\n\n")];
    const trechos = quebrarEmTrechos(paginas);

    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.texto.length).toBeLessThanOrEqual(2340);
    // `ordem` é o que o id do trecho usa: furo na sequência viraria colisão na reindexação.
    expect(trechos.map((t) => t.ordem)).toEqual(trechos.map((_, i) => i));
  });

  it("guarda a página de início e de fim", () => {
    const trechos = quebrarEmTrechos([paragrafo(1), paragrafo(2), paragrafo(3)]);
    expect(trechos[0].paginaInicio).toBe(1);
    expect(trechos[trechos.length - 1].paginaFim).toBeGreaterThanOrEqual(1);
  });

  it("PDF sem texto não gera trecho nenhum", () => {
    expect(quebrarEmTrechos(["", "  ", "\n\n"])).toEqual([]);
  });

  it("parágrafo gigante é fatiado em vez de virar um trecho enorme", () => {
    const gigante = Array.from({ length: 400 }, (_, i) => `Frase número ${i} com algum corpo.`).join(" ");
    const trechos = quebrarEmTrechos([gigante]);
    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.texto.length).toBeLessThanOrEqual(2340);
  });
});

describe("o teto de tamanho do PDF", () => {
  // O número existe por causa do limite de corpo de requisição da plataforma (4,5 MB). Se
  // alguém subir esse teto sem pensar, o upload passa a ser recusado pela Vercel antes de
  // chegar ao nosso código — e o erro chega na tela como falha de rede, sem explicação.
  it("fica abaixo do limite da plataforma", () => {
    expect(MATERIAL_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});
