// UMA REGRA, UMA DEFINIÇÃO.
//
// O prompt final é montado de dois lugares: a base de conhecimento (`knowledge.ts`) e o
// bloco de identidade editável (`training.ts`). Os dois traziam uma regra chamada
// "mensagens curtas" — e davam números diferentes para ela:
//
//   knowledge.ts   "Mensagens curtas: 2 a 4 PARÁGRAFOS no máximo"
//   training.ts    "Mensagens curtas: 2 a 3 FRASES por resposta"
//
// Duas definições da mesma regra, com o mesmo rótulo, no MESMO prompt. Isso não vira
// média: vence a permissiva. Numa conversa de teste em 28/08 a Ana respondia em cinco e
// seis linhas, abrindo cada mensagem com um resumo do que a pessoa acabara de escrever —
// para alguém lendo no celular, com medo, muitas vezes em segunda língua.
//
// O teste trava as duas pontas: a unidade tem de ser frase nos dois arquivos, e o prompt
// montado não pode voltar a medir tamanho de mensagem em parágrafo.

import { describe, it, expect } from "vitest";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { DEFAULT_TRAINING, buildIdentityBlock } from "@/lib/agent/training";

const promptBase = buildSystemPrompt(DEFAULT_KNOWLEDGE);
const blocoIdentidade = buildIdentityBlock(DEFAULT_TRAINING.identity);

describe("tamanho da mensagem: as duas fontes do prompt não podem se contradizer", () => {
  it("a base de conhecimento mede em frases", () => {
    expect(promptBase).toMatch(/2 a 3 FRASES por mensagem/);
  });

  it("o bloco de identidade mede em frases, e no mesmo número", () => {
    expect(blocoIdentidade).toMatch(/2 a 3 frases/i);
  });

  it("nenhuma das duas volta a medir a MENSAGEM em parágrafos", () => {
    // Recorte estreito de propósito: a palavra "parágrafo" pode aparecer legitimamente
    // em outro contexto. O que não pode voltar é ela como unidade de tamanho de resposta.
    const medindoEmParagrafos = /(mensagens?|respostas?)[^.\n]{0,40}par[áa]grafos?/i;
    expect(promptBase).not.toMatch(medindoEmParagrafos);
    expect(blocoIdentidade).not.toMatch(medindoEmParagrafos);
  });

  it("o prompt inteiro, com identidade junto, carrega uma definição só", () => {
    const completo = `${promptBase}\n${blocoIdentidade}`;
    const numeros = Array.from(completo.matchAll(/(\d+)\s*a\s*(\d+)\s*frases?/gi)).map(
      (m) => `${m[1]}-${m[2]}`,
    );
    // Pode aparecer mais de uma vez; o que não pode é aparecer com números diferentes.
    expect(new Set(numeros).size).toBe(1);
  });
});

describe("não devolver a mensagem da pessoa antes de perguntar", () => {
  it("proíbe abrir a resposta repetindo o que ela acabou de dizer", () => {
    expect(promptBase).toMatch(/NÃO ABRA REPETINDO O QUE A PESSOA ACABOU DE DIZER/);
  });

  it("explica o custo, e não só a proibição", () => {
    // A regra sem o motivo é a que o modelo mais solta sob pressão de contexto longo.
    expect(promptBase).toMatch(/ocupando o lugar\s*\n?\s*da sua|Ela sabe o que/);
  });
});
