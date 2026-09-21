// A CARGA INICIAL DO CRM — a planilha do comercial vira caso no funil.
//
// Roda UMA VEZ, na virada. Não é um importador genérico: é o caminho do histórico que o
// escritório manteve à mão (ImigrarBrasil_CRM_Comercial, bloco "IDENTIFICAÇÃO E CONTATO
// DO LEAD") para dentro do painel, e ele conhece as colunas daquela planilha pelo nome.
//
// ── O QUE ELE NÃO FAZ, E POR QUÊ ────────────────────────────────────────────────────
//
// NÃO CRIA MENSAGEM. Nenhuma dessas pessoas escreveu para o nosso número — o histórico
// foi digitado por alguém do time. A varredura de follow-up decide se pode disparar
// olhando se existe mensagem com `role = 'user'` na conversa (lib/followup/varredura.ts);
// inventar uma aqui faria o cron entender que 76 números já conversaram conosco e mandar
// mensagem automática para todos eles. Setenta e seis disparos para quem nunca escreveu,
// saindo do único número do escritório, é a definição de disparo em massa — e o caminho
// mais curto para o número ser derrubado antes da operação começar.
//
// NÃO MEXE EM QUEM JÁ É CASO NO PAINEL. Se o telefone já tem conversa, o script completa
// os buracos da ficha e NÃO reescreve o que está lá: o que veio de uma conversa de
// verdade vale mais do que uma célula de planilha.
//
// NÃO INVENTA FASE. Cada linha entra na etapa que a planilha diz (`Fase do Atendimento`).
// A instrução original era "tudo em Proposta Enviada", e ela produziria um funil com 76
// propostas em aberto — sendo que 6 estão perdidos, 4 já fecharam contrato e 18 nunca
// passaram do primeiro contato. `--tudo-em=<etapa>` existe para quem quiser assim mesmo.
//
// ── COMO RODAR ──────────────────────────────────────────────────────────────────────
//
//   1. Na planilha: aba "Pipeline Atendimento" → Arquivo → Fazer download → CSV
//   2. npm run importar -- --arquivo=/caminho/pipeline.csv           (ensaio, não grava)
//   3. npm run importar -- --arquivo=/caminho/pipeline.csv --aplicar (grava)
//
// O ENSAIO É O PADRÃO. Sem `--aplicar` ele lê tudo, mostra linha por linha o que faria e
// não escreve nada. Carga inicial é a operação em que um erro custa mais caro: ninguém
// confere 76 fichas depois, e o que entrar torto vira o histórico que o escritório passa
// a acreditar.
//
// Precisa da `DATABASE_URL` (conexão direta com o Postgres), como o `npm run migrar`.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

/* ══════════════════════════════════════════════════════════════════════════
   CSV — um leitor pequeno, mas que respeita aspas

   A planilha tem campos com vírgula DENTRO ("Descrição da Necessidade" é um parágrafo
   inteiro, e os relatos de follow-up têm vírgula em toda frase). Um `split(",")` parte
   essas linhas no meio e desloca todas as colunas seguintes — o nome de uma pessoa vira
   telefone, o telefone vira e-mail, e nada disso dá erro: só fica errado.
   ══════════════════════════════════════════════════════════════════════════ */
function lerCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let dentroDeAspas = false;
  const conteudo = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (dentroDeAspas) {
      // Aspas dobradas ("") são uma aspa literal, não o fim do campo.
      if (c === '"' && conteudo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentroDeAspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') dentroDeAspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/* ══════════════════════════════════════════════════════════════════════════
   AS TRADUÇÕES — planilha → domínio do painel
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A fase da planilha vira status do atendimento.
 *
 * "Desistiu" e "Perdido" caem no mesmo lugar porque no painel são a mesma coluna; o que
 * os separa é o MOTIVO, que vai gravado ao lado.
 */
const FASE_PARA_STATUS = {
  "primeiro contato": "novo",
  "qualificação": "em_atendimento",
  "qualificacao": "em_atendimento",
  "em espera": "em_atendimento",
  "negociação": "em_atendimento",
  "negociacao": "em_atendimento",
  "proposta enviada": "proposta_enviada",
  "contrato fechado": "fechado",
  "perdido": "perdido",
  "desistiu": "perdido",
  "sem retorno": "em_atendimento",
};

/** O `stage` antigo, que o quadro ainda lê em alguns lugares. */
const STATUS_PARA_STAGE = {
  novo: "novo",
  em_atendimento: "qualificado",
  proposta_enviada: "orcado",
  agendado: "qualificado",
  fechado: "ganho",
  perdido: "perdido",
};

const STATUS_PARA_LEAD_STATUS = {
  novo: "new",
  em_atendimento: "contacted",
  proposta_enviada: "proposal_sent",
  agendado: "negotiating",
  fechado: "won",
  perdido: "lost",
};

const URGENCIA = { alta: "immediate", média: "short", media: "short", baixa: "long" };

/**
 * A ÚNICA CATEGORIA DE PERDA QUE A PLANILHA SUSTENTA.
 *
 * O painel exige categoria para fechar um caso como perdido, e a planilha não tem esse
 * campo: tem um texto livre ("lead respondeu que trabalha muito e não tem tempo"). Chutar
 * "preço" ou "foi para outro escritório" a partir de um parágrafo seria inventar a
 * estatística de perda do escritório na carga inicial — e ninguém depois desconfia de um
 * número que já veio preenchido. `sumiu` é a categoria honesta para "não sabemos", e o
 * texto real fica em `motivo_perda`, que é o que gente lê.
 */
const CATEGORIA_DE_PERDA = "sumiu";

/** Só dígitos — a mesma forma canônica de lib/whatsapp/telefone.ts. */
function normalizarTelefone(bruto) {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d.replace(/^0+/, "");
}

/**
 * O DDI QUE A PLANILHA NÃO ESCREVEU — e por que isto decide se a carga presta.
 *
 * 52 das 76 linhas estão em "(81) 98292-0729": formato brasileiro, sem o 55. O painel
 * guarda o número na forma que o WhatsApp entrega, que SEMPRE traz o DDI. Importar sem
 * ele significa que, no dia em que essa mesma pessoa escrever para o escritório, o
 * webhook não vai encontrar o caso importado — vai abrir um card novo, e o histórico que
 * esta carga existe para preservar fica órfão ao lado dele. É o defeito da Ana Rodríguez
 * aparecendo duas vezes no quadro, só que multiplicado por 52.
 *
 * A regra segue o que a planilha realmente contém:
 *  · começa com "+"  → o DDI está escrito, seja ele qual for. Não se mexe.
 *  · 10 ou 11 dígitos → é o formato brasileiro (DDD + 8 ou 9 dígitos). Ganha o 55.
 *  · o resto         → ambíguo. Passa como está, COM AVISO na tela, porque adivinhar aqui
 *                      é inventar o telefone de alguém.
 */
function telefoneComDdi(bruto) {
  const cru = String(bruto ?? "").trim().replace(/^["']+/, "");
  const digitos = normalizarTelefone(cru);
  if (!digitos) return { telefone: "", aviso: null };
  if (cru.startsWith("+")) return { telefone: digitos, aviso: null };
  if (digitos.length === 10 || digitos.length === 11) return { telefone: `55${digitos}`, aviso: null };
  return {
    telefone: digitos,
    aviso: "sem DDI escrito e fora do formato brasileiro — confira este antes de usar",
  };
}

/** As grafias que podem ser a MESMA pessoa (o nono dígito brasileiro). */
function variantesDoTelefone(bruto) {
  const c = normalizarTelefone(bruto);
  if (!c) return [];
  const v = new Set([c]);
  if (c.startsWith("55")) {
    const s = c.slice(2);
    if (s.length === 11 && s[2] === "9") v.add(`55${s.slice(0, 2)}${s.slice(3)}`);
    if (s.length === 10) v.add(`55${s.slice(0, 2)}9${s.slice(2)}`);
  }
  return [...v];
}

/**
 * "Não forneceu", "Não informou e-mail", "Não Informou e-mail" — 59 das 76 linhas.
 * Gravado como e-mail, isso vira destinatário de mensagem um dia.
 */
function emailDeVerdade(v) {
  const t = String(v ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t.toLowerCase() : null;
}

function vazio(v) {
  const t = String(v ?? "").trim();
  if (!t) return true;
  return /^(não|nao|n\/a|-|desconhecido|não informou|nao informou|não forneceu|nao forneceu)$/i.test(t);
}

function limpo(v) {
  const t = String(v ?? "").trim();
  return vazio(t) ? null : t;
}

/** "29/04/2026" → Date. A planilha é toda em dd/mm/aaaa. */
function dataBr(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Onde a pessoa está: o painel distingue Brasil de exterior, e é isso que muda a via. */
function localizacaoDe(paisResidencia) {
  const p = (paisResidencia ?? "").trim().toLowerCase();
  if (!p) return { localizacao: null, paisExterior: null };
  if (p === "brasil" || p === "brazil") return { localizacao: "brasil", paisExterior: null };
  return { localizacao: "exterior", paisExterior: paisResidencia.trim() };
}

/* ══════════════════════════════════════════════════════════════════════════
   A IMPORTAÇÃO
   ══════════════════════════════════════════════════════════════════════════ */

const COLUNAS_ESPERADAS = [
  "ID Lead", "Nome Completo", "WhatsApp", "Fase do Atendimento",
];

async function main() {
  const arquivo = args.arquivo;
  if (!arquivo || arquivo === true) {
    console.error(
      "Falta o arquivo.\n\n" +
        "  npm run importar -- --arquivo=/caminho/pipeline.csv            (ensaio)\n" +
        "  npm run importar -- --arquivo=/caminho/pipeline.csv --aplicar  (grava)\n\n" +
        "O CSV sai da planilha em Arquivo → Fazer download → CSV, na aba do pipeline.",
    );
    process.exit(1);
  }
  if (!fs.existsSync(arquivo)) {
    console.error(`Não achei o arquivo: ${arquivo}`);
    process.exit(1);
  }

  const aplicar = args.aplicar === true || args.aplicar === "true";
  const tudoEm = typeof args["tudo-em"] === "string" ? args["tudo-em"] : null;

  const linhas = lerCsv(fs.readFileSync(arquivo, "utf8"));

  // O CABEÇALHO NÃO É A PRIMEIRA LINHA. A planilha tem título, subtítulo e a faixa do
  // bloco antes dele — procurar pelo nome é o que sobrevive a alguém inserir mais uma
  // linha decorativa em cima, que é a coisa mais provável de acontecer nesta planilha.
  const iCab = linhas.findIndex((l) => l.some((c) => c.trim() === "ID Lead"));
  if (iCab < 0) {
    console.error('Não achei o cabeçalho (a linha com "ID Lead"). Este CSV é da aba certa?');
    process.exit(1);
  }
  const cab = linhas[iCab].map((c) => c.trim());
  const faltando = COLUNAS_ESPERADAS.filter((c) => !cab.includes(c));
  if (faltando.length) {
    console.error(`O CSV não tem as colunas: ${faltando.join(", ")}`);
    process.exit(1);
  }
  const col = (nome) => cab.indexOf(nome);
  const val = (linha, nome) => {
    const i = col(nome);
    return i >= 0 ? (linha[i] ?? "").trim() : "";
  };

  const dados = linhas
    .slice(iCab + 1)
    .filter((l) => val(l, "Nome Completo") || val(l, "WhatsApp"));

  console.log(`\n${dados.length} linhas com conteúdo.`);
  console.log(aplicar ? "MODO: GRAVANDO no banco.\n" : "MODO: ensaio — nada será gravado.\n");

  // O ENSAIO RODA SEM BANCO. Conferir se o CSV foi lido direito — se as colunas bateram,
  // se os telefones saíram legíveis, se as fases viraram as etapas certas — é o que mais
  // se faz antes da carga, e exigir a conexão para isso obrigaria a ter a `DATABASE_URL` à
  // mão para responder uma pergunta que é só sobre o arquivo.
  //
  // O que se perde sem banco está dito na tela: não dá para saber quem JÁ é caso no
  // painel, então todo mundo aparece como novo. Gravar sem conexão, isso nunca.
  const semBanco = !aplicar && !env.DATABASE_URL;
  if (semBanco) {
    console.log("  (sem DATABASE_URL: não dá para saber quem já é caso — todos contam como novos)\n");
  }
  const client = semBanco
    ? null
    : new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  if (client) await client.connect();

  const conta = { criados: 0, completados: 0, pulados: 0, semTelefone: 0, telefonesDuvidosos: 0 };
  const porStatus = {};

  try {
    if (aplicar) await client.query("begin");

    for (const linha of dados) {
      const idPlanilha = val(linha, "ID Lead");
      const nome = val(linha, "Nome Completo");
      const { telefone, aviso } = telefoneComDdi(val(linha, "WhatsApp"));
      const fase = val(linha, "Fase do Atendimento").toLowerCase();

      if (!telefone || telefone.length < 8) {
        conta.semTelefone++;
        console.log(
          `  ⚠ ${idPlanilha} ${nome}: sem telefone legível ("${val(linha, "WhatsApp")}") — fora`,
        );
        continue;
      }

      const status = tudoEm ?? FASE_PARA_STATUS[fase] ?? "novo";
      porStatus[status] = (porStatus[status] ?? 0) + 1;

      // ── A conversa: reaproveita a que existir para qualquer grafia do número ──
      const variantes = variantesDoTelefone(telefone);
      const achada = semBanco ? { rows: [] } : await client.query(
        `select c.id, c.contact_name, l.id as lead_id
           from conversations c
           left join leads l on l.conversation_id = c.id
          where c.telefone_normalizado = any($1::text[])
             or regexp_replace(c.whatsapp_number, '[^0-9]', '', 'g') = any($1::text[])
          order by c.updated_at desc
          limit 1`,
        [variantes],
      );

      const jaExiste = achada.rows[0] ?? null;
      const jaTemLead = Boolean(jaExiste?.lead_id);

      const { localizacao, paisExterior } = localizacaoDe(val(linha, "País de Residência Atual"));
      const descricao = limpo(val(linha, "Descrição da Necessidade"));
      const oQueFalta = limpo(val(linha, "O que Falta para Fechar?"));
      const servico = limpo(val(linha, "Tipo de Serviço Solicitado"));
      const primeiroContato = dataBr(val(linha, "Data 1º Contato"));

      const nota = [
        `Importado da planilha do comercial (${idPlanilha || "sem ID"}).`,
        primeiroContato ? `1º contato: ${val(linha, "Data 1º Contato")}.` : null,
        limpo(val(linha, "Como nos Encontrou")) ? `Chegou por: ${val(linha, "Como nos Encontrou")}.` : null,
        limpo(val(linha, "Atendente Responsável")) ? `Atendente: ${val(linha, "Atendente Responsável")}.` : null,
        descricao ? `\nNecessidade: ${descricao}` : null,
        oQueFalta ? `\nO que falta para fechar: ${oQueFalta}` : null,
      ].filter(Boolean).join(" ");

      const campos = {
        contact_name: nome || null,
        whatsapp_number: telefone,
        email: emailDeVerdade(val(linha, "E-mail")),
        client_type: limpo(val(linha, "Nacionalidade")),
        nacionalidade: limpo(val(linha, "Nacionalidade")),
        region: limpo(val(linha, "Cidade / Estado")) ?? limpo(val(linha, "País de Residência Atual")),
        localizacao,
        pais_exterior: paisExterior,
        idioma: null,
        objetivo: servico,
        situacao_documental: descricao,
        urgency: URGENCIA[val(linha, "Urgência").toLowerCase()] ?? null,
        notes: nota,
        atendimento_status: status,
        stage: STATUS_PARA_STAGE[status] ?? "novo",
        status: STATUS_PARA_LEAD_STATUS[status] ?? "new",
        setor: "comercial",
        origem: "importacao",
        motivo_perda: status === "perdido" ? (oQueFalta ?? `Marcado como "${val(linha, "Fase do Atendimento")}" na planilha.`) : null,
        motivo_perda_categoria: status === "perdido" ? CATEGORIA_DE_PERDA : null,
      };

      const rotulo =
        `${idPlanilha || "—"} ${nome} · ${telefone} · ${status}` +
        (aviso ? `  ⚠ ${aviso}` : "");
      if (aviso) conta.telefonesDuvidosos++;

      if (jaTemLead) {
        conta.completados++;
        console.log(`  ↻ ${rotulo} — já é caso no painel, completando só os buracos`);
        if (aplicar) {
          // COALESCE em cada coluna: o que já está gravado vence. O que veio de conversa
          // de verdade vale mais do que uma célula de planilha.
          const set = Object.entries(campos)
            .filter(([k, v]) => v !== null && k !== "atendimento_status" && k !== "stage" && k !== "status" && k !== "notes")
            .map(([k], i) => `${k} = coalesce(${k}, $${i + 2})`);
          const valores = Object.entries(campos)
            .filter(([k, v]) => v !== null && k !== "atendimento_status" && k !== "stage" && k !== "status" && k !== "notes")
            .map(([, v]) => v);
          set.push(`notes = coalesce(notes, '') || $${valores.length + 2}`);
          valores.push(`\n\n${nota}`);
          await client.query(
            `update leads set ${set.join(", ")}, updated_at = now() where id = $1`,
            [jaExiste.lead_id, ...valores],
          );
        }
        continue;
      }

      conta.criados++;
      console.log(`  + ${rotulo}`);
      if (!aplicar) continue;

      let conversationId = jaExiste?.id;
      if (!conversationId) {
        const criadaEm = primeiroContato ? primeiroContato.toISOString() : new Date().toISOString();
        const nova = await client.query(
          `insert into conversations (whatsapp_number, contact_name, telefone_normalizado, status, created_at, updated_at)
           values ($1, $2, $3, 'active', $4, $4) returning id`,
          [telefone, nome || null, telefone, criadaEm],
        );
        conversationId = nova.rows[0].id;
      }

      const cols = Object.keys(campos).filter((k) => campos[k] !== null);
      const vals = cols.map((k) => campos[k]);
      await client.query(
        `insert into leads (conversation_id, ${cols.join(", ")}, created_at, updated_at)
         values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2}, now())`,
        [
          conversationId,
          ...vals,
          primeiroContato ? primeiroContato.toISOString() : new Date().toISOString(),
        ],
      );
    }

    if (aplicar) await client.query("commit");
  } catch (err) {
    if (aplicar) await client.query("rollback").catch(() => {});
    console.error("\nFALHOU — nada foi gravado:", err.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.end();
  }

  console.log("\n─── resumo ───");
  console.log(`  casos novos:            ${conta.criados}`);
  console.log(`  já existiam no painel:  ${conta.completados}`);
  console.log(`  sem telefone (fora):    ${conta.semTelefone}`);
  if (conta.telefonesDuvidosos) {
    console.log(`  telefones a conferir:   ${conta.telefonesDuvidosos}  (marcados com ⚠ acima)`);
  }
  console.log("  por etapa:");
  for (const [s, n] of Object.entries(porStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)}  ${s}`);
  }
  if (!aplicar) console.log("\n  (ensaio — nada foi gravado. Repita com --aplicar.)");
}

main();
