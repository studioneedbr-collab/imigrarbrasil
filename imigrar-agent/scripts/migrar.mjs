// AS MIGRATIONS, APLICADAS SOZINHAS E NA ORDEM.
//
// Até aqui subir o banco era "abra o SQL Editor e rode os arquivos de supabase/migrations
// em ordem numérica, um por vez, conferindo que cada um termina sem erro". Isso funciona
// no dia em que alguém lê o passo a passo inteiro, e falha em todos os outros — e a falha
// não avisa: a 024 nunca rodou, o código que depende dela foi para produção assim mesmo, e
// a tela de custo ficou vazia contra uma tabela que não existe. Nada quebrou na cara de
// ninguém, que é justamente o problema.
//
// O QUE JÁ RODOU FICA GRAVADO. A tabela `schema_migrations` guarda o nome de cada arquivo
// aplicado, então rodar isto duas vezes não repete nada e rodar depois de um arquivo novo
// aplica só o que falta. Sem esse registro, "quais migrations faltam neste banco?" só se
// responde conferindo tabela por tabela, que é o que acabou de custar caro.
//
// CADA ARQUIVO É UMA TRANSAÇÃO. Se a metade de baixo falhar, a metade de cima volta atrás
// e o arquivo continua marcado como não aplicado — um banco pela metade é pior do que um
// banco desatualizado, porque o desatualizado a gente sabe consertar.
//
// PRECISA DA CONEXÃO DIRETA COM O POSTGRES (`DATABASE_URL`), e não da service_role: a
// service_role fala com o PostgREST, que serve linhas e não executa DDL. A string está em
// Supabase → Project Settings → Database → Connection string → URI.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const PASTA = path.join(process.cwd(), "supabase", "migrations");

/** Lê o .env.local sem depender de pacote — é um script de operação, roda antes de tudo. */
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
const conexao = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;

if (!conexao) {
  console.error(
    [
      "",
      "Falta a conexão direta com o Postgres.",
      "",
      "  A SUPABASE_SERVICE_ROLE_KEY não serve aqui: ela fala com o PostgREST, que",
      "  entrega linhas e não executa ALTER TABLE nem CREATE INDEX. É outra porta.",
      "",
      "  Pegue em: Supabase → Project Settings → Database → Connection string → URI",
      "  e ponha no .env.local como:",
      "",
      "    DATABASE_URL=postgresql://postgres.<ref>:<senha>@<host>:6543/postgres",
      "",
      "  (a URI do pooler, porta 6543, é a que funciona de fora da rede do Supabase)",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const soConferir = process.argv.includes("--conferir");
// `--baseline 023_ativacao_do_agente.sql` MARCA como aplicadas, sem executar, todas as
// migrations até aquela. É o que se usa uma vez, num banco que já foi migrado à mão:
// sem isso a primeira execução tentaria rodar a 001 de novo num banco que já tem tudo —
// e a 002 é um seed, que rodado duas vezes duplica catálogo.
const baselineAte = (() => {
  const i = process.argv.indexOf("--baseline");
  return i >= 0 ? process.argv[i + 1] : null;
})();
// `--ate 025_parecer_e_telefone.sql` para a aplicação naquele arquivo, mesmo que exista
// coisa depois. É o freio para a pasta que tem migration de trabalho EM ANDAMENTO: uma
// migration existe em disco assim que alguém começa a escrevê-la, e o deploy do banco não
// pode arrastar junto o schema de uma feature que ainda não foi entregue.
const aplicarAte = (() => {
  const i = process.argv.indexOf("--ate");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const cliente = new pg.Client({
  connectionString: conexao,
  // O Supabase serve TLS com certificado que a cadeia local nem sempre conhece. A conexão
  // continua criptografada; o que se abre mão é da verificação da cadeia, que num script
  // de operação apontado para uma URL escrita à mão não é a defesa que importa.
  ssl: { rejectUnauthorized: false },
});

await cliente.connect();

try {
  await cliente.query(`
    create table if not exists schema_migrations (
      arquivo text primary key,
      aplicada_em timestamptz not null default now()
    );
    comment on table schema_migrations is
      'Quais migrations já rodaram neste banco. Sem isto, "o que falta aqui?" só se responde conferindo tabela por tabela.';
  `);

  const { rows } = await cliente.query("select arquivo from schema_migrations");
  const jaAplicadas = new Set(rows.map((r) => r.arquivo));

  const arquivos = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 001, 002, … — a ordem numérica é a ordem de dependência

  if (baselineAte) {
    if (!arquivos.includes(baselineAte)) {
      console.error(`\n${baselineAte} não existe em supabase/migrations.\n`);
      process.exit(1);
    }
    const ate = arquivos.indexOf(baselineAte);
    const marcar = arquivos.slice(0, ate + 1).filter((f) => !jaAplicadas.has(f));
    for (const f of marcar) {
      await cliente.query(
        "insert into schema_migrations (arquivo) values ($1) on conflict do nothing",
        [f],
      );
    }
    console.log(
      `Baseline: ${marcar.length} migration(s) marcadas como aplicadas SEM executar, até ${baselineAte}.`,
    );
    console.log("Rode de novo sem --baseline para aplicar o que vier depois.");
    process.exit(0);
  }

  if (aplicarAte && !arquivos.includes(aplicarAte)) {
    console.error(`\n${aplicarAte} não existe em supabase/migrations.\n`);
    process.exit(1);
  }
  const limite = aplicarAte ? arquivos.indexOf(aplicarAte) : arquivos.length - 1;
  const pendentes = arquivos
    .slice(0, limite + 1)
    .filter((f) => !jaAplicadas.has(f));
  const seguradas = arquivos.slice(limite + 1).filter((f) => !jaAplicadas.has(f));

  // A TRAVA. Registro vazio num banco que já tem tabelas significa uma coisa só: este
  // banco foi migrado à mão, antes deste script existir. Rodar a 001 aqui recriaria
  // estrutura e reexecutaria seed — a 002 duplicaria o catálogo de serviços. Quem decide
  // onde está a linha de corte é uma pessoa, com --baseline, e não a heurística.
  if (!jaAplicadas.size) {
    const { rows: existentes } = await cliente.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversations' limit 1",
    );
    if (existentes.length) {
      console.error(
        [
          "",
          "Este banco já tem estrutura, mas nenhuma migration registrada.",
          "",
          "  Ele foi migrado à mão, antes deste script existir. Rodar tudo do zero",
          "  reexecutaria os seeds (a 002 duplicaria o catálogo de serviços).",
          "",
          "  Marque até onde ele já está, sem executar nada:",
          "",
          "    npm run migrar -- --baseline 023_ativacao_do_agente.sql",
          "",
          "  e depois rode `npm run migrar` para aplicar da 024 em diante.",
          "",
        ].join("\n"),
      );
      process.exit(1);
    }
  }

  if (!pendentes.length) {
    console.log(
      seguradas.length
        ? `Nada a aplicar até ${aplicarAte}. ${seguradas.length} migration(s) depois dela seguem pendentes: ${seguradas.join(", ")}`
        : `Banco em dia — ${arquivos.length} migrations, nenhuma pendente.`,
    );
    process.exit(0);
  }

  console.log(`${pendentes.length} pendente(s) de ${arquivos.length}:`);
  for (const f of pendentes) console.log(`  · ${f}`);
  // O que ficou de fora aparece SEMPRE. Um limite silencioso vira, na semana seguinte,
  // alguém jurando que rodou tudo — que é o mesmo defeito que este script veio corrigir.
  if (seguradas.length) {
    console.log(`\nseguradas por --ate ${aplicarAte} (NÃO aplicadas):`);
    for (const f of seguradas) console.log(`  · ${f}`);
  }

  if (soConferir) {
    console.log("\n--conferir: nada foi aplicado.");
    process.exit(0);
  }

  for (const arquivo of pendentes) {
    const sql = fs.readFileSync(path.join(PASTA, arquivo), "utf8");
    process.stdout.write(`\naplicando ${arquivo} … `);
    try {
      await cliente.query("begin");
      await cliente.query(sql);
      await cliente.query("insert into schema_migrations (arquivo) values ($1)", [arquivo]);
      await cliente.query("commit");
      console.log("ok");
    } catch (err) {
      await cliente.query("rollback").catch(() => {});
      console.log("FALHOU");
      console.error(`\n  ${err.message}\n`);
      console.error(
        `  Nada de ${arquivo} foi gravado, e ele continua marcado como não aplicado.\n` +
          `  As migrations anteriores a esta já estão valendo. Corrija e rode de novo.\n`,
      );
      process.exit(1);
    }
  }

  console.log("\nBanco em dia.");
} finally {
  await cliente.end();
}
