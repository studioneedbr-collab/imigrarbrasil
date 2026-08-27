import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { registrarAcesso } from "@/lib/auth/auditoria";
import { podeExportar } from "@/lib/auth/papeis";
import { carregarFila } from "@/lib/fila/carregar";
import { rotuloPrazo } from "@/lib/fila/ordenacao";
import type { LeadDaFila } from "@/lib/fila/ordenacao";

export const dynamic = "force-dynamic";

/**
 * EXPORTAÇÃO — restrita, escolhida e registrada.
 *
 * Três decisões, e nenhuma é excesso de zelo:
 *
 * 1. Atendente não exporta. Ele trabalha na fila e no detalhe; tirar a base de dentro do
 *    painel é outra coisa.
 * 2. Não existe exportação em massa por padrão. O `escopo` é obrigatório: sem ele a
 *    rota recusa em vez de mandar tudo. Uma planilha com a situação migratória de
 *    todo mundo, baixada por reflexo e esquecida num Drive compartilhado, é o vazamento
 *    mais provável deste sistema — e o mais fácil de evitar.
 * 3. Toda exportação vira linha no log de acesso, com autor, data e escopo.
 */
const CABECALHO = [
  "id", "criado_em", "nome", "whatsapp", "idioma", "nacionalidade", "localizacao",
  "classificacao", "modalidade_provavel", "objetivo", "relogio_do_caso", "relogio_data", "intencao",
  "tem_prazo_correndo", "prazo_tipo",
  "prazo_data_limite", "dias_restantes", "atendimento", "responsavel",
];

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function linha(l: LeadDaFila): string {
  return [
    l.id, l.createdAt, l.contactName ?? "", l.whatsappNumber, l.idioma ?? "",
    l.nacionalidade ?? "", l.localizacao ?? "", l.classificacao ?? "",
    l.modalidadeProvavel ?? "", l.objetivo ?? "", l.relogioDoCaso ?? "", l.relogioData ?? "", l.intencao ?? "",
    l.temPrazoCorrendo ? "sim" : "não",
    l.prazoTipo ?? "", l.prazoDataLimite ?? "", "", l.atendimentoStatus ?? "",
    l.responsavelNome ?? "",
  ].map(csvEscape).join(";");
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  if (!podeExportar(auth.session.role)) {
    return NextResponse.json(
      { error: "Seu perfil não exporta dados. Peça a um advogado ou ao administrador." },
      { status: 403 },
    );
  }

  const escopo = req.nextUrl.searchParams.get("escopo");
  if (!escopo) {
    return NextResponse.json(
      {
        error:
          "Escolha o que exportar: escopo=prazos (prazos correndo e a confirmar) ou escopo=fila (a fila de trabalho). Não há exportação da base inteira.",
      },
      { status: 400 },
    );
  }

  const { fila } = await carregarFila();
  const linhas =
    escopo === "prazos"
      ? [...fila.aConfirmar, ...fila.correndo.map((i) => i.lead)]
      : escopo === "fila"
        ? [...fila.aConfirmar, ...fila.correndo.map((i) => i.lead), ...fila.normal]
        : null;

  if (!linhas) {
    return NextResponse.json({ error: "Escopo desconhecido." }, { status: 400 });
  }

  await registrarAcesso(
    auth.session,
    "exportou",
    { tipo: "csv", detalhe: `${escopo} · ${linhas.length} linhas` },
    req,
  );

  // Os dias restantes entram calculados, para a planilha não repetir a conta e errar.
  const corpo = linhas.map((l) => {
    const base = linha(l).split(";");
    if (l.prazoDataLimite) {
      const item = fila.correndo.find((i) => i.lead.id === l.id);
      base[13] = csvEscape(item ? rotuloPrazo(item.diasRestantes) : "");
    } else if (l.temPrazoCorrendo) {
      base[13] = "prazo a confirmar";
    }
    return base.join(";");
  });

  // BOM na frente: sem ele o Excel em português abre "Venezuela" como "Venezuela" mas
  // "São Paulo" como "SÃ£o Paulo", e alguém conclui que o sistema corrompeu o dado.
  const csv = `﻿${CABECALHO.join(";")}\n${corpo.join("\n")}\n`;
  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="imigrar-${escopo}-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
