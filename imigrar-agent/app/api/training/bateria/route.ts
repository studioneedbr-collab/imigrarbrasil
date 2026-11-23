import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { llmEmUso } from "@/lib/agent/llm";
import { CENARIOS, abrirEnsaio, rodarTurno } from "@/lib/agent/bateria";
import { getPromptCru, getSystemPrompt } from "@/lib/agent/system-prompt";
import { diagnosticarPrompt } from "@/lib/agent/diagnostico-treino";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";
// Um turno é uma resposta inteira do modelo (leitura da ficha, resposta e, se preciso, a
// reescrita) — de 5 a 40 segundos.
export const maxDuration = 60;

/**
 * A BATERIA DE TESTES, um turno por pedido.
 *
 * Um turno por pedido porque um cenário inteiro passa do tempo máximo de uma função na
 * Vercel; a tela encadeia os turnos e vai mostrando. Cada turno custa uma resposta do
 * modelo — por isso exige sessão e tem limite por minuto, como o simulador.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const [llm, prompt, cru] = await Promise.all([
    llmEmUso(),
    getSystemPrompt().catch(() => ""),
    getPromptCru().catch(() => null),
  ]);
  return NextResponse.json({
    modelo: llm ? `${llm.nome} · ${llm.modelo}` : null,
    // O treino SALVO, como o modelo o recebe — não o rascunho da tela.
    diagnostico: { ...diagnosticarPrompt(prompt), promptCru: Boolean(cru) },
    cenarios: CENARIOS.map((c) => ({ id: c.id, titulo: c.titulo, vigia: c.vigia, turnos: c.turnos.length })),
  });
}

const schema = z.object({
  cenario: z.string().min(1),
  turno: z.number().int().min(0).max(20).default(0),
  conversationId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const limite = rateLimit(`bateria:${clientIp(req.headers)}`, { limit: 20, windowSeconds: 60 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "Muitos testes seguidos. Aguarde um minuto." }, { status: 429 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Cenário inválido." }, { status: 400 });
  }
  const cenario = CENARIOS.find((c) => c.id === input.cenario);
  if (!cenario) return NextResponse.json({ error: "Cenário inválido." }, { status: 400 });

  // Sem modelo, a bateria mediria o motor determinístico — e diria "passou" sobre algo
  // que não é o que atende os clientes.
  if (!(await llmEmUso())) {
    return NextResponse.json(
      { error: "Nenhum modelo com credencial. Configure o ChatGPT ou o DeepSeek em Integrações." },
      { status: 400 },
    );
  }

  // O turno 0 abre a conversa; os seguintes só valem sobre uma conversa da PRÓPRIA
  // bateria — sem isto, um id de conversa real deixaria injetar mensagem num cliente.
  let conversationId = input.conversationId;
  try {
    if (input.turno === 0 || !conversationId) {
      conversationId = await abrirEnsaio(cenario);
    } else {
      const conv = await getRepository().getConversation(conversationId).catch(() => null);
      if (!conv?.whatsappNumber.startsWith(`sim:bateria-${cenario.id}-`)) {
        return NextResponse.json({ error: "Este ensaio expirou. Rode o cenário de novo." }, { status: 409 });
      }
    }
  } catch {
    return NextResponse.json({ error: "Não foi possível abrir o ensaio. Tente de novo." }, { status: 500 });
  }

  try {
    const r = await rodarTurno(cenario, input.turno, conversationId);
    return NextResponse.json({ conversationId, ...r });
  } catch (err) {
    console.error("[bateria]", err instanceof Error ? err.message : err);
    await getRepository().deleteConversation(conversationId).catch(() => {});
    return NextResponse.json({ error: "O turno falhou. Rode o cenário de novo." }, { status: 500 });
  }
}
