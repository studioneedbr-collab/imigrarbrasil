import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  // O tsconfig usa `jsx: "preserve"` (o Next transforma depois). Sem este plugin o Vite
  // herda esse modo e recusa qualquer .tsx importado por um teste — mesmo quando o teste
  // só quer uma função pura que mora ao lado do componente. Não afeta o build do Next.
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
