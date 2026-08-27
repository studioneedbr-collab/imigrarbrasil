import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireAdmin } from "@/lib/auth/guard";
import { lerProvedores, testarProvedor } from "@/lib/integracoes/provedores";

export const dynamic = "force-dynamic";

/**
 * O status real dos provedores de IA.
 *
 * NENHUMA CHAVE ATRAVESSA ESTA ROTA — nem mascarada. O que desce é o suficiente para
 * decidir: se a credencial está posta, quando o provedor funcionou pela última vez,
 * quantas falhas houve em 24h e para que ele está sendo usado. Ver o comentário no topo
 * de lib/integracoes/provedores.ts.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ provedores: await lerProvedores() });
}

const testeSchema = z.object({
  provedor: z.enum(["deepseek", "openai-transcricao", "openai-embedding"]),
});

/**
 * Testar conexão é um POST, e é de admin: ele gasta (pouco) dinheiro de verdade e
 * escreve uma linha no custo. Um GET disso seria disparado por prefetch do navegador.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof testeSchema>;
  try {
    input = testeSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  }

  return NextResponse.json(await testarProvedor(input.provedor));
}
