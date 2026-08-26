// Conferência manual do POSTO 24h — NÃO entra na suíte (o vitest.config só inclui
// *.test.ts). Roda o caminho do motor de preço herdado: cotação, PDF e planilha de
// composição, imprimindo os números para conferir contra a CCT.
//
//   npx tsx tests/_posto-24h.manual.ts
//
// A regra que está sendo conferida: 1 posto 24h = 4 funcionários na escala 12x36, dois
// com adicional noturno.
//
// O script passava pelas tools do agente (`calcular_preco_servico`, `gerar_proposta_pdf`),
// que não existem mais — a Imigrar Brasil não cota serviço pelo assistente. A conferência
// agora chama lib/comercial e lib/pdf direto, que é o que as telas do painel usam.

import ExcelJS from "exceljs";
import { calcularPreco } from "@/lib/comercial/pricing";
import { generateProposalPdf } from "@/lib/pdf/generate";
import { gerarPlanilhaComposicao } from "@/lib/planilha/composicao";
import type { ProposalServiceLine } from "@/lib/domain/types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function conferir() {
  const cot = calcularPreco({
    serviceName: "Porteiro",
    employeesCount: 1,
    schedule: "12x36",
    cobertura: "24h",
    region: "Rio de Janeiro",
  });

  console.log("\n── COTAÇÃO ──");
  console.log("turnos:", JSON.stringify(cot.turnos));
  console.log("valor do posto:", brl(cot.unitSalePrice));
  if (cot.funcionariosTotais !== 4) throw new Error(`esperava 4 funcionários, veio ${cot.funcionariosTotais}`);

  const linha: ProposalServiceLine = {
    name: "Porteiro",
    quantity: 1,
    unitPrice: cot.unitSalePrice,
    schedule: "12x36",
    cobertura: "24h",
    region: "Rio de Janeiro",
  };
  const { filename: pdfName } = await generateProposalPdf({
    leadData: { contact_name: "Conferência", company_name: "Conferência" },
    services: [linha],
    totalValue: cot.totalSalePrice,
  });
  console.log("\n── PROPOSTA ──");
  console.log("gerada:", pdfName, "| total no PDF:", brl(cot.totalSalePrice));
  if (cot.totalSalePrice !== cot.unitSalePrice) {
    throw new Error(`o total (${cot.totalSalePrice}) não fecha com o posto (${cot.unitSalePrice})`);
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
