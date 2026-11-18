import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { podeExportar } from "@/lib/auth/papeis";
import { getRepository } from "@/lib/data";
import { ATENDIMENTO_LABEL } from "@/lib/domain/rotulos";
import { nomeDoIdioma } from "@/lib/domain/idiomas";
import { celulaCsv, daNota, nomeDoFormulario, quandoEmBrasilia } from "@/lib/site/formularios";

export const dynamic = "force-dynamic";

/**
 * A PLANILHA DE QUEM PREENCHEU O FORMULÁRIO DO SITE — todos, não só a página aberta.
 *
 * Segue as regras de app/api/exportar/leads: atendente não exporta, e toda exportação
 * vira linha no log de acesso. O escopo aqui é fixo e estreito de propósito: só os leads
 * que chegaram pelo site, com o contato e de onde vieram — sem classificação, prazo ou
 * situação migratória. É a lista que o comercial pede; a base inteira continua sem botão.
 */
const CABECALHO = ["quando", "nome", "whatsapp", "email", "formulario", "pagina", "idioma", "situacao"];

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  if (!podeExportar(auth.session.role)) {
    return NextResponse.json(
      { error: "Seu perfil não exporta dados. Peça a um advogado ou ao administrador." },
      { status: 403 },
    );
  }

  const { leads } = await getRepository().listarLeadsPorOrigem("site");

  await registrarAcesso(
    auth.session,
    "exportou",
    { tipo: "csv", detalhe: `formularios do site · ${leads.length} linhas` },
    req,
  );

  const corpo = leads.map((l) =>
    [
      quandoEmBrasilia(l.createdAt),
      l.contactName ?? "",
      l.whatsappNumber,
      l.email ?? "",
      nomeDoFormulario(daNota(l.notes, "Origem")),
      daNota(l.notes, "Página") ?? "",
      l.idioma ? nomeDoIdioma(l.idioma) : "",
      l.atendimentoStatus ? ATENDIMENTO_LABEL[l.atendimentoStatus] : "",
    ].map(celulaCsv).join(";"),
  );

  // BOM na frente: sem ele o Excel em português abre "São Paulo" como "SÃ£o Paulo".
  const csv = `\uFEFF${CABECALHO.join(";")}\n${corpo.join("\n")}\n`;
  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="imigrar-formularios-do-site-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
