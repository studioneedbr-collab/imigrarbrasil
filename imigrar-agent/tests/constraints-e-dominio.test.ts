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

  it("motivo_perda_categoria aceita todos os motivos de perda", () => {
    const doBanco = valoresDoCheck("motivo_perda_categoria");
    expect(doBanco).not.toBeNull();
    for (const motivo of MOTIVOS_DE_PERDA) {
      expect(doBanco, `o banco recusaria a perda por "${motivo}"`).toContain(motivo);
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
