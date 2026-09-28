import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COLUNAS } from "@/lib/fila/kanban";
import { MOTIVOS_DE_PERDA, CLASSIFICACOES } from "@/lib/domain/types";

/**
 * O BANCO E O DOMÍNIO CONTAM A MESMA HISTÓRIA?
 *
 * Este arquivo nasceu de um defeito que ficou meses em produção sem ninguém ver.
 *
 * A migration 019 criou `leads.atendimento_status` com um check de cinco valores. A 027
 * acrescentou 'proposta_enviada' ao domínio, ao quadro e ao check das ETAPAS — e anotou
 * que a tabela `leads` não tinha check nenhum. Tinha. O resultado: a tela mostrava a
 * coluna "Proposta enviada", a fila ordenava por ela, o relatório contava por ela, e
 * arrastar um card para lá era recusado pelo banco.
 *
 * A suíte inteira passava, e passaria de novo: ela roda contra o repositório em memória,
 * que não tem constraint. Uma regra que só existe no SQL é uma regra que nenhum teste
 * deste projeto estava olhando — e o jeito de olhar é ler o SQL como texto e comparar com
 * as listas do código.
 *
 * O teste lê a ÚLTIMA definição de cada constraint, na ordem das migrations, porque é
 * assim que o banco fica: a última a rodar é a que vale.
 */

const PASTA = join(process.cwd(), "supabase", "migrations");

function sqlDeTodasAsMigrations(): string {
  return readdirSync(PASTA)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(PASTA, f), "utf8"))
    .join("\n");
}

/**
 * Os valores da última `check (<coluna> in ('a','b',…))` escrita para aquela coluna.
 * Devolve `null` quando a coluna não tem check nenhum — que é diferente de ter um vazio.
 */
function valoresDoCheck(coluna: string): string[] | null {
  const sql = sqlDeTodasAsMigrations();
  // Procura `<coluna> in (…)` em qualquer lugar, e não logo depois de `check (`: as
  // colunas que aceitam nulo são escritas como
  // `check (classificacao is null or classificacao in ('…'))`, às vezes com a lista na
  // linha seguinte. Ancorar no `check (` fazia o teste não achar nada e passar por
  // engano — que é o pior defeito possível num teste que existe para pegar divergência.
  const re = new RegExp(`\\b${coluna}\\s+in\\s*\\(([^)]*)\\)`, "gi");
  let ultimo: string | null = null;
  let achado: RegExpExecArray | null;
  while ((achado = re.exec(sql)) !== null) ultimo = achado[1];
  if (ultimo === null) return null;
  return Array.from(ultimo.matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

/**
 * O MESMO ESQUECIMENTO, NA OUTRA CAMADA.
 *
 * As rotas de etapa validavam o status com uma lista escrita à mão, e ela também ficou
 * sem 'proposta_enviada'. O seletor da tela é montado a partir de `COLUNAS`, então ele
 * OFERECIA a opção e salvar respondia 400 "Dados inválidos" — sem nada na tela explicando
 * por quê.
 *
 * O conserto foi derivar o enum de `COLUNAS`. Este teste existe para que a cópia à mão
 * não volte: uma lista de status literal dentro dessas rotas é o defeito, não o sintoma.
 */
describe("as rotas de etapa não têm cópia à mão dos status", () => {
  const ROTAS = [
    join(process.cwd(), "app", "api", "crm", "etapas", "route.ts"),
    join(process.cwd(), "app", "api", "crm", "etapas", "[id]", "route.ts"),
  ];

  for (const rota of ROTAS) {
    it(`${rota.split("/api/")[1]} deriva o status de COLUNAS`, () => {
      const fonte = readFileSync(rota, "utf8");
      expect(fonte, "a rota precisa importar COLUNAS").toContain('from "@/lib/fila/kanban"');
      // `z.enum(["novo", …])` de volta no arquivo é a cópia que se quer impedir.
      expect(fonte, "voltou uma lista de status escrita à mão").not.toMatch(
        /z\.enum\(\s*\[\s*"novo"/,
      );
    });
  }
});

describe("o check do banco acompanha o domínio", () => {
  // O defeito que motivou o arquivo. Se alguém acrescentar um status no código e
  // esquecer a migration, é aqui que aparece — e não numa carga de 76 leads.
  it("atendimento_status aceita todas as colunas do quadro", () => {
    const doBanco = valoresDoCheck("atendimento_status");
    expect(doBanco, "nenhuma migration define o check de atendimento_status").not.toBeNull();
    for (const status of COLUNAS) {
      expect(doBanco, `o banco recusaria um caso em "${status}"`).toContain(status);
    }
  });

  /**
   * O CHECK DE MOTIVO FOI EMBORA DE PROPÓSITO (migration 034).
   *
   * A lista virou dado: o escritório cria e edita categorias pela tela. Um check com as
   * seis chaves antigas faria a tela criar uma categoria que o banco recusaria na hora de
   * usá-la — o mesmo defeito de `proposta_enviada`, que custou meses aqui.
   *
   * Este teste inverte o de antes: em vez de exigir que a lista do banco acompanhe a do
   * código, ele exige que NÃO HAJA lista no banco. Se alguém reintroduzir o check "para
   * garantir", quebra aqui, com o motivo escrito.
   */
  it("motivo_perda_categoria NÃO tem check: a lista virou dado", () => {
    const sql = sqlDeTodasAsMigrations();
    const criacoes = Array.from(
      sql.matchAll(/add constraint\s+leads_motivo_perda_categoria_check/gi),
    ).length;
    const remocoes = Array.from(
      sql.matchAll(/drop constraint\s+if exists\s+leads_motivo_perda_categoria_check/gi),
    ).length;
    expect(
      remocoes,
      "o check precisa ser removido depois da última vez que foi criado",
    ).toBeGreaterThanOrEqual(criacoes);

    // E a última palavra sobre essa constraint tem de ser a remoção.
    const ultimaCriacao = sql.lastIndexOf("add constraint leads_motivo_perda_categoria_check");
    const ultimaRemocao = sql.lastIndexOf("drop constraint if exists leads_motivo_perda_categoria_check");
    expect(ultimaRemocao, "a última migration a falar do check precisa ser a que o remove").toBeGreaterThan(
      ultimaCriacao,
    );
  });

  // A semente precisa existir: quem já tem caso fechado com essas chaves continua tendo
  // nome legível depois que a lista virou tabela.
  it("as seis categorias antigas entram como semente da tabela", () => {
    const sql = sqlDeTodasAsMigrations();
    for (const motivo of MOTIVOS_DE_PERDA) {
      expect(sql, `"${motivo}" sumiria do histórico`).toContain(`'${motivo}'`);
    }
  });

  it("classificacao aceita todas as classificações da IA", () => {
    const doBanco = valoresDoCheck("classificacao");
    expect(doBanco).not.toBeNull();
    for (const c of CLASSIFICACOES) {
      expect(doBanco, `o banco recusaria a classificação "${c}"`).toContain(c);
    }
  });

  // O caminho inverso: um valor que o banco aceita e o código não conhece é uma coluna
  // que pode existir no banco e não ter rótulo, nem cor, nem lugar no quadro.
  it("o banco não aceita status que o quadro não sabe desenhar", () => {
    const doBanco = valoresDoCheck("atendimento_status") ?? [];
    for (const status of doBanco) {
      expect(COLUNAS as readonly string[], `o banco aceita "${status}", que o código não conhece`).toContain(status);
    }
  });
});

/**
 * O TEXTO DE 1 PIXEL QUE ESTICAVA A PÁGINA EM 469.
 *
 * `sr-only` do Tailwind é `position: absolute`. Dentro da faixa do quadro — que rola na
 * horizontal — um absoluto SEM ancestral posicionado não é contido por ela: ele vai para a
 * posição estática dele, centenas de pixels à direita, e o `scrollWidth` da PÁGINA cresce
 * junto. O efeito era o quadro rolar o navegador inteiro, cortar as colunas da direita e
 * levar a barra lateral embora.
 *
 * Foi relatado como "o scroll está no navegador todo e não só nas etapas", e eu conclui
 * duas vezes que não reproduzia — medindo antes de o quadro terminar de carregar. Só
 * apareceu ao medir `document.documentElement.scrollWidth` com os cards já na tela: 1749px
 * numa janela de 1280, por causa de um texto que ninguém vê.
 *
 * O teste é de texto porque a regra é de CSS e a suíte não tem navegador. Ele não prova
 * que a página não rola; prova que as duas contenções que a impedem continuam escritas.
 */
describe("o que rola na horizontal contém os absolutos de dentro", () => {
  it("a faixa do quadro é bloco de contenção", () => {
    const fonte = readFileSync(join(process.cwd(), "components", "crm", "quadro.tsx"), "utf8");
    const faixa = fonte.match(/className="[^"]*overflow-x-auto[^"]*"/)?.[0] ?? "";
    expect(faixa, "a faixa que rola precisa de `relative`").toContain("relative");
  });

  it("o selo de idioma contém o próprio texto de leitor de tela", () => {
    const fonte = readFileSync(join(process.cwd(), "components", "fila", "linha.tsx"), "utf8");
    expect(fonte).toContain("sr-only");
    expect(
      fonte.match(/className=\{`relative inline-flex h-6/),
      "o selo que abriga um `sr-only` precisa de `relative`",
    ).toBeTruthy();
  });
});
