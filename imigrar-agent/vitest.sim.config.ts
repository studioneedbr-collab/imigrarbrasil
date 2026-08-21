import { defineConfig } from "vitest/config";
import path from "node:path";

// Config só do smoke test manual (tests/_simulacao.manual.ts), que chama o DeepSeek
// de verdade e por isso fica fora do `npm test`. O vitest 4 removeu a flag --include,
// então não dá mais para incluir o arquivo pela linha de comando:
//   npx vitest run --config vitest.sim.config.ts
export default defineConfig({
  test: { environment: "node", include: ["tests/_simulacao.manual.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
