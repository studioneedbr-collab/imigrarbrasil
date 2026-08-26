import ExcelJS from "exceljs";
import {
  calcularPreco,
  SUBMODULOS,
  CUSTOS_INDIRETOS,
  LUCRO,
  TRIBUTOS,
  type AdicionaisInput,
  type PriceResult,
} from "@/lib/comercial/pricing";
import type { ServiceSchedule } from "@/lib/domain/types";
import { dimensionar, type Cobertura } from "@/lib/comercial/dimensionamento";

/**
 * PLANILHA DE COMPOSIÇÃO DE CUSTOS — gerada por cotação.
 *
 * É o pedido do Eduardo de 13/08/2026: "o ideal seria a IA inserir os dados da CCT em uma
 * planilha modelo, e a partir dessa planilha modelo que será uma constante, ela chegasse
 * aos preços". A planilha modelo é a aba SERVENTE da "PLANILHA DE COMPOSIÇÃO DE CUSTOS
 * SHINE RIO 2026.xlsx" (layout da IN 05/2017), e este módulo a reproduz preenchida.
 *
 * A coluna FONTE é o motivo de este arquivo existir. Cada célula que veio da convenção
 * traz a cláusula ao lado, para o Eduardo e o Pedro conferirem sem reabrir o PDF da CCT.
 * Sem ela a planilha seria só mais um número que a IA produziu.
 */

export interface PlanilhaInput {
  serviceName: string;
  employeesCount: number;
  schedule?: ServiceSchedule;
  region?: string;
  semUniforme?: boolean;
  comMaterial?: boolean;
  adicionais?: AdicionaisInput;
  /** Data de apresentação da proposta. Injetada de fora para a planilha ser reproduzível. */
  dataProposta?: Date;
  /** Preenchido por `abasDoPosto` quando a aba é um turno de um posto com cobertura. */
  turno?: { descricao: string; fonte: string };
}

/**
 * Quebra um posto nas abas que a planilha precisa ter.
 *
 * Posto sem cobertura: uma aba, como sempre. Posto 24h: UMA ABA POR TURNO — a diurna e a
 * noturna. É a única forma de o Pedro conferir contra a CCT: é na aba noturna que aparecem
 * as linhas D (adicional noturno, 20% pela cláusula 17ª) e E (hora noturna reduzida), e uma
 * aba só, com os quatro funcionários misturados, não casaria com cláusula nenhuma.
 */
export function abasDoPosto(
  input: PlanilhaInput & { cobertura?: Cobertura },
): Array<{ nome: string; input: PlanilhaInput }> {
  const { cobertura, ...base } = input;
  if (!cobertura) return [{ nome: base.serviceName, input: base }];

  const dim = dimensionar(cobertura);
  const postos = base.employeesCount;
  return dim.turnos.map((t) => ({
    nome: `${base.serviceName} ${cobertura === "24h" ? "24h" : ""} ${t.rotulo}`.replace(/\s+/g, " ").trim(),
    input: {
      ...base,
      // A aba é do turno: a quantidade são os funcionários daquele turno no contrato todo.
      employeesCount: t.funcionariosPorPosto * postos,
      adicionais: t.noturno ? { ...base.adicionais, noturno: true } : base.adicionais,
      turno: {
        descricao: `${t.rotulo} — ${t.funcionariosPorPosto} funcionário(s) por posto, em ${postos} × ${dim.rotulo}`,
        fonte: t.noturno
          ? "Turno que cruza a janela legal das 22h às 5h: adicional noturno e hora noturna reduzida nas linhas D e E do Módulo 1"
          : "Turno diurno: sem adicional noturno no Módulo 1",
      },
    },
  }));
}

const MOEDA = '"R$" #,##0.00';
const PCT = "0.00%";

/** Workbook de um posto só. Para vários postos, use `abasDoPosto` + `montarAbaComposicao`. */
export async function gerarPlanilhaComposicao(
  input: PlanilhaInput & { cobertura?: Cobertura },
): Promise<{ buffer: Buffer; filename: string; preco: PriceResult }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shayene — Agente Comercial Shine Rio";
  wb.created = input.dataProposta ?? new Date(0);
  const abas = abasDoPosto(input);
  const resultados = abas.map((a, i) =>
    montarAbaComposicao(wb.addWorksheet(abas.length === 1 ? "COMPOSIÇÃO" : nomeCurtoDeAba(a.nome, i)), a.input),
  );
  const r = resultados[0];
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `composicao-${slug(r.serviceName)}-${r.cct.uf}.xlsx`, preco: r };
}

/** O Excel recusa aba com mais de 31 caracteres ou com : \ / ? * [ ] no nome. */
function nomeCurtoDeAba(nome: string, i: number): string {
  const limpo = nome.replace(/[:\\/?*[\]]/g, "-").slice(0, 28).trim();
  return limpo || `Turno ${i + 1}`;
}

/**
 * Preenche uma aba com a composição de um posto e devolve a cotação usada.
 *
 * Recebe a aba em vez de criar o arquivo para a proposta com vários postos poder juntar
 * tudo num workbook só, sem ter que reabrir e copiar célula por célula.
 */
export function montarAbaComposicao(ws: ExcelJS.Worksheet, input: PlanilhaInput): PriceResult {
  const r = calcularPreco(input);
  const b = r.costBreakdown;

  ws.columns = [
    { width: 6 }, // A — letra do item
    { width: 62 }, // B — descrição
    { width: 10 }, // C — %
    { width: 14 }, // D — valor
    { width: 90 }, // E — fonte na CCT
  ];

  let row = 0;
  const next = () => ws.getRow(++row);

  const titulo = (texto: string) => {
    const l = next();
    l.getCell(1).value = texto;
    ws.mergeCells(row, 1, row, 5);
    l.getCell(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    l.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    l.getCell(1).alignment = { vertical: "middle" };
    l.height = 20;
  };

  const secao = (texto: string) => {
    const l = next();
    l.getCell(1).value = texto;
    ws.mergeCells(row, 1, row, 5);
    l.getCell(1).font = { bold: true };
    l.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
  };

  const item = (letra: string, desc: string, valor: number | string, pct?: number, fonte?: string) => {
    const l = next();
    l.getCell(1).value = letra;
    l.getCell(2).value = desc;
    if (typeof pct === "number") {
      l.getCell(3).value = pct;
      l.getCell(3).numFmt = PCT;
    }
    l.getCell(4).value = valor;
    if (typeof valor === "number") l.getCell(4).numFmt = MOEDA;
    if (fonte) {
      l.getCell(5).value = fonte;
      l.getCell(5).font = { size: 9, italic: true, color: { argb: "FF555555" } };
      l.getCell(5).alignment = { wrapText: true, vertical: "top" };
    }
  };

  const total = (desc: string, valor: number) => {
    const l = next();
    l.getCell(2).value = desc;
    l.getCell(4).value = valor;
    l.getCell(4).numFmt = MOEDA;
    l.getCell(2).font = { bold: true };
    l.getCell(4).font = { bold: true };
    l.getCell(2).border = { top: { style: "thin" } };
    l.getCell(4).border = { top: { style: "thin" } };
  };

  const vazia = () => next();

  // ─────────────────── Cabeçalho ───────────────────
  titulo("PLANILHA DE COMPOSIÇÃO DE CUSTOS E FORMAÇÃO DE PREÇOS — SHINE RIO");
  vazia();
  secao("DISCRIMINAÇÃO DOS SERVIÇOS (DADOS REFERENTES À CONTRATAÇÃO)");
  item("A", "Data de apresentação da proposta", formatarData(input.dataProposta));
  item("B", "Município / UF", `${r.regiao} / ${r.cct.uf}`);
  item("C", "Convenção Coletiva de Trabalho aplicável", r.cct.sindicato || "—", undefined, r.cct.documento);
  item("D", "Vigência da convenção", r.cct.vigencia || "—");
  item("E", "Nº de meses de execução contratual", 12);
  vazia();

  secao("IDENTIFICAÇÃO DO SERVIÇO");
  item("1", "Unidade de medida", input.turno ? "Funcionário" : "Posto");
  item("2", "Quantidade total a contratar", input.employeesCount);
  item("3", "Cargo", r.serviceName);
  item("4", "Escala", r.schedule);
  // Numa cobertura, esta aba é UM TURNO do posto — não o posto inteiro. Sem esta linha o
  // Pedro abriria duas abas com o mesmo cargo e o mesmo salário e não saberia por que uma
  // delas tem adicional noturno.
  if (input.turno) {
    item("5", "Turno do posto", input.turno.descricao, undefined, input.turno.fonte);
  }
  vazia();

  secao("MÃO DE OBRA VINCULADA À EXECUÇÃO CONTRATUAL");
  item("1", "Tipo do serviço", "Asseio, conservação e serviços terceirizáveis");
  item("2", "Salário normativo da categoria profissional", b.modulo1.salarioBase, undefined, r.fontePiso);
  vazia();

  // ─────────────────── Módulo 1 ───────────────────
  // As linhas B a F são as "células pendentes" que o Eduardo listou: adicional noturno,
  // insalubridade, periculosidade e adicional de liderança. Ficam zeradas quando o posto
  // não tem o adicional — e é assim que tem que ser, não é falta de dado.
  secao("MÓDULO 01: COMPOSIÇÃO DA REMUNERAÇÃO");
  const ad = r.cctAdicionais;
  // O percentual só aparece quando o adicional foi de fato aplicado. Mostrar "30%" ao
  // lado de um valor zerado faria a planilha parecer errada na conferência do Eduardo.
  const pctSe = (valor: number, pct?: number) => (valor > 0 ? pct : undefined);
  item("A", "Salário base", b.modulo1.salarioBase, undefined, r.fontePiso);
  item("B", "Adicional de periculosidade", b.modulo1.periculosidade, pctSe(b.modulo1.periculosidade, ad?.periculosidade?.percentual), ad?.periculosidade?.fonte ?? semClausula("periculosidade", r));
  item("C", "Adicional de insalubridade", b.modulo1.insalubridade, undefined, ad?.insalubridade?.fonte ?? semClausula("insalubridade", r));
  item("D", "Adicional noturno", b.modulo1.adicionalNoturno, pctSe(b.modulo1.adicionalNoturno, ad?.noturno?.percentual), ad?.noturno?.fonte ?? semClausula("adicional noturno", r));
  item("E", "Hora noturna reduzida (52min30s)", b.modulo1.horaNoturnaReduzida, undefined, ad?.noturno?.horaReduzida ? "Art. 73 §1º da CLT, na forma da cláusula de adicional noturno da convenção" : "A convenção fixou a hora noturna em 60 minutos — não há hora reduzida a pagar");
  item("F", "Gratificação de função (liderança/encarregado)", b.modulo1.gratificacaoFuncao, undefined, ad?.lideranca?.fonte ?? semClausula("gratificação de liderança", r));
  total("TOTAL DA REMUNERAÇÃO", b.remuneracao);
  vazia();

  // ─────────────────── Módulo 2 ───────────────────
  secao("MÓDULO 02: ENCARGOS E BENEFÍCIOS ANUAIS, MENSAIS E DIÁRIOS");
  secao("Submódulo 2.1 — 13º salário e adicional de férias");
  for (const [desc, taxa] of SUBMODULOS.m21) {
    item("", desc, arred(b.remuneracao * taxa), taxa, "Percentual da planilha modelo Shine Rio 2026 (IN 05/2017)");
  }
  total("TOTAL 2.1", b.decimoTerceiroFerias);
  vazia();

  secao("Submódulo 2.2 — GPS, FGTS e outras contribuições");
  const baseEncargos = b.remuneracao + b.decimoTerceiroFerias;
  for (const [desc, taxa] of SUBMODULOS.m22) {
    item("", desc, arred(baseEncargos * taxa), taxa, "Incide sobre a remuneração acrescida do 13º e das férias (Módulo 1 + Submódulo 2.1)");
  }
  total("TOTAL 2.2", b.encargos);
  vazia();

  secao("Submódulo 2.3 — Benefícios mensais e diários");
  const ben = r.cctBeneficios;
  const dias = r.diasTrabalhadosMes;
  item(
    "A",
    `Vale-transporte (${ben?.valeTransporte.passagensDia ?? 2} passagens × ${dias} dias, menos o desconto legal)`,
    b.beneficiosDetalhe.valeTransporte,
    undefined,
    ben?.valeTransporte.fonte,
  );
  item("B", "Auxílio-refeição / alimentação", b.beneficiosDetalhe.alimentacao, undefined, ben?.alimentacao.fonte);
  item("C", "Cesta básica", b.beneficiosDetalhe.cestaBasica, undefined, ben?.cestaBasica?.fonte ?? "A convenção desta praça não prevê cesta básica");
  item("D", "Benefício Social Familiar", b.beneficiosDetalhe.beneficioSocial, undefined, ben?.beneficioSocial?.fonte ?? "A convenção desta praça não prevê Benefício Social Familiar");
  total("TOTAL 2.3", b.beneficios);
  vazia();

  secao("QUADRO RESUMO DO MÓDULO 2");
  item("2.1", "13º salário e adicional de férias", b.decimoTerceiroFerias);
  item("2.2", "GPS, FGTS e outras contribuições", b.encargos);
  item("2.3", "Benefícios mensais e diários", b.beneficios);
  total("TOTAL MÓDULO 2", arred(b.decimoTerceiroFerias + b.encargos + b.beneficios));
  vazia();

  // ─────────────────── Módulo 3 ───────────────────
  secao("MÓDULO 03: PROVISÃO PARA RESCISÃO");
  for (const [desc, taxa] of SUBMODULOS.m3) {
    item("", desc, arred(b.remuneracao * taxa), taxa, "Percentual da planilha modelo Shine Rio 2026 (IN 05/2017)");
  }
  total("TOTAL MÓDULO 3", b.provisaoRescisao);
  vazia();

  // ─────────────────── Módulo 4 ───────────────────
  secao("MÓDULO 04: CUSTO DE REPOSIÇÃO DO PROFISSIONAL AUSENTE");
  secao("Submódulo 4.1 — Ausências legais");
  for (const [desc, peso] of SUBMODULOS.m41) {
    item("", desc, arred(b.reposicaoAusencias * peso), undefined, "Rateio do total do submódulo 4.1, calibrado na planilha modelo Shine Rio 2026");
  }
  total("TOTAL 4.1", b.reposicaoAusencias);
  vazia();

  secao("Submódulo 4.2 — Intrajornada");
  item(
    "A",
    "Substituto/indenização do intervalo para repouso ou alimentação",
    b.intrajornada,
    undefined,
    r.cctAdicionais?.intrajornada?.fonte ??
      "A convenção desta praça não tem cláusula de intervalo intrajornada cadastrada",
  );
  total("TOTAL 4.2", b.intrajornada);
  vazia();

  secao("QUADRO RESUMO DO MÓDULO 4");
  item("4.1", "Substituto nas ausências legais", b.reposicaoAusencias);
  item("4.2", "Substituto na intrajornada", b.intrajornada);
  total("TOTAL MÓDULO 4", arred(b.reposicaoAusencias + b.intrajornada));
  vazia();

  // ─────────────────── Módulo 5 ───────────────────
  secao("MÓDULO 05: INSUMOS DIVERSOS");
  item("A", "Uniformes (custo mensal por empregado)", b.uniforme, undefined,
    input.semUniforme
      ? "Zerado: o cliente informou que fornece o uniforme"
      : "Aba UNIFORME da planilha Shine Rio 2026 — compra da Shine, não é obrigação da convenção");
  item("B", "Equipamentos", b.equipamentos, undefined, rateioFonte(r, "EQUIPAMENTOS"));
  item("C", "Material", b.material, undefined, rateioFonte(r, "MATERIAL"));
  total("TOTAL MÓDULO 5", arred(b.uniforme + b.equipamentos + b.material));
  vazia();

  // ─────────────────── Módulo 6 ───────────────────
  // Custos indiretos e lucro incidem "por dentro" (cada um sobre o acumulado anterior) e
  // os tributos sobre o preço final. Os percentuais vêm de pricing.ts para a planilha
  // nunca mostrar uma margem diferente da que o motor cobrou.
  secao("MÓDULO 06: CUSTOS INDIRETOS, TRIBUTOS E LUCRO");
  const indiretos = arred(b.custoPuro * CUSTOS_INDIRETOS);
  const lucro = arred((b.custoPuro + indiretos) * LUCRO);
  const tributos = arred(b.bdi - indiretos - lucro);
  item("A", "Custos indiretos", indiretos, CUSTOS_INDIRETOS, "Taxa administrativa definida pela Shine Rio (17/08/2026)");
  item("B", "Lucro", lucro, LUCRO, "Taxa administrativa definida pela Shine Rio (17/08/2026)");
  item("C", "Tributos (PIS 1,39% + COFINS 6,42% + ISS 5,00%)", tributos, TRIBUTOS, "Tributação: Lucro Real. Incidem sobre o preço de venda");
  total("TOTAL MÓDULO 6", b.bdi);
  vazia();

  // ─────────────────── Resumo ───────────────────
  secao("QUADRO RESUMO DO CUSTO POR EMPREGADO");
  item("A", "Módulo 1 — Composição da remuneração", b.remuneracao);
  item("B", "Módulo 2 — Encargos e benefícios anuais, mensais e diários", arred(b.decimoTerceiroFerias + b.encargos + b.beneficios));
  item("C", "Módulo 3 — Provisão para rescisão", b.provisaoRescisao);
  item("D", "Módulo 4 — Custo de reposição do profissional ausente", arred(b.reposicaoAusencias + b.intrajornada));
  item("E", "Módulo 5 — Insumos diversos", arred(b.uniforme + b.equipamentos + b.material));
  total("SUBTOTAL (A+B+C+D+E)", b.custoPuro);
  item("F", "Módulo 6 — Custos indiretos, tributos e lucro", b.bdi);

  const l = next();
  l.getCell(2).value = "VALOR TOTAL POR EMPREGADO";
  l.getCell(4).value = b.precoVenda;
  l.getCell(4).numFmt = MOEDA;
  for (const c of [2, 4]) {
    l.getCell(c).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    l.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  }

  const t = next();
  t.getCell(2).value = `VALOR TOTAL DO CONTRATO (${input.employeesCount} posto(s))`;
  t.getCell(4).value = r.totalSalePrice;
  t.getCell(4).numFmt = MOEDA;
  for (const c of [2, 4]) {
    t.getCell(c).font = { bold: true, size: 12 };
    t.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
  }
  vazia();

  // ─────────────────── Avisos ───────────────────
  // Uma planilha bonita com um número não conferido é pior que nenhuma planilha. Se o
  // motor não pôde cotar, isso aparece em vermelho no topo do rodapé, não escondido.
  const avisos: string[] = [];
  if (r.sobConsulta) {
    avisos.push("⚠ ESTE VALOR NÃO É PREÇO FINAL — a cotação saiu sob consulta. Não envie ao cliente sem passar por um consultor.");
  }
  if (!r.cctCadastrada) {
    avisos.push(`⚠ A convenção de ${r.regiao} ainda não foi conferida. Os valores desta planilha vieram do documento, mas nenhuma pessoa validou.`);
  }
  if (r.pisoPorFallback) {
    avisos.push(`ⓘ Esta função não está nominalmente na tabela de pisos. O piso saiu da regra de enquadramento da própria convenção: ${r.fontePiso}`);
  }
  for (const a of r.adicionaisNaoCobertos) {
    avisos.push(`⚠ ${a.adicional}: ${a.motivo}`);
  }
  if (r.materialSobConsulta) {
    avisos.push("⚠ O material não entrou no preço: o contrato tem postos de menos para o rateio. Quem dimensiona é a Mesa de Operação.");
  }
  if (avisos.length) {
    secao("OBSERVAÇÕES");
    for (const a of avisos) {
      const linha = next();
      linha.getCell(2).value = a;
      ws.mergeCells(row, 2, row, 5);
      linha.getCell(2).font = { size: 10, color: { argb: a.startsWith("⚠") ? "FFC00000" : "FF555555" } };
      linha.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
  }

  return r;
}

function semClausula(adicional: string, r: PriceResult): string {
  return `A convenção de ${r.regiao} não tem cláusula de ${adicional} cadastrada`;
}

function rateioFonte(r: PriceResult, aba: string): string {
  return r.comMaterial
    ? `Aba ${aba} da planilha Shine Rio 2026, rateada pelos postos do contrato`
    : "Não incluso: o posto é só mão de obra. Material e equipamento são orçados à parte, pela Mesa de Operação";
}

function formatarData(d?: Date): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
