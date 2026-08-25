// SMOKE TEST MANUAL DA ANA — conversa de verdade, contra as APIs de verdade.
//
// NÃO entra na suíte (`npm test` só inclui *.test.ts): chama o DeepSeek e gasta tokens.
// É o jeito de ver o que ela responde na prática quando você mexe no prompt, no RAG ou
// nas regras de encaminhamento.
//
//   npx vitest run --config vitest.sim.config.ts
//
// Rodar de dentro de imigrar-agent/ — lê o .env.local daqui.
// A transcrição sai em sim-transcript.txt (gitignored: é conversa de atendimento).
//
// O QUE CADA ROTEIRO EXERCITA está no título. Edite ROTEIROS à vontade — este arquivo
// existe para ser editado.
//
// SEM_SUPABASE=1 força o modo memória. Use quando quiser testar só a personalidade sem
// tocar no banco — mas saiba que isso DESLIGA O RAG (a busca vive no Supabase), e sem
// RAG a Ana responde "não tenho essa informação" para tudo, que é o comportamento
// correto e não um bug.
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "fs";

const OUT = "sim-transcript.txt";

if (existsSync(".env.local")) {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
} else {
  console.warn("[sim] .env.local não encontrado — rodando com o que já está no ambiente.");
}

import { it } from "vitest";

const ROTEIROS: Array<{ titulo: string; mensagens: string[] }> = [
  {
    titulo: "A) RAG — pergunta coberta pelo material oficial. Ela responde e ressalva.",
    mensagens: [
      "Oi, bom dia",
      "Entrei no Brasil como turista e meu prazo vence em duas semanas. Como faço para pedir autorização de residência?",
    ],
  },
  {
    titulo: "B) RAG — pergunta FORA do material. Ela NÃO pode inventar.",
    mensagens: [
      "Qual é o valor exato da taxa do visto de investidor para angolanos em 2026, e quantos dias úteis demora?",
    ],
  },
  {
    titulo: "C) IDIOMA — espanhol do começo ao fim, mesmo com material em português.",
    mensagens: [
      "Hola, soy de Venezuela y quiero regularizar mi situación en Brasil",
      "¿Qué documentos necesito presentar?",
    ],
  },
  {
    titulo: "D) HONORÁRIOS — não fala valor, encaminha ao time jurídico.",
    mensagens: ["Quanto vocês cobram para cuidar do meu processo de naturalização?"],
  },
  {
    titulo: "E) CASO CONCRETO — prazo correndo vira transbordo, com dossiê.",
    mensagens: [
      "Recebi uma exigência da Polícia Federal e tenho 10 dias para responder, estou desesperado",
    ],
  },
  {
    titulo: "F) MATERIAL DESATUALIZADO — Mercosul é de 2010, tem que sair com ressalva.",
    mensagens: ["Sou uruguaio, como funciona a residência pelo acordo do Mercosul?"],
  },
];

// Timeout alto de propósito: o DeepSeek às vezes leva minutos por resposta, e um
// roteiro de vários turnos estoura os defaults no meio da última conversa.
it("roteiro de simulação", { timeout: 1800000 }, async () => {
  writeFileSync(OUT, "");

  if (process.env.SEM_SUPABASE === "1") {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // import dinâmico DEPOIS de popular process.env: lib/env lê as variáveis na carga do módulo.
  const { getRepository } = await import("@/lib/data");
  const { processMessage } = await import("@/lib/agent");
  const { ragConfigurado } = await import("@/lib/agent/rag");
  const { useDeepseek, useSupabase } = await import("@/lib/env");

  // O cabeçalho da transcrição diz o que estava LIGADO. Sem isto é fácil olhar um
  // "não tenho essa informação" e culpar o prompt, quando o que faltava era a chave.
  const cabecalho =
    `deepseek=${useDeepseek ? "ON" : "OFF (motor determinístico — é um MENU)"} · ` +
    `supabase=${useSupabase ? "ON" : "OFF (memória)"} · ` +
    `rag=${ragConfigurado() ? "ON" : "OFF (ela vai encaminhar tudo)"}\n`;
  appendFileSync(OUT, cabecalho);
  console.log(`[sim] ${cabecalho.trim()}`);

  const repo = getRepository();
  for (let i = 0; i < ROTEIROS.length; i++) {
    const r = ROTEIROS[i];
    appendFileSync(OUT, `\n${"=".repeat(74)}\n${r.titulo}\n${"=".repeat(74)}\n`);
    const conv = await repo.getOrCreateConversation(`sim:roteiro-${i}-${Date.now()}`);
    for (const msg of r.mensagens) {
      appendFileSync(OUT, `\n[PESSOA] ${msg}\n`);
      const res = await processMessage({ conversationId: conv.id, userText: msg });
      appendFileSync(OUT, `[ANA] ${res.reply}\n`);
      for (const t of res.toolCalls ?? []) {
        appendFileSync(OUT, `   → ${t.name}(${JSON.stringify(t.input)})\n`);
      }
    }
    // O idioma gravado no contato é o que o follow-up automático vai usar depois.
    const depois = await repo.getConversation(conv.id);
    appendFileSync(OUT, `\n[estado] status=${depois?.status} idioma=${depois?.idioma ?? "—"}\n`);
  }

  console.log(`[sim] transcrição em ${OUT}`);
});
