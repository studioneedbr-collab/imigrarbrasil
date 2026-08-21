import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const repo = getRepository();
  const funcionarios = await repo.listFuncionarios();
  return NextResponse.json({ funcionarios });
}

const createFuncionarioSchema = z.object({
  nome: z.string().min(1),
  cpf: z.string().optional(),
  cargo: z.string().optional(),
  setor: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const data = createFuncionarioSchema.parse(await req.json());
    const repo = getRepository();
    const funcionario = await repo.createFuncionario(data);
    return NextResponse.json({ ok: true, funcionario });
  } catch (err) {
    console.error("[funcionarios:POST]", err);
    return NextResponse.json({ error: "Falha ao criar funcionário." }, { status: 400 });
  }
}
