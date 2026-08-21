import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nome: z.string().optional(),
  empresa: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  cpf: z.string().optional(),
});

// Edição manual dos dados de um cliente pelo painel comercial.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const patch = patchSchema.parse(await req.json());
    const repo = getRepository();
    const cliente = await repo.updateCliente(params.id, patch);
    return NextResponse.json({ ok: true, cliente });
  } catch (err) {
    console.error("[clientes/:id PATCH]", err);
    return NextResponse.json({ error: "Falha ao atualizar cliente." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const repo = getRepository();
    await repo.deleteCliente(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[clientes/:id DELETE]", err);
    return NextResponse.json({ error: "Falha ao excluir cliente." }, { status: 400 });
  }
}
