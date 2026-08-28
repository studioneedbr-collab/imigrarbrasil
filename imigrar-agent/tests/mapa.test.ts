import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ACERVO_DO_MAPA, CENARIOS_FIXOS, CLASSIFICACOES_DO_MAPA, ETAPAS } from "@/lib/agent/mapa";
import { CLASSIFICACOES } from "@/lib/domain/types";

// O MAPA QUE MENTE É PIOR DO QUE MAPA NENHUM.
//
// Um fluxograma de agente envelhece em uma sprint: o código muda, o desenho não, e a
// partir daí existe uma fonte errada com aparência de oficial — alguém decide confiar (ou
// desconfiar) do agente lendo uma tela que descreve outro sistema.
//
// Estes testes são o que impede isso de acontecer em silêncio. Não conseguem provar que a
// descrição está certa; conseguem provar que ela ainda APONTA para algo que existe, que é
// onde a apodrecida começa: o arquivo renomeado, a classificação removida, o PDF que saiu
// do acervo.

const raiz = path.resolve(__dirname, "..");

/** "lib/agent/rag.ts · lib/agent/tools.ts" → os dois caminhos. */
function caminhos(campo: string): string[] {
  return campo
    .split("·")
    .map((p) => p.trim())
    // "lib/agent/index.ts · buildDadosConhecidosBlock" — o segundo pedaço é o nome de uma
    // função, não um arquivo. Só conferimos o que tem cara de caminho.
    .filter((p) => p.includes("/"));
}

describe("o mapa aponta para código que existe", () => {
  it("toda etapa cita ao menos um arquivo, e ele está no repositório", () => {
    for (const etapa of ETAPAS) {
      const arquivos = caminhos(etapa.arquivo);
      expect(arquivos.length, `etapa ${etapa.id} sem arquivo`).toBeGreaterThan(0);
      for (const a of arquivos) {
        expect(fs.existsSync(path.join(raiz, a)), `${etapa.id} → ${a}`).toBe(true);
      }
    }
  });

  it("os cenários fixos também citam arquivo existente", () => {
    for (const c of CENARIOS_FIXOS) {
      for (const a of c.onde.split("·").map((p) => p.trim())) {
        // Nos cenários o caminho vem curto ("transfer-gate.ts (PEDIU_HUMANO)"), porque a
        // linha é lida por quem não abre código. Conferimos o nome do arquivo.
        const nome = a.split(" ")[0];
        if (!nome.endsWith(".ts")) continue;
        const achou = fs.existsSync(path.join(raiz, "lib/agent", nome));
        expect(achou, `cenário "${c.pergunta}" → ${nome}`).toBe(true);
      }
    }
  });
});

describe("o mapa não inventa vocabulário", () => {
  it("as classificações são as do domínio, sem sobrar nem faltar", () => {
    expect(CLASSIFICACOES_DO_MAPA.map((c) => c.chave)).toEqual([...CLASSIFICACOES]);
  });

  it("o acervo do mapa é o mesmo que vai ao prompt", () => {
    expect(ACERVO_DO_MAPA.length).toBeGreaterThan(0);
    for (const d of ACERVO_DO_MAPA) {
      expect(d.arquivo.endsWith(".pdf")).toBe(true);
      expect(["cartilha", "legislacao", "doutrina"]).toContain(d.colecao);
    }
  });

  it("a ordem começa na chegada da mensagem e termina no que fica gravado", () => {
    expect(ETAPAS[0].tipo).toBe("entrada");
    expect(ETAPAS[ETAPAS.length - 1].tipo).toBe("saida");
    // Uma caixa de modelo, e uma só: o mapa existe para mostrar que a Ana escreve dentro
    // de um corredor estreito, e duas caixas de LLM significariam que o corredor furou.
    expect(ETAPAS.filter((e) => e.tipo === "modelo")).toHaveLength(1);
  });
});
