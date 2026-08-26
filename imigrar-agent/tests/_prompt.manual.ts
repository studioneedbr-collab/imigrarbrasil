// DUMP DO PROMPT DA ANA — para testar no chat grátis do DeepSeek antes de pagar a API.
//
//   npx vitest run --config vitest.prompt.config.ts
//
// Gera `out/prompt-do-agente.txt` com EXATAMENTE o que o app manda como system prompt,
// mais um bloco de ajuste para o teste no chat (onde não existem tools).
//
// Por que existe: a única forma honesta de avaliar a persona antes de gastar crédito é
// colar o prompt de verdade — não uma versão resumida à mão, que sempre acaba mais
// generosa do que o original e leva a conclusão errada sobre a postura.
//
// RODE DE NOVO depois de mexer no prompt (código ou /dashboard/treinar): o arquivo é uma
// fotografia, não um espelho.

import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_KNOWLEDGE, buildSystemPrompt } from "@/lib/agent/knowledge";
import { DEFAULT_TRAINING } from "@/lib/agent/training";
import { trainingToOverrides } from "@/lib/agent/system-prompt";
import { buildAgoraBlock } from "@/lib/agent";
import { ABSOLUTE_RULE } from "@/lib/agent/deepseek";

/**
 * O que muda entre o chat e a produção — e que precisa ser dito ao modelo, senão o teste
 * mede outra coisa.
 *
 * 1. NÃO HÁ TOOLS. No app a Ana chama `transferir_para_humano` e o sistema abre o chamado.
 *    No chat ela precisa ESCREVER que chamaria, senão não dá para ver se ela escala na
 *    hora certa — que é metade do que a v2 faz.
 * 2. NÃO HÁ MATERIAL OFICIAL. Em produção o RAG injeta trechos das cartilhas a cada turno.
 *    No chat não vem nada, e o comportamento correto é o de produção sem RAG: dizer que
 *    não tem a informação e encaminhar. Para testar COM material, cole um trecho de
 *    cartilha dentro do bloco marcado abaixo.
 */
const AJUSTE_PARA_O_CHAT = `

════════ AJUSTE PARA ESTE TESTE (não existe em produção) ════════

Você está sendo testada num chat comum, onde as suas ferramentas não existem. Duas
adaptações, e SÓ estas duas — todo o resto do prompt acima continua valendo integralmente:

1. Quando você chamaria uma ferramenta, ESCREVA a chamada numa linha própria, no fim da
   mensagem, entre colchetes, e continue a conversa normalmente:
     [TOOL: transferir_para_humano — motivo em poucas palavras]
     [TOOL: registrar_dados_lead — o que você anotou]
     [TOOL: buscar_material_oficial — o que você procuraria]
   A linha [TOOL: ...] é a única coisa que você escreve que a pessoa não leria de verdade.

2. Nenhum material oficial será injetado automaticamente. Comporte-se como se comporta em
   produção quando a busca não traz nada: NÃO responda pelo seu conhecimento próprio sobre
   imigração — diga que não tem a informação e ofereça o encaminhamento.

Se eu colar um trecho de cartilha marcado como MATERIAL OFICIAL, trate-o como o material
que chegaria junto da pergunta e responda com base nele.

Comece o atendimento na próxima mensagem que eu enviar, como se fosse o WhatsApp.`;

describe("dump do prompt", () => {
  it("escreve out/prompt-do-agente.txt", () => {
    // Mesma montagem de getSystemPrompt(), com os padrões do código. O que estiver
    // editado em /dashboard/treinar NÃO entra aqui — aquilo vive no banco.
    const sistema = buildSystemPrompt(DEFAULT_KNOWLEDGE, trainingToOverrides(DEFAULT_TRAINING));
    const agora = buildAgoraBlock(new Date());

    const conteudo = `${ABSOLUTE_RULE}\n\n${sistema}${agora}${AJUSTE_PARA_O_CHAT}\n`;

    const destino = path.join(process.cwd(), "out");
    fs.mkdirSync(destino, { recursive: true });
    const arquivo = path.join(destino, "prompt-do-agente.txt");
    fs.writeFileSync(arquivo, conteudo, "utf8");

    const linhas = conteudo.split("\n").length;
    const palavras = conteudo.split(/\s+/).length;
    console.log(`\n  ${arquivo}`);
    console.log(`  ${conteudo.length.toLocaleString("pt-BR")} caracteres · ${linhas} linhas · ~${palavras.toLocaleString("pt-BR")} palavras\n`);
  });
});
