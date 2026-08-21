import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasAnyUser, createFirstAdmin, SetupAlreadyDoneError } from "@/lib/auth/bootstrap";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { useSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// Em produção SEM persistência (modo memória), a tabela de usuários zera a cada cold
// start e o /setup reabriria para qualquer um virar admin. Fecha esse buraco.
const setupBlockedInMemoryProd = process.env.NODE_ENV === "production" && !useSupabase;

/**
 * Cadastro do primeiro administrador. Aberto (não passa pelo middleware) apenas
 * enquanto não existe nenhum usuário; depois disso responde 403 permanentemente.
 * É o que substitui ADMIN_EMAIL/ADMIN_PASSWORD em variável de ambiente.
 */

// GET informa à tela /setup se ainda há o que fazer. Só devolve um booleano —
// nenhum dado de usuário — para não virar um oráculo de existência de contas.
export async function GET() {
  return NextResponse.json({ needsSetup: !(await hasAnyUser()) });
}

const schema = z.object({
  email: z.string().email().max(254),
  // 12 caracteres: é uma conta de administrador criada uma única vez, não há
  // razão para aceitar senha curta.
  password: z.string().min(12).max(200),
  name: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  if (setupBlockedInMemoryProd) {
    return NextResponse.json(
      { error: "Setup indisponível: configure o banco (Supabase) antes de criar o administrador." },
      { status: 503 },
    );
  }
  const limit = rateLimit(`setup:${clientIp(req.headers)}`, { limit: 5, windowSeconds: 900 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  try {
    const body = schema.parse(await req.json());
    await createFirstAdmin(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SetupAlreadyDoneError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Informe um e-mail válido e uma senha de ao menos 12 caracteres." },
        { status: 400 },
      );
    }
    console.error("[auth:setup]", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ error: "Falha ao criar o administrador." }, { status: 500 });
  }
}
