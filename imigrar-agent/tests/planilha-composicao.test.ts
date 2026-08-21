import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { gerarPlanilhaComposicao, montarAbaComposicao } from "@/lib/planilha/composicao";

const DATA = new Date("2026-08-14T12:00:00Z");
const ASG = "Auxiliar de Serviços Gerais";

/** Lê a aba como pares "descrição → valor", para procurar linha por nome. */
async function linhas(buffer: Buffer): Promise<Map<string, number | string>> {
  const wb = await new ExcelJS.Workbook().xlsx.load(new Uint8Array(buffer) as never);
  const ws = wb.worksheets[0];
  const out = new Map<string, number | string>();
  ws.eachRow((row) => {
    const desc = row.getCell(2).value;
    const val = row.getCell(4).value;
    if (typeof desc === "string" && val !== null && val !== undefined) out.set(desc, val as number | string);
  });
  return out;
}

/** Texto da coluna FONTE na linha cuja descrição começa com `prefixo`. */
async function fonte(buffer: Buffer, prefixo: string): Promise<string> {
  const wb = await new ExcelJS.Workbook().xlsx.load(new Uint8Array(buffer) as never);
  const ws = wb.worksheets[0];
  let achou = "";
  ws.eachRow((row) => {
    const desc = row.getCell(2).value;
    if (typeof desc === "string" && desc.startsWith(prefixo)) achou = String(row.getCell(5).value ?? "");
  });
  return achou;
}

describe("planilha de composição de custos", () => {
  // A planilha é o entregável que o Eduardo confere. Se ela não reproduzir a aba SERVENTE
  // da planilha modelo Shine Rio 2026, a conferência não fecha e o número não vale nada.
  it("reproduz a aba SERVENTE da planilha modelo, módulo a módulo", async () => {
    const { buffer, preco } = await gerarPlanilhaComposicao({
      serviceName: ASG,
      employeesCount: 1,
      dataProposta: DATA,
    });
    const l = await linhas(buffer);
    expect(l.get("Salário base")).toBeCloseTo(1851.9, 2);
    expect(l.get("TOTAL DA REMUNERAÇÃO")).toBeCloseTo(1851.9, 2);
    expect(l.get("TOTAL 2.1")).toBeCloseTo(378.34, 2);
    expect(l.get("TOTAL 2.2")).toBeCloseTo(787.27, 1);
    expect(l.get("TOTAL 2.3")).toBeCloseTo(666.19, 2);
    expect(l.get("TOTAL MÓDULO 3")).toBeCloseTo(112.42, 1);
    expect(l.get("TOTAL 4.1")).toBeCloseTo(87.01, 2);
    expect(l.get("SUBTOTAL (A+B+C+D+E)")).toBeCloseTo(3930.1, 2);
    expect(l.get("TOTAL MÓDULO 6")).toBeCloseTo(1035.38, 1);
    expect(l.get("VALOR TOTAL POR EMPREGADO")).toBeCloseTo(4965.47, 2);
    expect(preco.unitSalePrice).toBeCloseTo(4965.47, 2);
  });

  it("os módulos somam o subtotal e o subtotal mais o módulo 6 dão o preço", async () => {
    const { buffer } = await gerarPlanilhaComposicao({
      serviceName: "Porteiro",
      employeesCount: 3,
      adicionais: { noturno: true, intrajornadaIndenizada: true },
      dataProposta: DATA,
    });
    const l = await linhas(buffer);
    const soma =
      Number(l.get("Módulo 1 — Composição da remuneração")) +
      Number(l.get("Módulo 2 — Encargos e benefícios anuais, mensais e diários")) +
      Number(l.get("Módulo 3 — Provisão para rescisão")) +
      Number(l.get("Módulo 4 — Custo de reposição do profissional ausente")) +
      Number(l.get("Módulo 5 — Insumos diversos"));
    expect(soma).toBeCloseTo(Number(l.get("SUBTOTAL (A+B+C+D+E)")), 1);
    expect(
      Number(l.get("SUBTOTAL (A+B+C+D+E)")) + Number(l.get("Módulo 6 — Custos indiretos, tributos e lucro")),
    ).toBeCloseTo(Number(l.get("VALOR TOTAL POR EMPREGADO")), 1);
    expect(Number(l.get("VALOR TOTAL DO CONTRATO (3 posto(s))"))).toBeCloseTo(
      Number(l.get("VALOR TOTAL POR EMPREGADO")) * 3,
      1,
    );
  });

  // A coluna FONTE é o motivo de a planilha existir: sem ela, é só um número que a IA
  // produziu. Cada célula vinda da convenção tem que dizer de qual cláusula saiu.
  it("cada célula da CCT traz a cláusula de origem", async () => {
    const { buffer } = await gerarPlanilhaComposicao({
      serviceName: ASG,
      employeesCount: 1,
      adicionais: { insalubridade: "maximo" },
      dataProposta: DATA,
    });
    expect(await fonte(buffer, "Salário base")).toMatch(/CCT RJ/);
    expect(await fonte(buffer, "Adicional de insalubridade")).toMatch(/Cláusula 18ª/);
    expect(await fonte(buffer, "Adicional noturno")).toMatch(/Cláusula 17ª/);
    expect(await fonte(buffer, "Vale-transporte")).toMatch(/Cláusula 22ª/);
    expect(await fonte(buffer, "Auxílio-refeição")).toMatch(/Cláusula 21ª/);
    expect(await fonte(buffer, "Benefício Social Familiar")).toMatch(/Cláusula 27ª/);
  });

  // Planilha bonita com número não conferido é pior que planilha nenhuma.
  it("avisa em vermelho quando a cotação saiu sob consulta", async () => {
    const { buffer, preco } = await gerarPlanilhaComposicao({
      serviceName: ASG,
      employeesCount: 1,
      region: "São Paulo",
      dataProposta: DATA,
    });
    expect(preco.sobConsulta).toBe(true);
    const wb = await new ExcelJS.Workbook().xlsx.load(new Uint8Array(buffer) as never);
    const texto = JSON.stringify(wb.worksheets[0].getSheetValues());
    expect(texto).toMatch(/NÃO É PREÇO FINAL/);
    expect(texto).toMatch(/São Paulo/);
  });

  it("avisa quando o piso veio da regra de enquadramento, não da tabela", async () => {
    const { buffer } = await gerarPlanilhaComposicao({
      serviceName: "Operador de Piscina",
      employeesCount: 1,
      dataProposta: DATA,
    });
    const wb = await new ExcelJS.Workbook().xlsx.load(new Uint8Array(buffer) as never);
    expect(JSON.stringify(wb.worksheets[0].getSheetValues())).toMatch(/não está nominalmente na tabela/);
  });

  it("um posto por aba, sem nome repetido nem nome longo demais para o Excel", () => {
    const wb = new ExcelJS.Workbook();
    for (const nome of ["Porteiro", "Porteiro", "Enfermeira Supervisora de Higienização"]) {
      const ws = wb.addWorksheet(nome.slice(0, 28) === wb.worksheets[0]?.name ? `${nome} 2` : nome.slice(0, 28));
      montarAbaComposicao(ws, { serviceName: nome, employeesCount: 1, dataProposta: DATA });
    }
    expect(wb.worksheets.length).toBe(3);
    for (const ws of wb.worksheets) expect(ws.name.length).toBeLessThanOrEqual(31);
  });
});
