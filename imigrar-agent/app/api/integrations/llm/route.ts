import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireAdmin } from "@/lib/auth/guard";
import {
  gravarLlm,
  lerLlmGravado,
  montarLlm,
  todosOsLlms,
  type LlmGravado,
} from "@/lib/agent/llm";
import { testarLlm } from "@/lib/integracoes/provedores";

export const dynamic = "force-dynamic";

/**
 * QUEM ESCREVE AS RESPOSTAS DA AGENTE — a escolha, feita pelo painel.
 *
 * NENHUMA CHAVE ATRAVESSA ESTA ROTA NA VOLTA — nem mascarada. O que desce é qual
 * provedor está escolhido, o modelo de cada um, se há credencial e de onde ela veio
 * (painel ou ambiente). Ver o comentário no topo de lib/integracoes/provedores.ts.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { ativo, llms } = await todosOsLlms();
  return NextResponse.json({
    ativo,
    provedores: llms.map((l) => ({
      provedor: l.provedor,
      nome: l.nome,
      modelo: l.modelo,
      configurado: l.configurado,
      origemDaChave: l.origemDaChave,
    })),
  });
}

const putSchema = z.object({
  ativo: z.enum(["deepseek", "openai"]),
  openaiApiKey: z.string().trim().max(400).optional(),
  // Nome de modelo, não texto livre: ele vai parar numa URL e no corpo da chamada.
  openaiModel: z
    .string()
    .trim()
    .regex(/^[\w.:-]{1,80}$/, "Nome de modelo inválido.")
    .optional(),
});

/**
 * A TROCA SÓ É ACEITA SE O PROVEDOR RESPONDER.
 *
 * Escolher um provedor com chave errada ou modelo que não existe não quebraria nada à
 * vista: a reserva (ou o motor determinístico) assumiria, e a tela diria "ChatGPT"
 * enquanto outro responde. Por isso, antes de gravar, a configuração nova faz uma
 * chamada mínima de verdade — e o que não passa não é salvo.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let input: z.infer<typeof putSchema>;
  try {
    input = putSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : null;
    return NextResponse.json({ error: msg ?? "Dados inválidos." }, { status: 400 });
  }

  const atual = await lerLlmGravado();
  const novo: LlmGravado = {
    ativo: input.ativo,
    // Sem chave nova, fica a que já estava salva (o navegador nunca a recebe de volta).
    openaiApiKey: input.openaiApiKey || atual.openaiApiKey,
    openaiModel: input.openaiModel || atual.openaiModel,
  };

  const escolhido = montarLlm(novo.ativo ?? "deepseek", novo);
  if (!escolhido.configurado) {
    return NextResponse.json(
      {
        error:
          escolhido.provedor === "openai"
            ? "Cole a chave de API da OpenAI para escolher o ChatGPT."
            : "O DeepSeek não tem chave configurada no servidor (DEEPSEEK_API_KEY).",
      },
      { status: 400 },
    );
  }

  // Testa o escolhido sempre que ele muda, e a OpenAI sempre que chave ou modelo mudam —
  // mesmo como reserva: reserva quebrada só se descobre no dia em que ela é necessária.
  const mudouOEscolhido = (atual.ativo ?? "deepseek") !== escolhido.provedor;
  const mudouAOpenai = Boolean(input.openaiApiKey) || (input.openaiModel ?? atual.openaiModel) !== atual.openaiModel;
  const aTestar = mudouAOpenai ? montarLlm("openai", novo) : mudouOEscolhido ? escolhido : null;

  let teste: Awaited<ReturnType<typeof testarLlm>> | null = null;
  if (aTestar?.configurado) {
    teste = await testarLlm(aTestar);
    if (!teste.ok) {
      return NextResponse.json(
        { error: `Nada foi alterado: ${aTestar.nome} não respondeu ao teste. ${teste.detalhe}` },
        { status: 400 },
      );
    }
  }

  await gravarLlm(novo);
  // CONFERE QUE GRAVOU. O `setConfig` do banco não acusa erro (tabela ausente, permissão,
  // rede): sem reler, a tela diria "salvo" e a agente seguiria no provedor antigo.
  const relido = await lerLlmGravado();
  if (relido.ativo !== novo.ativo || relido.openaiModel !== novo.openaiModel || relido.openaiApiKey !== novo.openaiApiKey) {
    return NextResponse.json(
      { error: "O banco não gravou a escolha. Nada mudou — tente de novo." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ativo: escolhido.provedor, modelo: escolhido.modelo, teste });
}
