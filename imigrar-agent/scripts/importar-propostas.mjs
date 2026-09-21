// OS VALORES — a segunda aba da planilha do comercial.
//
// A carga inicial trouxe quem é cada pessoa e em que etapa ela está (bloco
// "Identificação e contato"). O DINHEIRO está em outra aba, "Propostas", ligada à
// primeira pelo `ID Lead`. Sem ela, o funil do painel mostra vinte e uma propostas em
// aberto e R$ 0 — o que é verdade e é inútil.
//
// Este script preenche BURACO, e só. Ele não cria caso, não move etapa, não fecha nada:
// acha o lead que já existe pelo ID da planilha e grava o valor onde não há valor. Quem
// já teve o número corrigido à mão no painel não é tocado — o que uma pessoa escreveu na
// ficha vale mais do que uma célula.
//
// ── O QUE A PLANILHA TEM, DE VERDADE ────────────────────────────────────────────────
//
// Só 15 das 33 linhas têm valor preenchido. Depois desta carga a maior parte das
// propostas continua sem número, e isso não é defeito do script: é o estado da planilha.
// O painel mostra quantas estão sem valor ao lado da soma justamente para essa diferença
// ficar visível em vez de virar um total que ninguém sabe do que é feito.
//
// "Aprovada?" está como "Não" em 32 das 33 linhas, e "Data Fechamento" está vazia em
// todas — inclusive nos quatro casos que a outra aba marca como contrato fechado. Por
// isso `valor_contratado` NÃO é preenchido aqui: deduzir receita de duas abas que se
// contradizem é inventar o faturamento do escritório. Quem fechou, alguém marca no painel.
//
// ── VALOR FINAL, NÃO VALOR PROPOSTO ─────────────────────────────────────────────────
//
// O que está com o cliente é o valor final, depois do desconto. Numa das linhas os dois
// divergem para CIMA (proposto R$ 2.500, final R$ 6.000) — sinal de que o escopo mudou
// depois. O final é o que vale nos dois casos.
//
//   npm run importar-propostas -- --arquivo=/caminho/propostas.csv            (ensaio)
//   npm run importar-propostas -- --arquivo=/caminho/propostas.csv --aplicar  (grava)

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function lerEnvLocal() {
  const arquivo = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(arquivo, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
      ]),
  );
}

const env = { ...lerEnvLocal(), ...process.env };
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

/** O mesmo leitor de CSV da carga inicial: campos com vírgula dentro são a regra aqui. */
function lerCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
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
 * "R$ 2.500,00" → 2500. E "" → null, que é diferente de zero.
 *
 * A distinção é a razão de este script existir: zero é um valor que alguém escolheu;
 * vazio é ninguém ter preenchido, e some da soma em vez de puxá-la para baixo.
 */
function emReais(bruto) {
  const t = String(bruto ?? "").trim();
  if (!t) return null;
  const limpo = t.replace(/[R$\s ]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "29/04/2026" → ISO. A planilha é toda em dd/mm/aaaa. */
function dataBr(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Só a data, para a coluna `date` da validade. */
function dataSoDia(v) {
  const iso = dataBr(v);
  return iso ? iso.slice(0, 10) : null;
}

async function main() {
  const arquivo = args.arquivo;
  if (!arquivo || arquivo === true || !fs.existsSync(arquivo)) {
    console.error(
      "Falta o arquivo (a aba 'Propostas' da planilha, exportada em CSV).\n\n" +
        "  npm run importar-propostas -- --arquivo=/caminho/propostas.csv\n",
    );
    process.exit(1);
  }
  const aplicar = args.aplicar === true || args.aplicar === "true";

  const linhas = lerCsv(fs.readFileSync(arquivo, "utf8"));
  const iCab = linhas.findIndex((l) => l.some((c) => c.trim() === "ID Lead"));
  if (iCab < 0) {
    console.error('Não achei o cabeçalho (a linha com "ID Lead"). Este CSV é da aba certa?');
    process.exit(1);
  }
  const cab = linhas[iCab].map((c) => c.trim());
  const col = (nome) => cab.indexOf(nome);
  const val = (l, nome) => {
    const i = col(nome);
    return i >= 0 ? (l[i] ?? "").trim() : "";
  };

  // A LINHA DE TOTAIS NÃO É UMA PROPOSTA. A planilha fecha a aba com um somatório em
  // células mescladas; sem este corte, "TOTAIS" viraria uma busca por um lead que não
  // existe — ruído no relatório do ensaio, e um susto para quem o lê.
  const dados = linhas
    .slice(iCab + 1)
    .filter((l) => {
      const id = val(l, "ID Lead");
      return id && !/totais|total/i.test(id) && !/merged/i.test(id);
    });

  console.log(`\n${dados.length} linhas de proposta.`);
  console.log(aplicar ? "MODO: GRAVANDO no banco.\n" : "MODO: ensaio — nada será gravado.\n");

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const conta = { preenchidos: 0, semValor: 0, naoAchados: 0, jaTinham: 0 };
  let somaGravada = 0;

  try {
    if (aplicar) await client.query("begin");

    for (const l of dados) {
      const id = val(l, "ID Lead");
      const nome = val(l, "Nome do Lead");
      // O final é o que está com o cliente; o proposto é o de antes do desconto.
      const valor = emReais(val(l, "Valor Final (R$)")) ?? emReais(val(l, "Valor Proposto (R$)"));
      const enviadaEm = dataBr(val(l, "Data Envio Proposta"));
      const validade = dataSoDia(val(l, "Prazo de Validade"));
      const servico = val(l, "Serviço") || null;

      if (!valor) {
        conta.semValor++;
        console.log(`  ·  ${id} ${nome} — a planilha não tem valor para esta`);
        continue;
      }

      const achado = await client.query(
        `select id, contact_name, proposta_valor, atendimento_status
           from leads where notes like $1 limit 1`,
        [`%(${id})%`],
      );
      const lead = achado.rows[0];
      if (!lead) {
        conta.naoAchados++;
        console.log(`  ⚠  ${id} ${nome} — não achei este lead no painel`);
        continue;
      }
      if (lead.proposta_valor !== null) {
        conta.jaTinham++;
        console.log(`  =  ${id} ${lead.contact_name} — já tem valor, não mexo`);
        continue;
      }

      conta.preenchidos++;
      somaGravada += valor;
      console.log(
        `  +  ${id} ${lead.contact_name} — R$ ${valor.toLocaleString("pt-BR")} ` +
          `(${lead.atendimento_status})`,
      );

      if (!aplicar) continue;
      // COALESCE em cada coluna: preenche buraco, nunca reescreve. O que uma pessoa
      // corrigiu na ficha vale mais do que a célula da planilha.
      await client.query(
        `update leads
            set proposta_valor      = coalesce(proposta_valor, $2),
                proposta_enviada_em = coalesce(proposta_enviada_em, $3::timestamptz),
                proposta_validade   = coalesce(proposta_validade, $4::date),
                proposta_servico    = coalesce(proposta_servico, $5),
                updated_at          = now()
          where id = $1`,
        [lead.id, valor, enviadaEm, validade, servico],
      );
    }

    if (aplicar) await client.query("commit");
  } catch (err) {
    if (aplicar) await client.query("rollback").catch(() => {});
    console.error("\nFALHOU — nada foi gravado:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }

  console.log("\n─── resumo ───");
  console.log(`  valores preenchidos:     ${conta.preenchidos}  (R$ ${somaGravada.toLocaleString("pt-BR")})`);
  console.log(`  já tinham valor:         ${conta.jaTinham}`);
  console.log(`  sem valor na planilha:   ${conta.semValor}`);
  console.log(`  não achados no painel:   ${conta.naoAchados}`);
  if (!aplicar) console.log("\n  (ensaio — nada foi gravado. Repita com --aplicar.)");
}

main();
