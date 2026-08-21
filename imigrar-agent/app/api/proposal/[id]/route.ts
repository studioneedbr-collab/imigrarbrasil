import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";

// Serve o PDF da proposta armazenada (data-URL base64 no repositório) como
// application/pdf, para abrir/baixar no navegador.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const repo = getRepository();
  const proposal = await repo.getProposal(params.id);
  if (!proposal?.pdfUrl) {
    return new NextResponse("Proposta não encontrada", { status: 404 });
  }
  const match = proposal.pdfUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) {
    return new NextResponse("Formato de PDF inválido", { status: 415 });
  }
  const buffer = Buffer.from(match[1], "base64");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proposta-${params.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

// Exclui a proposta (somente admin).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    await getRepository().deleteProposal(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[proposal:DELETE]", err);
    return NextResponse.json({ error: "Falha ao excluir a proposta." }, { status: 400 });
  }
}
