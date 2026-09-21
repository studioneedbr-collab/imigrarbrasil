import { describe, it, expect, beforeEach } from "vitest";
import { sugerirMapeamento, statusDaFase, CAMPOS } from "@/lib/importacao/campos";
import { lerLinha, valorEmReais, dataDaPlanilha } from "@/lib/importacao/planilha";
import { aplicarImportacao } from "@/lib/importacao/aplicar";
import { lerCsv, acharCabecalho } from "@/lib/importacao/arquivo";
import { getRepository } from "@/lib/data";

/**
 * IMPORTAR PLANILHA, QUANTAS VEZES PRECISAR.
 *
 * A carga inicial foi um script que sabia de cor as colunas de uma planilha. Isto aqui é o
 * que substitui: qualquer planilha, mapeamento na tela, e — a parte que decide se presta —
 * reimportar em cima do que já existe NÃO pode duplicar.
 *
 * Uma planilha de escritório é viva: vai ser corrigida, ganhar linhas e ser reenviada. Se
 * cada envio abrisse cards novos, na terceira vez o quadro teria três Karinas.
 */

// O cabeçalho real da planilha do comercial — é contra ele que a detecção precisa acertar.
const CABECALHO_DO_SERGIO = [
  "ID Lead", "Data 1º Contato", "Nome Completo", "Nacionalidade", "País de Origem",
  "País de Residência Atual", "Cidade / Estado", "Idiomas que Fala", "WhatsApp", "E-mail",
  "Como nos Encontrou", "Atendente Responsável", "Tipo de Serviço Solicitado",
  "Descrição da Necessidade", "É Pessoa Idosa (60+)?", "Para Quem é o Serviço?",
  "Número de Pessoas", "Fase do Atendimento", "Urgência", "Orçamento Enviado?",
];

describe("adivinhar as colunas", () => {
  const mapa = sugerirMapeamento(CABECALHO_DO_SERGIO);

  it("acerta a planilha que motivou tudo isto", () => {
    expect(CABECALHO_DO_SERGIO[mapa.nome!]).toBe("Nome Completo");
    expect(CABECALHO_DO_SERGIO[mapa.telefone!]).toBe("WhatsApp");
    expect(CABECALHO_DO_SERGIO[mapa.email!]).toBe("E-mail");
    expect(CABECALHO_DO_SERGIO[mapa.idExterno!]).toBe("ID Lead");
    expect(CABECALHO_DO_SERGIO[mapa.fase!]).toBe("Fase do Atendimento");
    expect(CABECALHO_DO_SERGIO[mapa.nacionalidade!]).toBe("Nacionalidade");
  });

  /**
   * "Data 1º Contato" e "Data Envio Proposta" disputam a pista "data". Sem a ordem por
   * especificidade, a data da proposta entraria como data de entrada do caso — e o
   * histórico do escritório passaria a mentir sem ninguém perceber.
   */
  it("não deixa duas colunas de data disputarem o mesmo campo", () => {
    const m = sugerirMapeamento(["Data 1º Contato", "Data Envio Proposta", "WhatsApp"]);
    expect(m.primeiroContato).toBe(0);
    expect(m.propostaEnviadaEm).toBe(1);
  });

  it("uma coluna só serve a um campo", () => {
    const usados = Object.values(mapa).filter((i): i is number => i !== null);
    expect(new Set(usados).size).toBe(usados.length);
  });

  it("planilha com outros nomes de coluna também é reconhecida", () => {
    const m = sugerirMapeamento(["Cliente", "Celular", "Etapa", "Observações"]);
    expect(m.nome).toBe(0);
    expect(m.telefone).toBe(1);
    expect(m.fase).toBe(2);
    expect(m.descricao).toBe(3);
  });

  it("todo campo tem rótulo e ajuda — a tela de mapeamento depende disso", () => {
    for (const c of CAMPOS) {
      expect(c.rotulo.length, c.campo).toBeGreaterThan(2);
      expect(c.ajuda.length, c.campo).toBeGreaterThan(10);
    }
  });
});

describe("as fases que uma planilha escreve", () => {
  it("traduz o vocabulário de escritório para o do quadro", () => {
    expect(statusDaFase("Proposta Enviada")).toBe("proposta_enviada");
    expect(statusDaFase("Contrato Fechado")).toBe("fechado");
    expect(statusDaFase("Desistiu")).toBe("perdido");
    expect(statusDaFase("Negociação")).toBe("em_atendimento");
    expect(statusDaFase("Primeiro Contato")).toBe("novo");
    expect(statusDaFase("Reunião agendada")).toBe("agendado");
  });

  it("fase que não se reconhece não vira palpite", () => {
    expect(statusDaFase("xyz")).toBeNull();
    expect(statusDaFase("")).toBeNull();
  });
});

describe("ler uma linha", () => {
  const mapa = { idExterno: 0, nome: 1, telefone: 2, fase: 3, propostaValor: 4 };
  const ler = (celulas: unknown[]) => lerLinha(celulas, mapa, 2, "planilha.csv");

  it("o telefone brasileiro ganha o DDI", () => {
    expect(ler(["1", "Maria", "(95) 99123-4567", "Novo", ""]).telefone).toBe("5595991234567");
  });

  it("linha sem telefone é recusada, com o motivo", () => {
    const l = ler(["1", "Maria", "", "Novo", ""]);
    expect(l.problema).toMatch(/sem telefone/);
  });

  // A planilha do Sérgio fecha a aba de propostas com um somatório em células mescladas.
  it("linha de totais não vira pessoa", () => {
    expect(ler(["TOTAIS", "", "", "", "R$ 52.000,00"]).problema).toMatch(/totais/);
  });

  it("número estranho entra, mas com aviso — consertar seria inventar telefone alheio", () => {
    const l = ler(["1", "Mati", "+55 9 8253 2197", "Proposta Enviada", ""]);
    expect(l.problema).toBeNull();
    expect(l.avisos.join(" ")).toMatch(/DDD/);
  });

  it("etapa não reconhecida entra em Novo, avisando", () => {
    const l = ler(["1", "Maria", "5511999990000", "Fase Lunar", ""]);
    expect(l.patch.atendimentoStatus).toBe("novo");
    expect(l.avisos.join(" ")).toMatch(/não foi reconhecida/);
  });

  it("valor vazio não vira zero", () => {
    expect(valorEmReais("")).toBeNull();
    expect(valorEmReais("R$ 2.500,00")).toBe(2500);
    expect(dataDaPlanilha("29/04/2026")?.toISOString().slice(0, 10)).toBe("2026-04-29");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A PROMESSA: REIMPORTAR NÃO DUPLICA
   ══════════════════════════════════════════════════════════════════════════ */
describe("reimportar a mesma planilha", () => {
  const repo = getRepository();
  const mapa = { idExterno: 0, nome: 1, telefone: 2, fase: 3, nacionalidade: 4 };
  const linhas = (rows: unknown[][], fonte = "comercial.csv") =>
    rows.map((r, i) => lerLinha(r, mapa, i + 2, fonte));

  let n = 0;
  beforeEach(() => { n++; });

  it("o segundo envio não cria ninguém de novo", async () => {
    const tel = `551198800${String(1000 + n).slice(-4)}`;
    const dados = [["A1", "Karina", tel, "Proposta Enviada", "Brasil"]];

    const um = await aplicarImportacao(linhas(dados), repo, { aplicar: true });
    expect(um.criados).toBe(1);

    const dois = await aplicarImportacao(linhas(dados), repo, { aplicar: true });
    expect(dois.criados).toBe(0);
    expect(dois.semMudanca + dois.atualizados).toBe(1);
  });

  it("acha pelo id da planilha mesmo se o telefone mudar", async () => {
    const antigo = `551197700${String(1000 + n).slice(-4)}`;
    const novo = `551196600${String(1000 + n).slice(-4)}`;
    await aplicarImportacao(linhas([["B1", "Jorge", antigo, "Novo", ""]]), repo, { aplicar: true });

    const r = await aplicarImportacao(linhas([["B1", "Jorge", novo, "Novo", ""]]), repo, {
      aplicar: true,
    });
    expect(r.criados).toBe(0);
    expect(r.linhas[0].detalhe).toMatch(/id da planilha/);
  });

  it("acha pelo telefone quando a planilha não tem id", async () => {
    const tel = `551195500${String(1000 + n).slice(-4)}`;
    const semId = { nome: 0, telefone: 1 };
    const l1 = [lerLinha(["Ana", tel], semId, 2, "outra.csv")];
    expect((await aplicarImportacao(l1, repo, { aplicar: true })).criados).toBe(1);

    // Outra grafia do mesmo número: sem o nono dígito.
    const semNono = tel.slice(0, 4) + tel.slice(5);
    const l2 = [lerLinha(["Ana", semNono], semId, 2, "outra.csv")];
    const r = await aplicarImportacao(l2, repo, { aplicar: true });
    expect(r.criados).toBe(0);
    expect(r.linhas[0].detalhe).toMatch(/telefone/);
  });

  // Aconteceu de verdade na carga do Sérgio: "Maloume" e "Maloume Talibé Serigne", mesmo
  // telefone, duas linhas.
  it("a mesma pessoa em duas linhas da planilha vira um card só", async () => {
    const tel = `551194400${String(1000 + n).slice(-4)}`;
    const r = await aplicarImportacao(
      linhas([
        ["C1", "Maloume", tel, "Proposta Enviada", ""],
        ["C2", "Maloume Talibé Serigne", tel, "Proposta Enviada", "Senegal"],
      ]),
      repo,
      { aplicar: true },
    );
    expect(r.criados).toBe(1);
    expect(r.linhas[1].detalhe).toMatch(/repetida dentro da própria planilha/);
  });

  // O ensaio precisa contar o mesmo que a gravação conta. Se ele disser "2 novos" e a
  // gravação fizer 1, a tela mentiu — e é da tela que a pessoa decide.
  it("o ensaio conta o mesmo que a gravação faria", async () => {
    const tel = `551193300${String(1000 + n).slice(-4)}`;
    const dados = [
      ["D1", "Um", tel, "Novo", ""],
      ["D2", "Um de novo", tel, "Novo", ""],
    ];
    const ensaio = await aplicarImportacao(linhas(dados), repo, { aplicar: false });
    const real = await aplicarImportacao(linhas(dados), repo, { aplicar: true });
    expect(ensaio.criados).toBe(real.criados);
    expect(ensaio.criados).toBe(1);
  });
});

describe("atualizar é preencher buraco, não reescrever", () => {
  const repo = getRepository();
  const mapa = { idExterno: 0, nome: 1, telefone: 2, fase: 3, nacionalidade: 4 };

  it("o que uma pessoa corrigiu na ficha não é sobrescrito", async () => {
    const tel = "5511922221111";
    await aplicarImportacao(
      [lerLinha(["E1", "Nome da planilha", tel, "Novo", "Bolívia"], mapa, 2, "f.csv")],
      repo,
      { aplicar: true },
    );
    const conv = await repo.getOrCreateConversation(tel);
    await repo.upsertLead(conv.id, { contactName: "Nome corrigido à mão" });

    await aplicarImportacao(
      [lerLinha(["E1", "Nome da planilha", tel, "Novo", "Bolívia"], mapa, 2, "f.csv")],
      repo,
      { aplicar: true },
    );
    expect((await repo.getLeadByConversation(conv.id))?.contactName).toBe("Nome corrigido à mão");
  });

  it("mas preenche o que está vazio", async () => {
    const tel = "5511922223333";
    const conv = await repo.getOrCreateConversation(tel);
    await repo.upsertLead(conv.id, { contactName: "Já existia" });

    const r = await aplicarImportacao(
      [lerLinha(["F1", "Ignorado", tel, "Novo", "Haiti"], mapa, 2, "f.csv")],
      repo,
      { aplicar: true },
    );
    expect(r.atualizados).toBe(1);
    expect((await repo.getLeadByConversation(conv.id))?.nacionalidade).toBe("Haiti");
  });

  /**
   * Mover cinquenta casos de coluna sem perguntar é reorganizar o trabalho do time por
   * conta própria — e a planilha costuma estar mais desatualizada que o painel.
   */
  it("a planilha não move o card de coluna sozinha", async () => {
    const tel = "5511922224444";
    const conv = await repo.getOrCreateConversation(tel);
    await repo.upsertLead(conv.id, { contactName: "Em atendimento", atendimentoStatus: "em_atendimento" });

    const linha = [lerLinha(["G1", "Em atendimento", tel, "Contrato Fechado", ""], mapa, 2, "f.csv")];
    const r = await aplicarImportacao(linha, repo, { aplicar: true });
    expect(r.conflitosDeEtapa).toHaveLength(1);
    expect(r.conflitosDeEtapa[0].para).toBe("fechado");
    expect((await repo.getLeadByConversation(conv.id))?.atendimentoStatus).toBe("em_atendimento");

    // Com autorização explícita, move.
    await aplicarImportacao(linha, repo, { aplicar: true, moverEtapa: true });
    expect((await repo.getLeadByConversation(conv.id))?.atendimentoStatus).toBe("fechado");
  });
});

// ── "CSV" NÃO QUER DIZER VÍRGULA ──────────────────────────────────────────────────
//
// O Excel em português grava e espera ponto-e-vírgula. Basta alguém abrir o arquivo e
// salvar para o separador trocar — o arquivo continua `.csv` e continua abrindo certinho
// na tela da pessoa. A falha do outro lado era silenciosa do pior jeito: `acharCabecalho`
// exige três células distintas, uma linha inteira num campo só nunca chega a três, e a
// importação diria "não achei o cabeçalho" para uma planilha visivelmente correta.
describe("o separador do CSV é descoberto, não suposto", () => {
  const colunas = ["Nome", "Telefone", "Nacionalidade"];

  it("lê o CSV de vírgula", () => {
    const linhas = lerCsv("Nome,Telefone,Nacionalidade\nAna,5511999990000,Haiti\n");
    expect(linhas[0]).toEqual(colunas);
    expect(linhas[1]).toEqual(["Ana", "5511999990000", "Haiti"]);
  });

  it("lê o CSV de ponto-e-vírgula que o Excel em português grava", () => {
    const linhas = lerCsv("Nome;Telefone;Nacionalidade\nAna;5511999990000;Haiti\n");
    expect(linhas[0]).toEqual(colunas);
    expect(linhas[1]).toEqual(["Ana", "5511999990000", "Haiti"]);
  });

  it("lê o separado por tabulação, que é o que sai de copiar e colar da planilha", () => {
    const linhas = lerCsv("Nome\tTelefone\tNacionalidade\nAna\t5511999990000\tHaiti\n");
    expect(linhas[0]).toEqual(colunas);
  });

  // Endereço e observação têm vírgula dentro. Se a contagem olhasse dentro das aspas, um
  // único campo citado decidiria a votação sozinho e quebraria o arquivo inteiro.
  it("não deixa a vírgula DENTRO de um campo citado escolher o separador", () => {
    const csv = 'Nome;Endereço;Telefone\nAna;"Rua A, 30, apto 2, Boa Vista";5511999990000\n';
    const linhas = lerCsv(csv);
    expect(linhas[0]).toEqual(["Nome", "Endereço", "Telefone"]);
    expect(linhas[1][1]).toBe("Rua A, 30, apto 2, Boa Vista");
  });

  // O separador escolhido continua sendo respeitado dentro das aspas.
  it("respeita o ponto-e-vírgula dentro de um campo citado", () => {
    const linhas = lerCsv('Nome;Observação\nAna;"veio em 2024; sem RNM"\n');
    expect(linhas[1]).toEqual(["Ana", "veio em 2024; sem RNM"]);
  });

  it("uma coluna só não vira erro: cai na vírgula", () => {
    expect(lerCsv("Nome\nAna\n")).toEqual([["Nome"], ["Ana"]]);
  });
});

// A prova de que o defeito era este: uma planilha lida com o separador errado vira uma
// coluna só, e `acharCabecalho` — que exige três células distintas — nunca acha nada. A
// pessoa recebia "não achei o cabeçalho" olhando para uma planilha correta.
describe("separador errado era o que escondia o cabeçalho", () => {
  it("com o separador certo, o cabeçalho é a primeira linha", () => {
    const linhas = lerCsv("Nome;Telefone;Nacionalidade\nAna;5511999990000;Haiti\n");
    expect(acharCabecalho(linhas)).toBe(0);
  });

  it("uma coluna só não tem cabeçalho para achar — era o sintoma", () => {
    const comoSeriaAntes = [["Nome;Telefone;Nacionalidade"], ["Ana;5511999990000;Haiti"]];
    expect(acharCabecalho(comoSeriaAntes)).toBe(0); // devolve 0 sem ter achado nada
    expect(comoSeriaAntes[0].length).toBe(1); // e o "cabeçalho" tem uma coluna só
  });
});

// ── O CSV QUE O WORDPRESS EXPORTA ─────────────────────────────────────────────────
//
// `wordpress/imigrar-captura.php` gera um CSV a partir de um tipo de conteúdo do site, e
// esta é a única amarração entre os dois lados: lá as colunas são escolhidas, aqui elas
// são interpretadas. Ninguém roda os dois juntos, então o contrato fica escrito aqui.
describe("o CSV exportado do WordPress cai de pé na importação", () => {
  // O cabeçalho fixo do exportador, mais campos ACF plausíveis de um "orçamento".
  const cabecalho = [
    "ID", "Título", "Data", "Situação (WordPress)",
    "nome_completo", "whatsapp", "email", "nacionalidade", "valor_do_orcamento", "observacoes",
  ];
  const coluna = (nome: string) => cabecalho.indexOf(nome);

  it("o ID vira o identificador da linha — é ele que faz reimportar não duplicar", () => {
    expect(sugerirMapeamento(cabecalho).idExterno).toBe(coluna("ID"));
  });

  // Nomeada assim DE PROPÓSITO no exportador. Uma coluna chamada "Status" cairia na pista
  // de etapa do funil, e "publish"/"draft" viraria fase de atendimento — um dado interno
  // do WordPress se passando por decisão comercial de alguém.
  it('"Situação (WordPress)" não é confundida com a etapa do funil', () => {
    expect(sugerirMapeamento(cabecalho).fase).toBeNull();
  });

  // O controle: uma coluna chamada "Status" SERIA lida como etapa. É por isso que o nome
  // no exportador não é acidental.
  it("o controle: chamada de 'Status', ela viraria etapa", () => {
    const comStatus = cabecalho.map((c) => (c === "Situação (WordPress)" ? "Status" : c));
    expect(sugerirMapeamento(comStatus).fase).toBe(coluna("Situação (WordPress)"));
  });

  it("reconhece os campos que importam sem ninguém configurar nada", () => {
    const mapa = sugerirMapeamento(cabecalho);
    expect(mapa.nome).toBe(coluna("nome_completo"));
    expect(mapa.telefone).toBe(coluna("whatsapp"));
    expect(mapa.email).toBe(coluna("email"));
    expect(mapa.nacionalidade).toBe(coluna("nacionalidade"));
    expect(mapa.propostaValor).toBe(coluna("valor_do_orcamento"));
  });

  // O BOM existe para o Excel não escrever "CÃ¡ssio". Se ele sobrevivesse à leitura, a
  // primeira coluna viraria "\uFEFFID" — invisível na tela, e o bastante para o
  // identificador deixar de ser reconhecido e a reimportação duplicar tudo.
  it("o BOM que o exportador escreve não contamina a primeira coluna", () => {
    const linhas = lerCsv("\uFEFFID,Nome\n12,Ana\n");
    expect(linhas[0][0]).toBe("ID");
    expect(sugerirMapeamento(linhas[0]).idExterno).toBe(0);
  });
});
