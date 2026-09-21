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

/**
 * QUAL É O SEPARADOR.
 *
 * "CSV" não quer dizer vírgula. O Excel em português — e em todo idioma cujo decimal é
 * vírgula — grava e espera PONTO-E-VÍRGULA, e basta alguém abrir o arquivo e salvar para
 * ele trocar. O arquivo continua chamado `.csv` e continua abrindo na tela da pessoa; só
 * aqui é que ele viraria uma coluna só com tudo dentro.
 *
 * E a falha era silenciosa do pior jeito: `acharCabecalho` exige três células distintas,
 * uma linha inteira num campo só nunca chega a três, e a importação terminaria dizendo
 * "não achei o cabeçalho" para uma planilha que a pessoa está vendo certinha.
 *
 * A contagem é FORA DAS ASPAS, porque endereço e observação têm vírgula dentro e um campo
 * citado com três vírgulas decidiria a votação sozinho.
 */
function separadorDe(s: string): string {
  const candidatos = [",", ";", "\t"];
  const contagem = candidatos.map(() => 0);
  let aspas = false;
  // Só o começo do arquivo: o cabeçalho e as primeiras linhas já decidem, e varrer um
  // arquivo de milhares de linhas duas vezes é desperdício.
  for (let i = 0; i < Math.min(s.length, 20000); i++) {
    const c = s[i];
    if (c === '"') { aspas = !aspas; continue; }
    if (aspas) continue;
    const k = candidatos.indexOf(c);
    if (k >= 0) contagem[k]++;
  }
  let melhor = 0;
  for (let k = 1; k < candidatos.length; k++) if (contagem[k] > contagem[melhor]) melhor = k;
  // Empate em zero (uma coluna só) cai na vírgula, que é o formato canônico.
  return candidatos[melhor];
}

/** O mesmo leitor de CSV da carga inicial: campo com o separador dentro é a regra aqui. */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  // O BOM SAI AQUI, e não só em `lerArquivo`. Quem exporta para o Excel escreve o BOM de
  // propósito (sem ele "Cássio" abre como "CÃ¡ssio"), e o `TextDecoder` de `lerArquivo` o
  // descarta sozinho — mas os importadores de linha de comando leem com
  // `readFileSync(arquivo, "utf8")`, que NÃO descarta. Sem esta linha, a primeira coluna
  // chegaria como "\uFEFFID": invisível na tela, e o bastante para o identificador da
  // linha deixar de ser reconhecido e a reimportação duplicar tudo.
  const s = texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sep = separadorDe(s);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
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
