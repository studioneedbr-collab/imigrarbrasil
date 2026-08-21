import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getRepository } from "@/lib/data";
import { requireAdmin } from "@/lib/auth/guard";
import { montarAbaComposicao, abasDoPosto } from "@/lib/planilha/composicao";
import type { ServiceSchedule } from "@/lib/domain/types";

/**
 * Planilha de composição de custos da proposta, uma aba por posto.
 *
 * É o entregável que o Eduardo pediu em 13/08/2026: a composição preenchida com os dados
 * da CCT, cada célula ao lado da cláusula de onde saiu, para ele conferir o preço em vez
 * de acreditar nele. Gerada sob demanda a partir das linhas gravadas na proposta — assim
 * ela sempre reflete a mesma praça, os mesmos adicionais e o mesmo material que o cliente
 * recebeu no PDF.
 *
 * Só admin: a planilha mostra custo, margem e BDI, que não vão para o cliente.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const proposal = await getRepository().getProposal(params.id);
  if (!proposal) return new NextResponse("Proposta não encontrada", { status: 404 });
  if (!proposal.services?.length) return new NextResponse("Proposta sem serviços", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Shayene — Agente Comercial Shine Rio";
  wb.created = new Date(proposal.createdAt);

  // Um posto por aba, todos no mesmo arquivo — e um posto com cobertura rende uma aba por
  // turno, porque é na aba noturna que estão as linhas D e E para conferir contra a CCT.
  for (const linha of proposal.services) {
    const abas = abasDoPosto({
      serviceName: linha.name,
      employeesCount: linha.quantity,
      schedule: linha.schedule as ServiceSchedule | undefined,
      region: linha.region,
      semUniforme: linha.semUniforme,
      comMaterial: linha.comMaterial,
      cobertura: linha.cobertura,
      adicionais: linha.adicionais,
      dataProposta: new Date(proposal.createdAt),
    });
    for (const aba of abas) {
      montarAbaComposicao(wb.addWorksheet(nomeDeAba(aba.nome, wb)), aba.input);
    }
  }

  const out = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="composicao-${params.id}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Nome de aba válido e único. O Excel recusa aba com mais de 31 caracteres, com
 * : \ / ? * [ ] no nome, ou com nome repetido — e uma proposta pode ter dois postos da
 * mesma função em escalas diferentes.
 */
function nomeDeAba(nome: string, wb: ExcelJS.Workbook): string {
  const limpo = nome.replace(/[:\\/?*[\]]/g, "-").slice(0, 28) || "Posto";
  if (!wb.getWorksheet(limpo)) return limpo;
  for (let i = 2; i < 100; i++) {
    const tentativa = `${limpo.slice(0, 27)} ${i}`;
    if (!wb.getWorksheet(tentativa)) return tentativa;
  }
  return `${limpo.slice(0, 25)} ${Math.floor(wb.worksheets.length)}`;
}
