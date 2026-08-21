// Smoke test manual da Shayene — NÃO entra na suíte (o vitest.config só inclui
// *.test.ts). Chama o DeepSeek de verdade e gasta tokens, por isso fica de fora do
// `npm test`. Use quando mexer no prompt, para ver o que ela responde na prática:
//
//   npx vitest run --include "tests/_simulacao.manual.ts"
//
// A transcrição sai em /tmp/sim-transcript.txt. Edite ROTEIROS para os casos que
// quiser conferir. Rodar da raiz de shine-rio-agent (lê o .env.local dali).
import { readFileSync, appendFileSync, writeFileSync } from "fs";
const OUT = "/tmp/sim-transcript.txt";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

import { it } from "vitest";

const ROTEIROS: Array<{ titulo: string; mensagens: string[] }> = [
  {
    titulo: "F) REGIÃO — cotou São Paulo, o PDF tem que sair com o mesmo valor",
    mensagens: [
      "Preciso de 2 auxiliares de serviços gerais em São Paulo",
      "Condomínio Alphaville, CNPJ 40.390.866/0001-70. Sou o Cássio",
    ],
  },
];

// Timeout alto de propósito: o DeepSeek às vezes leva minutos por resposta, e um
// roteiro de 3 turnos já estourava os 300s antigos no meio da última conversa.
it("roteiro de simulação", { timeout: 1800000 }, async () => {
writeFileSync(OUT, "");
// Modo memória de propósito: o banco de produção ainda tem essas funções com salário 0
// e sob consulta (os pisos da CCT não foram conferidos). Sem isto, o repositório do
// Supabase sobrepõe o DEFAULT_PRICING e não dá para validar o motor.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
// import dinâmico DEPOIS de popular process.env: lib/env lê as variáveis na carga do módulo.
const { getRepository } = await import("@/lib/data");
const { processMessage } = await import("@/lib/agent");
const repo = getRepository();
for (let i = 0; i < ROTEIROS.length; i++) {
  const r = ROTEIROS[i];
  appendFileSync(OUT, `\n${"=".repeat(70)}\n${r.titulo}\n${"=".repeat(70)}\n`);
  const conv = await repo.getOrCreateConversation(`sim:roteiro-${i}-${Date.now()}`);
  for (const msg of r.mensagens) {
    appendFileSync(OUT, `\n[CLIENTE] ${msg}\n`);
    const res = await processMessage({ conversationId: conv.id, userText: msg });
    appendFileSync(OUT, `[SHAYENE] ${res.reply}\n`);
    const tools = (res.toolCalls ?? []).map((t: { name: string }) => t.name);
    if (tools.length) appendFileSync(OUT, `   (tools: ${tools.join(", ")})\n`);
    // O input das tools é o que revela se ela passou região, escala e sem_uniforme —
    // sem isso não dá para saber se o PDF vai sair com o mesmo valor da conversa.
    for (const t of res.toolCalls ?? []) {
      appendFileSync(OUT, `      ${t.name}(${JSON.stringify(t.input)})\n`);
    }
  }
}
});
