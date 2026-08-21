// Conferência manual do POSTO 24h — NÃO entra na suíte (o vitest.config só inclui
// *.test.ts). Roda o caminho inteiro do caso que o Pedro reportou em 17/08/2026: cotação,
// PDF e planilha de composição, imprimindo os números para conferir contra a CCT.
//
//   npx tsx tests/_posto-24h.manual.ts
//
// A regra que está sendo conferida (Eduardo, 17/08/2026): 1 posto 24h = 4 funcionários na
// escala 12x36, dois com adicional noturno.

import ExcelJS from "exceljs";
import { executeTool } from "@/lib/agent/tools";
import { getRepository } from "@/lib/data";
import { gerarPlanilhaComposicao } from "@/lib/planilha/composicao";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function conferir() {
  const cot = (await executeTool("calcular_preco_servico", {
    service_name: "Porteiro",
    employees_count: 1,
    schedule: "12x36",
    cobertura: "24h",
    region: "Rio de Janeiro",
  })) as Record<string, unknown>;

  console.log("\n── COTAÇÃO ──");
  console.log("dimensionamento:", cot.dimensionamento);
  console.log("turnos:", JSON.stringify(cot.turnos));
  console.log("valor do posto:", brl(cot.unitSalePrice as number));
  if (cot.funcionariosTotais !== 4) throw new Error(`esperava 4 funcionários, veio ${cot.funcionariosTotais}`);

  const prop = (await executeTool("gerar_proposta_pdf", {
    lead_data: { contact_name: "Pedro Provadelli", company_name: "Teste Shine", cnpj: "12.345.678/0001-90" },
    region: "Rio de Janeiro",
    services: [{ name: "Porteiro", quantity: 1, schedule: "12x36", cobertura: "24h" }],
  })) as Record<string, unknown>;
  console.log("\n── PROPOSTA ──");
  // A tool não devolve valor ao modelo de propósito — o total é lido da proposta gravada.
  const gravada = await getRepository().getProposal(String(prop.proposal_id));
  console.log("gerada:", prop.ok !== false, "| total no PDF:", brl(gravada?.totalValue ?? 0));
  console.log("linha:", JSON.stringify(gravada?.services));
  if (!gravada || gravada.totalValue !== cot.unitSalePrice) {
    throw new Error(`o PDF (${gravada?.totalValue}) não fecha com a cotação (${cot.unitSalePrice})`);
  }

  const { buffer, filename } = await gerarPlanilhaComposicao({
    serviceName: "Porteiro",
    employeesCount: 1,
    schedule: "12x36",
    cobertura: "24h",
    dataProposta: new Date(0),
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  console.log("\n── PLANILHA", filename, "──");
  for (const ws of wb.worksheets) {
    console.log("  aba:", ws.name);
    ws.eachRow((row) => {
      const desc = String(row.getCell(2).value ?? "");
      if (/Turno do posto|Adicional noturno|Hora noturna|Quantidade total|Salário normativo|PREÇO/i.test(desc)) {
        console.log(`     ${desc} = ${row.getCell(4).value}`);
      }
    });
  }
  if (wb.worksheets.length !== 2) throw new Error(`esperava 2 abas (diurna e noturna), veio ${wb.worksheets.length}`);
  console.log("\n✓ conferido: 4 funcionários, 2 abas, adicional noturno só na noturna.");
}

conferir().catch((e) => {
  console.error(e);
  process.exit(1);
});
