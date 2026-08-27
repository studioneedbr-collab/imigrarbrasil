import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CASOS } from "./casos";

/**
 * MODO CORPUS — roda sem rede, sem Supabase e sem chave de embeddings.
 *
 * Não mede recuperação: mede se o chunk que a suíte espera AINDA EXISTE, com o mesmo id,
 * no que a ingestão produz hoje. Como o id é derivado do conteúdo, isso pega exatamente a
 * classe de regressão que passava despercebida — alguém troca um PDF, mexe no `chunk.py`
 * ou muda a faixa de páginas em `fontes.json`, os ids mudam em silêncio, e o índice em
 * produção passa a apontar para chunks que não existem mais.
 *
 * O ranking, esse é o modo índice (`indice.recall.ts`), que precisa da base carregada.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const CHUNKS = path.join(RAIZ, "ingestao/out/chunks.jsonl");

interface Chunk {
  id: string;
  fonte: string;
  colecao: string;
  titulo: string;
  texto: string;
}

const COMO_GERAR =
  `O corpus da ingestão não existe em ${CHUNKS}.\n` +
  `Gere-o antes de rodar esta suíte (é local, não sobe nada para lugar nenhum):\n` +
  `  cd ingestao && python3 extrair.py && python3 chunk.py\n` +
  `Precisa do poppler (brew install poppler) e dos 7 PDFs em material-oficial/.`;

let chunks: Chunk[] = [];
let porId = new Map<string, Chunk>();

beforeAll(() => {
  if (!fs.existsSync(CHUNKS)) return;
  chunks = fs
    .readFileSync(CHUNKS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Chunk);
  porId = new Map(chunks.map((c) => [c.id, c]));
});

describe("corpus da ingestão", () => {
  it("existe — sem ele não há o que indexar nem o que testar", () => {
    expect(fs.existsSync(CHUNKS), COMO_GERAR).toBe(true);
  });

  it("tem as sete fontes do material oficial", () => {
    if (!chunks.length) return;
    const fontes = new Set(chunks.map((c) => c.fonte));
    for (const f of [
      "regularizacao",
      "naturalizacao",
      "visto",
      "mercosul",
      "refugio",
      "legislacao",
      "comentarios",
    ]) {
      expect(fontes.has(f), `fonte "${f}" sumiu do corpus`).toBe(true);
    }
  });
});

describe("os chunks que os casos esperam continuam existindo", () => {
  for (const caso of CASOS) {
    it(`${caso.consulta}`, () => {
      if (!chunks.length) throw new Error(COMO_GERAR);

      const achados = caso.esperados.filter((id) => porId.has(id));
      expect(
        achados.length,
        `Nenhum dos chunks esperados existe mais no corpus.\n` +
          `  esperados: ${caso.esperados.join(", ")}\n` +
          `  âncora:    "${caso.trecho}"\n` +
          `  responde:  ${caso.responde}\n` +
          `O id é derivado do conteúdo — se o PDF, o chunking ou a faixa de páginas mudou, ` +
          `ache o chunk novo pela âncora e atualize tests/rag-recall/casos.ts. ` +
          `E lembre: reindexar não apaga o chunk velho da base (ingestao/README.md).`,
      ).toBeGreaterThan(0);

      // A âncora tem que continuar dentro de ALGUM dos chunks aceitos: id igual com texto
      // trocado seria coincidência improvável, mas é justamente o caso que passaria
      // batido. Um dos aceitos basta — quando há dois, eles respondem a mesma pergunta
      // por caminhos diferentes e a âncora vive só em um deles.
      const comAncora = achados.filter((id) => {
        const c = porId.get(id)!;
        return `${c.titulo}\n${c.texto}`.includes(caso.trecho);
      });
      expect(
        comAncora.length,
        `Os chunks ${achados.join(", ")} existem, mas nenhum contém mais a âncora ` +
          `"${caso.trecho}". Confira se o conteúdo mudou de lugar dentro da cartilha.`,
      ).toBeGreaterThan(0);
    });
  }
});

describe("as lacunas conhecidas ficam visíveis", () => {
  it("relatório", () => {
    const comLacuna = CASOS.filter((c) => c.lacuna);
    // eslint-disable-next-line no-console
    console.log(
      `\n${comLacuna.length} de ${CASOS.length} casos têm lacuna documentada:\n` +
        comLacuna.map((c) => `  · ${c.consulta}\n      ${c.lacuna}`).join("\n"),
    );
    expect(comLacuna.every((c) => c.lacuna!.length > 40)).toBe(true);
  });
});
