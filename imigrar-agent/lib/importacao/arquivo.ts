// LER O ARQUIVO QUE A PESSOA SUBIU.
//
// CSV e XLSX, porque é o que sai do Google Sheets: "Fazer download" oferece os dois, e
// obrigar a escolher CSV é o tipo de instrução que alguém erra às sete da noite de uma
// sexta. O `exceljs` já era dependência do projeto.
//
// O XLSX TRAZ DATA COMO `Date`, e o CSV traz como texto. Quem lê a célula lida com os
// dois (ver `dataDaPlanilha`) — converter tudo para texto aqui perderia justamente a
// informação mais confiável que o formato binário tem.

import ExcelJS from "exceljs";

export interface PlanilhaLida {
  cabecalho: string[];
  linhas: unknown[][];
  /** Em que linha do arquivo estava o cabeçalho (1 = a primeira). */
  linhaDoCabecalho: number;
}

/** O mesmo leitor de CSV da carga inicial: campo com vírgula dentro é a regra aqui. */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const s = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/**
 * ONDE COMEÇA A TABELA.
 *
 * Planilha de escritório não começa na primeira linha: tem título, subtítulo, uma faixa
 * colorida com o nome do bloco, às vezes uma linha em branco. A do comercial tem quatro
 * antes do cabeçalho.
 *
 * O cabeçalho é a primeira linha com pelo menos três células preenchidas e distintas —
 * título mesclado repete o mesmo texto em todas as colunas, e é assim que ele se denuncia.
 */
export function acharCabecalho(linhas: unknown[][]): number {
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const celulas = linhas[i].map((c) => String(c ?? "").trim()).filter(Boolean);
    if (celulas.length < 3) continue;
    if (new Set(celulas).size < 3) continue;
    return i;
  }
  return 0;
}

export async function lerArquivo(nome: string, dados: ArrayBuffer): Promise<PlanilhaLida> {
  const ehXlsx = /\.xlsx?$/i.test(nome);
  let brutas: unknown[][];

  if (ehXlsx) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(dados);
    const aba = wb.worksheets[0];
    if (!aba) throw new Error("A planilha não tem nenhuma aba.");
    brutas = [];
    aba.eachRow({ includeEmpty: false }, (row) => {
      const valores = Array.isArray(row.values) ? row.values.slice(1) : [];
      brutas.push(
        valores.map((v) => {
          if (v === null || v === undefined) return "";
          // Célula com fórmula vem como { result }, e hyperlink como { text }.
          if (typeof v === "object" && v !== null) {
            const o = v as { result?: unknown; text?: unknown };
            if ("result" in o) return o.result ?? "";
            if ("text" in o) return o.text ?? "";
          }
          return v;
        }),
      );
    });
  } else {
    brutas = lerCsv(new TextDecoder("utf-8").decode(dados));
  }

  const i = acharCabecalho(brutas);
  return {
    cabecalho: (brutas[i] ?? []).map((c) => String(c ?? "").trim()),
    linhas: brutas.slice(i + 1),
    linhaDoCabecalho: i + 1,
  };
}
