import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { requireSession, forbidden } from "@/lib/auth/guard";
import { normalizarPapel } from "@/lib/auth/papeis";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { MOTIVOS_DE_ESPERA, type MotivoEspera } from "@/lib/followup/motivos";

export const dynamic = "force-dynamic";

/**
 * OS MODELOS DE FOLLOW-UP — um por motivo de espera, traduzido para cada idioma.
 *
 * LER é de todo mundo: quem atende precisa saber o que o sistema diria em nome dele antes
 * de aprovar um rascunho.
 *
 * ESCREVER fica com advogado e administrador. Um modelo não é preferência pessoal — é a
 * frase que sai do único número do escritório, no nome dele, para dezenas de pessoas.
 * Escrever "seu processo já foi aprovado" num modelo é diferente de escrever isso numa
 * conversa: o erro não acontece uma vez, acontece toda vez.
 */
function podeEditar(role: unknown): boolean {
  const papel = normalizarPapel(role);
  return papel === "admin" || papel === "advogado";
}

const schema = z.object({
  id: z.string().optional(),
  motivo: z.enum(MOTIVOS_DE_ESPERA as [MotivoEspera, ...MotivoEspera[]]),
  /** ISO-639-1. É por ele que o disparo casa com o idioma gravado no contato. */
  idioma: z.string().trim().min(2).max(8),
  texto: z.string().trim().min(10).max(600),
  variantes: z.array(z.string().trim().max(600)).max(5).default([]),
  /**
   * `automatico` sai sozinho. É o único campo aqui que pode custar o número do
   * escritório, e por isso o padrão é `rascunho` — a decisão de ligar o automático tem de
   * ser um ato, não um esquecimento.
   */
  envio: z.enum(["rascunho", "automatico"]).default("rascunho"),
  ativo: z.boolean().default(true),
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const modelos = await getRepository().listModelosFollowup().catch(() => []);
  return NextResponse.json({ modelos });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditar(auth.session.role)) return forbidden();

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Modelo inválido — confira motivo, idioma e texto." }, { status: 400 });
  }

  const modelo = await getRepository().salvarModeloFollowup(
    { ...input, idioma: input.idioma.toLowerCase() },
    auth.session.email,
  );
  await registrarAcesso(
    auth.session,
    "salvou_modelo_followup",
    { tipo: "followup_modelo", id: modelo.id, detalhe: `${modelo.motivo} · ${modelo.idioma} · ${modelo.envio}` },
    req,
  );
  return NextResponse.json({ ok: true, modelo });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (!podeEditar(auth.session.role)) return forbidden();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Diga qual modelo." }, { status: 400 });
  await getRepository().apagarModeloFollowup(id);
  await registrarAcesso(auth.session, "apagou_modelo_followup", { tipo: "followup_modelo", id }, req);
  return NextResponse.json({ ok: true });
}
