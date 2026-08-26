import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * O GRAFO DO MIDDLEWARE NÃO PODE USAR O ALIAS `@/`.
 *
 * Este teste existe por causa de um deploy que falhou três vezes seguidas com:
 *
 *   The Edge Function "middleware" is referencing unsupported modules:
 *     @/lib/auth/session, @/lib/auth/public-paths
 *
 * O nome do erro engana — não há módulo incompatível. O middleware é empacotado para
 * o Edge Runtime dentro de um namespace próprio (`__vc__ns__/0/imigrar-agent/`), e ali
 * o alias `@/` não resolve. O que não resolve vira "externo", e externo no Edge é
 * reportado como "não suportado".
 *
 * O detalhe cruel: NADA disso aparece no build local, no typecheck ou no lint. Só em
 * produção, e o efeito não é uma tela quebrada — é o deploy inteiro não acontecer.
 * Por isso a regra tem teste, e o teste anda pelo grafo inteiro: corrigir só o arquivo
 * de entrada apenas empurra o erro para o import seguinte, que foi exatamente o que
 * aconteceu na segunda tentativa.
 */

const RAIZ = resolve(__dirname, "..");

/** Segue os imports relativos a partir de um arquivo e devolve todos os alcançáveis. */
function grafoDe(entrada: string, vistos = new Set<string>()): string[] {
  const caminho = [entrada, `${entrada}.ts`, `${entrada}/index.ts`].find(existsSync);
  if (!caminho || vistos.has(caminho)) return [];
  vistos.add(caminho);

  const fonte = readFileSync(caminho, "utf8");
  const importados = Array.from(fonte.matchAll(/from\s+"(\.[^"]+)"/g), (m) => m[1]);
  for (const rel of importados) grafoDe(resolve(dirname(caminho), rel), vistos);
  return Array.from(vistos);
}

describe("bundle do middleware (Edge Runtime)", () => {
  const arquivos = grafoDe(resolve(RAIZ, "middleware.ts"));

  it("alcança de fato os módulos de autenticação", () => {
    // Se este teste passar com o grafo vazio, ele não está protegendo nada.
    expect(arquivos.length).toBeGreaterThanOrEqual(3);
    expect(arquivos.some((f) => f.endsWith("session.ts"))).toBe(true);
    expect(arquivos.some((f) => f.endsWith("public-paths.ts"))).toBe(true);
    expect(arquivos.some((f) => f.endsWith("papeis.ts"))).toBe(true);
  });

  it("nenhum módulo do grafo importa pelo alias @/", () => {
    const infratores = arquivos
      .filter((f) => /from\s+"@\//.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(`${RAIZ}/`, ""));

    expect(
      infratores,
      `Use import relativo nestes arquivos — eles rodam no Edge e o alias não resolve lá: ${infratores.join(", ")}`,
    ).toEqual([]);
  });

  it("nenhum módulo do grafo puxa dependência de fora do projeto", () => {
    // Uma dependência de node_modules no grafo do middleware é o outro jeito de
    // quebrar o deploy — foi a `jose` que causou a primeira rodada deste problema.
    const externos = arquivos.flatMap((f) => {
      const fonte = readFileSync(f, "utf8");
      return Array.from(fonte.matchAll(/from\s+"([^".][^"]*)"/g), (m) => m[1]).filter(
        (mod) => !mod.startsWith("next/") && mod !== "next/server",
      );
    });
    expect(externos).toEqual([]);
  });
});
