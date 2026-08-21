import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { sendBrevoEmail } from "@/lib/email/brevo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().email("E-mail do destinatário inválido."),
  toName: z.string().optional(),
});

// Envia (ou reenvia) a proposta em PDF por e-mail, via Brevo. Pode ser chamado quantas
// vezes quiser — o botão fica disponível mesmo depois de já ter enviado.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { to, toName } = bodySchema.parse(await req.json());
    const repo = getRepository();
    const proposal = await repo.getProposal(params.id);
    if (!proposal?.pdfUrl) {
      return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
    }
    const match = proposal.pdfUrl.match(/^data:application\/pdf;base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "PDF da proposta indisponível." }, { status: 415 });
    }

    await sendBrevoEmail({
      to,
      toName,
      subject: "Sua Proposta Comercial · Shine Rio",
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;color:#16202b;line-height:1.6">` +
        `<p>Olá${toName ? ` ${toName}` : ""}, tudo bem?</p>` +
        `<p>Segue em anexo a sua <strong>proposta comercial da Shine Rio</strong>, com todos os detalhes do serviço e do investimento.</p>` +
        `<p>Qualquer dúvida, é só responder este e-mail ou nos chamar no WhatsApp (21) 3540-0693. Vai ser um prazer ajudar.</p>` +
        `<p>Um abraço,<br/><strong>Equipe Comercial · Shine Rio</strong><br/>comercial@shinerio.com</p>` +
        `</div>`,
      pdfBase64: match[1],
      pdfName: `Proposta-Shine-Rio-${params.id.slice(0, 8)}.pdf`,
    });

    await repo.updateProposalEmailStatus(params.id, "enviado");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    // Loga o detalhe internamente, mas devolve mensagem genérica (não vaza detalhes
    // internos do Brevo/Supabase ao cliente).
    console.error("[proposal/email:POST]", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ error: "Falha ao enviar o e-mail." }, { status: 400 });
  }
}
