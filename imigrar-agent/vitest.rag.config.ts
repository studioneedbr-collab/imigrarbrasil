import { defineConfig } from "vitest/config";
import path from "node:path";

// A SUÍTE DE RECUPERAÇÃO RODA SEPARADA — de propósito.
//
// `npm test` cobre prompt, fila, tools e domínio: roda em 3 segundos, sem rede, e é o que
// trava um commit. A recuperação depende de coisas que aquela suíte não tem: o corpus da
// ingestão em disco e, no modo índice, chave de embeddings e a base carregada. Misturar
// as duas faria uma de duas coisas, e as duas são ruins — ou `npm test` passaria a exigir
// segredos, ou os casos de RAG virariam skip permanente no meio de 500 verdes.
//
// Os arquivos terminam em `.recall.ts` e não em `.test.ts` justamente para o include do
// vitest.config.ts (tests/**/*.test.ts) não os pegar por engano.
//
//   npm run test:rag
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rag-recall/**/*.recall.ts"],
    // A ÚNICA SUÍTE QUE FALA COM SERVIÇO REAL, e ela diz isso aqui em vez de depender de
    // quem executa lembrar de exportar variável. Ver `emTeste` em lib/env.ts: sem esta
    // chave, qualquer execução sob vitest cai no repositório de memória — foi assim que
    // uma rodada da suíte principal com o .env.local carregado escreveu 43 leads no banco
    // de produção.
    env: { SERVICOS_REAIS_NO_TESTE: "1" },
    // A busca vetorial passa por rede (embedding da consulta + RPC). O padrão de 5s
    // derruba o caso por lentidão e o relatório vira ruído em vez de sinal.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
