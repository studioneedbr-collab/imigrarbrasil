import { defineConfig } from "vitest/config";
import path from "node:path";

// Config só do dump do prompt (tests/_prompt.manual.ts), que ESCREVE um arquivo e por
// isso fica fora do `npm test`. O vitest 4 removeu a flag --include, então não dá para
// incluir o arquivo pela linha de comando:
//   npx vitest run --config vitest.prompt.config.ts
export default defineConfig({
  test: { environment: "node", include: ["tests/_prompt.manual.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
