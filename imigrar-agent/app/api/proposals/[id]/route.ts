import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";

const patchSchema = z
  .object({
    status: z.enum(["draft", "sent", "viewed", "accepted", "rejected"]).optional(),
    email_status: z.enum(["nao_enviado", "rascunho_aberto", "enviado"]).optional(),
  })
  .refine((d) => d.status !== undefined || d.email_status !== undefined, {
    message: "Informe status ou email_status.",
  });

// Atualiza o status (comercial e/ou de e-mail) da proposta no CRM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await req.json());
    const repo = getRepository();
    if (body.status !== undefined) await repo.updateProposalStatus(params.id, body.status);
    if (body.email_status !== undefined) await repo.updateProposalEmailStatus(params.id, body.email_status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[proposals:PATCH]", err);
    return NextResponse.json({ error: "Falha ao atualizar proposta" }, { status: 400 });
  }
}
