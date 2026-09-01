// REDEFINIR A SENHA DE UMA CONTA DO PAINEL.
//
// Senha não se recupera: o banco guarda um hash scrypt, que é de mão única. Nem um
// administrador, nem quem abre o Supabase, nem quem escreveu o sistema consegue ler a
// senha de volta. O que existe é SUBSTITUIR — e é isso que este script faz.
//
// POR QUE ELE EXISTE, EM VEZ DE "roda um UPDATE no SQL Editor". Porque o UPDATE à mão erra
// de um jeito que não avisa: o formato do hash é `scrypt$N$r$p$salt$hash` com N=2^17, e
// qualquer coisa fora disso é aceita pelo banco e recusada no login. A pessoa fica trancada
// achando que digitou errado. Aqui os parâmetros são os mesmos de `lib/auth/password.ts` —
// se um dia divergirem, o teste `tests/auth.test.ts` é quem percebe.
//
// A SENHA APARECE UMA VEZ, no seu terminal, e não é gravada em lugar nenhum. Anote antes de
// fechar. Troque-a depois de entrar.
//
//   npm run senha -- studioneedbr@gmail.com              gera uma senha forte
//   npm run senha -- studioneedbr@gmail.com "minha senha"  usa a que você escolher
//
// Precisa de DATABASE_URL no .env.local — a conexão direta com o Postgres, a mesma que
// `npm run migrar` usa. A service_role não serve: ela fala com o PostgREST.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { scryptSync, randomBytes } from "node:crypto";

// Espelha lib/auth/password.ts. OWASP (2024) para scrypt: N >= 2^17, r=8, p=1.
const N = 1 << 17;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;
const MIN_SENHA = 12; // = MIN_PASSWORD_LENGTH em lib/auth/password-policy.ts

function hashPassword(senha) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha.normalize("NFKC"), salt, KEYLEN, {
    N, r: R, p: P, maxmem: MAXMEM,
  }).toString("hex");
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

/**
 * Alfabeto sem l, I, 1, O e 0. São os cinco caracteres que ninguém transcreve direito de um
 * terminal para um campo de senha, e uma senha temporária que não se consegue digitar não é
 * temporária: é um segundo problema.
 */
const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function senhaForte() {
  const corpo = Array.from(randomBytes(16))
    .map((b) => ALFABETO[b % ALFABETO.length])
    .join("");
  return `Imigrar-${corpo}`;
}

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

const email = (process.argv[2] ?? "").toLowerCase().trim();
const escolhida = process.argv[3];

if (!email) {
  console.error(
    [
      "",
      "  Diga de qual conta é a senha:",
      "",
      "    npm run senha -- studioneedbr@gmail.com",
      "",
      "  Sem o segundo argumento, uma senha forte é gerada e mostrada uma vez.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (!conexao) {
  console.error(
    [
      "",
      "  Falta a DATABASE_URL no .env.local — a conexão direta com o Postgres.",
      "  É a mesma que `npm run migrar` usa. A SUPABASE_SERVICE_ROLE_KEY não serve.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (escolhida !== undefined && escolhida.length < MIN_SENHA) {
  console.error(`\n  A senha precisa ter ao menos ${MIN_SENHA} caracteres.\n`);
  process.exit(1);
}

const senha = escolhida ?? senhaForte();
const cliente = new pg.Client({ connectionString: conexao, ssl: { rejectUnauthorized: false } });

try {
  await cliente.connect();

  // Confere ANTES de escrever. Um e-mail com um caractere errado faria o UPDATE não afetar
  // linha nenhuma e sair sem erro — e a pessoa passaria a tarde tentando entrar com uma
  // senha que nunca foi gravada em conta nenhuma.
  const { rows } = await cliente.query(
    "select email, role, active, dono from users where email = $1",
    [email],
  );
  if (!rows.length) {
    console.error(`\n  Não existe conta com o e-mail ${email}. Nada foi alterado.\n`);
    process.exit(1);
  }
  const conta = rows[0];

  await cliente.query("update users set password_hash = $1 where email = $2", [
    hashPassword(senha),
    email,
  ]);

  console.log("");
  console.log("  Senha redefinida.");
  console.log("");
  console.log(`    conta   ${conta.email}`);
  console.log(`    papel   ${conta.role}${conta.dono ? " (dona do painel)" : ""}`);
  if (!conta.active) console.log("    ATENÇÃO  esta conta está INATIVA e não entra no painel.");
  console.log(`    senha   ${senha}`);
  console.log("");
  console.log("  Ela aparece uma vez e não fica guardada em lugar nenhum. Anote agora.");
  console.log("  Quem sabia a senha anterior perdeu o acesso neste instante.");
  console.log("");
} finally {
  await cliente.end().catch(() => {});
}
