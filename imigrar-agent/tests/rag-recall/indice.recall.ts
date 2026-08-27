import { describe, it, expect, beforeAll } from "vitest";
import { buscarChunks, filtrarRelevantes, ragConfigurado } from "@/lib/agent/rag";
import { CASOS, TOP_K } from "./casos";

/**
 * MODO ÍNDICE — a recuperação de verdade, contra a base que o agente consulta.
 *
 * Cada caso passa se um dos chunks esperados aparecer no top-k. É o mesmo top-k de
 * produção (6), pela mesma função (`buscarChunks`), com as mesmas coleções — testar com
 * k maior ou consultando `legislacao` direto daria um verde que não significa nada,
 * porque não é isso que chega ao prompt.
 *
 * FALHA EM VEZ DE PULAR. Uma suíte de recuperação que se pula sozinha quando a base não
 * está configurada é pior do que não existir: ela vira verde permanente e ninguém repara
 * que o agente está atendendo sem material nenhum. Se faltar chave, base ou índice, os
 * casos falham dizendo exatamente o que falta.
 */

const AMBIENTE =
  `A base vetorial não está utilizável neste ambiente.\n` +
  `  · NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (base)\n` +
  `  · OPENAI_API_KEY, ou EMBEDDINGS_PROVIDER=tei + EMBEDDINGS_URL (vetor da consulta)\n` +
  `  · migration 017 aplicada e ingestao/embed_upsert.py rodado (chunks indexados)\n` +
  `Ver ingestao/README.md. Enquanto isto não estiver de pé, a Ana atende sem material ` +
  `oficial: ela diz que não tem a informação e encaminha — que é seguro, e é também ` +
  `metade do serviço não acontecendo.`;

let indiceVivo = false;

beforeAll(async () => {
  if (!ragConfigurado()) return;
  // Uma consulta qualquer que o acervo responde. Vazio aqui é base sem chunks.
  indiceVivo = (await buscarChunks("autorização de residência", { limite: 1 })).length > 0;
});

describe("o índice está de pé", () => {
  it("provedor de embeddings e Supabase configurados", () => {
    expect(ragConfigurado(), AMBIENTE).toBe(true);
  });

  it("rag_chunks tem conteúdo indexado", () => {
    expect(indiceVivo, AMBIENTE).toBe(true);
  });
});

describe(`recuperação — o chunk certo no top-${TOP_K}`, () => {
  for (const caso of CASOS) {
    it(`${caso.consulta}`, async () => {
      if (!indiceVivo) throw new Error(AMBIENTE);

      const recuperados = await buscarChunks(caso.consulta, { limite: TOP_K });
      const ids = recuperados.map((c) => c.id);
      const posicao = ids.findIndex((id) => caso.esperados.includes(id));

      const listagem = recuperados
        .map((c, i) => `    ${i + 1}. ${c.escore.toFixed(4)} [${c.fonte}] ${c.titulo}`)
        .join("\n");

      expect(
        posicao,
        `Nenhum chunk esperado no top-${TOP_K}.\n` +
          `  esperados: ${caso.esperados.join(", ")}  ("${caso.trecho}")\n` +
          `  responde:  ${caso.responde}\n` +
          (caso.lacuna ? `  lacuna:    ${caso.lacuna}\n` : "") +
          `  veio:\n${listagem || "    (nada)"}`,
      ).toBeGreaterThanOrEqual(0);

      // Chegar no top-k não basta: o corte relativo derruba a cauda antes de o trecho
      // virar prompt. Um chunk recuperado e cortado não chega à Ana — é o mesmo que
      // não ter sido recuperado.
      const sobrevive = filtrarRelevantes(recuperados).some((c) => caso.esperados.includes(c.id));
      expect(
        sobrevive,
        `O chunk esperado veio na posição ${posicao + 1} mas o corte relativo ` +
          `(CORTE_RELATIVO em lib/agent/rag.ts) o descarta antes de virar contexto.`,
      ).toBe(true);
    });
  }
});
