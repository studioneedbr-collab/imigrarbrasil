import { describe, it, expect } from "vitest";
import {
  decidirAtendimento,
  modoEfetivo,
  faixaDaChaveGeral,
  mensagemAgenteDesligado,
  CHAVE_GERAL_PADRAO,
  type InstanciaParaDecisao,
} from "@/lib/agent/ativacao";
import { minutosDeExpedienteEntre, slaHumanoEstourado } from "@/lib/agent/expediente";
import type { ChaveGeral } from "@/lib/domain/types";

const ligada: ChaveGeral = { ligada: true, autor: null, em: null, motivo: null };
const desligada: ChaveGeral = {
  ligada: false,
  autor: "shayene@imigrarbrasil.com.br",
  em: "2026-08-27T12:00:00.000Z",
  motivo: "resposta errada sobre prazo de defesa",
};

const producao = (p: Partial<InstanciaParaDecisao> = {}): InstanciaParaDecisao => ({
  nome: "Produção", ambiente: "producao", ativo: true, modoDesligado: "sombra", respostaFixa: null, ...p,
});
const teste = (p: Partial<InstanciaParaDecisao> = {}): InstanciaParaDecisao => ({
  nome: "Teste", ambiente: "teste", ativo: false, modoDesligado: "silencio", respostaFixa: null, ...p,
});

describe("nível 1 — chave geral", () => {
  it("desligada cala TODAS as instâncias, inclusive as que estão ativas", () => {
    const d = decidirAtendimento({ chaveGeral: desligada, instancia: producao({ ativo: true }) });
    expect(d.acao).not.toBe("responder");
    expect(d.nivel).toBe("chave_geral");
  });

  it("a faixa diz quem desligou, quando e por quê — não some da tela", () => {
    const faixa = faixaDaChaveGeral(desligada)!;
    expect(faixa).toContain("shayene@imigrarbrasil.com.br");
    expect(faixa).toContain("resposta errada sobre prazo de defesa");
    expect(faixaDaChaveGeral(ligada)).toBeNull();
  });

  it("sem registro no banco, a chave nasce LIGADA — deploy não emudece o WhatsApp", () => {
    expect(CHAVE_GERAL_PADRAO.ligada).toBe(true);
  });
});

describe("nível 2 — por instância", () => {
  it("ligar a instância de teste NÃO liga a de produção", () => {
    const testeLigada = teste({ ativo: true });
    const prodDesligada = producao({ ativo: false });

    expect(decidirAtendimento({ chaveGeral: ligada, instancia: testeLigada }).acao).toBe("responder");
    expect(decidirAtendimento({ chaveGeral: ligada, instancia: prodDesligada }).acao).not.toBe("responder");
    expect(decidirAtendimento({ chaveGeral: ligada, instancia: prodDesligada }).nivel).toBe("instancia");
  });

  it("silêncio total é privilégio de teste — em produção vira resposta fixa", () => {
    expect(modoEfetivo("silencio", "teste")).toBe("silencio");
    expect(modoEfetivo("silencio", "producao")).toBe("resposta_fixa");

    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao({ ativo: false, modoDesligado: "silencio" }),
    });
    expect(d.acao).toBe("resposta_fixa");
  });

  it("instância desconhecida grava e não envia — nunca responde por um canal que não reconhece", () => {
    const d = decidirAtendimento({ chaveGeral: ligada, instancia: null });
    expect(d.acao).toBe("sombra");
    expect(d.aguardaHumano).toBe(true);
  });

  it("conversa de teste não entra na fila de trabalho", () => {
    const d = decidirAtendimento({ chaveGeral: desligada, instancia: teste() });
    expect(d.acao).toBe("silencio");
    expect(d.aguardaHumano).toBe(false);
  });
});

describe("nível 3 — por conversa", () => {
  it("humano assumiu: o agente para de responder NAQUELA conversa", () => {
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao({ ativo: true }),
      conversaAssumidaPor: "advogado@imigrarbrasil.com.br",
    });
    expect(d.acao).toBe("silencio");
    expect(d.nivel).toBe("conversa");
  });

  it("conversa assumida não abre relógio de primeira resposta — o humano já está lá", () => {
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao(),
      conversaAssumidaPor: "advogado@imigrarbrasil.com.br",
    });
    expect(d.aguardaHumano).toBe(false);
  });

  it("assumir uma conversa não desliga o agente nas outras", () => {
    const inst = producao({ ativo: true });
    expect(decidirAtendimento({ chaveGeral: ligada, instancia: inst, conversaAssumidaPor: "a@b.c" }).acao).toBe("silencio");
    expect(decidirAtendimento({ chaveGeral: ligada, instancia: inst, conversaAssumidaPor: null }).acao).toBe("responder");
  });
});

describe("comportamento com o agente desligado", () => {
  it("desligado em produção sempre abre o relógio da primeira resposta humana", () => {
    for (const modo of ["silencio", "resposta_fixa", "sombra"] as const) {
      const d = decidirAtendimento({
        chaveGeral: ligada,
        instancia: producao({ ativo: false, modoDesligado: modo }),
      });
      expect(d.aguardaHumano, `modo ${modo}`).toBe(true);
    }
  });

  it("a resposta fixa promete um horário que existe — nunca 'em instantes' de madrugada", () => {
    // Sábado, 21h em Brasília (00h de domingo em UTC).
    const sabadoNoite = new Date("2026-08-30T00:00:00.000Z");
    const texto = mensagemAgenteDesligado(sabadoNoite);
    expect(texto).toContain("segunda-feira");
    expect(texto).not.toContain("em instantes");
  });

  it("o texto próprio da instância tem preferência sobre o padrão", () => {
    expect(mensagemAgenteDesligado(new Date(), "  Já chamei o time. ")).toBe("Já chamei o time.");
  });
});

describe("o relógio do SLA conta só expediente", () => {
  // Segunda-feira, 17h55 em Brasília = 20h55 UTC.
  const sextaTarde = new Date("2026-08-28T20:55:00.000Z"); // sexta 17h55 BRT

  it("30 minutos a partir das 17h55 de sexta não estouram no sábado", () => {
    const sabado = new Date("2026-08-29T14:00:00.000Z");
    expect(slaHumanoEstourado(sextaTarde.toISOString(), 30, sabado)).toBe(false);
  });

  it("estouram na segunda pela manhã, quando alguém realmente poderia ter respondido", () => {
    const segunda = new Date("2026-08-31T11:40:00.000Z"); // segunda 08h40 BRT
    expect(slaHumanoEstourado(sextaTarde.toISOString(), 30, segunda)).toBe(true);
  });

  it("dentro do expediente conta minuto a minuto", () => {
    const dez = new Date("2026-08-27T13:00:00.000Z"); // quinta 10h BRT
    const onze = new Date("2026-08-27T14:00:00.000Z"); // quinta 11h BRT
    expect(minutosDeExpedienteEntre(dez, onze)).toBe(60);
    expect(slaHumanoEstourado(dez.toISOString(), 30, onze)).toBe(true);
    expect(slaHumanoEstourado(dez.toISOString(), 90, onze)).toBe(false);
  });

  it("fim de semana inteiro não conta nenhum minuto", () => {
    const sabado = new Date("2026-08-29T12:00:00.000Z");
    const domingo = new Date("2026-08-30T12:00:00.000Z");
    expect(minutosDeExpedienteEntre(sabado, domingo)).toBe(0);
  });

  it("sem relógio aberto, nada estoura", () => {
    expect(slaHumanoEstourado(null, 30, new Date())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENCAMINHOU, CALOU.
//
// Numa conversa real a Ana disse "ya pasé tu caso al equipo jurídico" e seguiu
// conversando por mais duas mensagens. Do lado de lá isso é ambíguo do pior jeito: a
// pessoa não sabe mais se está falando com a Ana ou com o advogado, e o detalhe do caso
// que ela contar dali em diante vai para quem não é advogado.
// ─────────────────────────────────────────────────────────────────────────────
describe("nível 3 — o agente se cala depois de encaminhar", () => {
  it("conversa já encaminhada não recebe mais resposta do agente", () => {
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao(),
      conversaJaEncaminhada: true,
    });
    expect(d.acao).toBe("silencio");
    expect(d.nivel).toBe("conversa");
  });

  it("mas o relógio de primeira resposta humana continua correndo", () => {
    // Calar não pode virar buraco: a conversa entra na fila esperando gente, com SLA.
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao(),
      conversaJaEncaminhada: true,
    });
    expect(d.aguardaHumano).toBe(true);
  });

  it("em instância de teste o silêncio vale, mas a fila de trabalho não", () => {
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: teste({ ativo: true }),
      conversaJaEncaminhada: true,
    });
    expect(d.acao).toBe("silencio");
    expect(d.aguardaHumano).toBe(false);
  });

  it("conversa devolvida ao agente volta a ser atendida", () => {
    // `releaseConversation` põe o status em 'active' — é assim que um humano devolve.
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao(),
      conversaJaEncaminhada: false,
    });
    expect(d.acao).toBe("responder");
  });

  it("o silêncio do encaminhamento não depende do modo de desligado da instância", () => {
    // `resposta_fixa` é o comportamento de "o agente está desligado". Aqui ele está
    // ligado e escolheu se calar — mandar o aviso automático seria falar por cima do time.
    const d = decidirAtendimento({
      chaveGeral: ligada,
      instancia: producao({ modoDesligado: "resposta_fixa" }),
      conversaJaEncaminhada: true,
    });
    expect(d.acao).toBe("silencio");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FAIXA PRECISA DIZER SE A CONTA QUE ELA NOMEIA É A SUA
// ─────────────────────────────────────────────────────────────────────────────
//
// O painel mostrava "Agente desligado por studioneedbr@gmail.com" para alguém que não
// tinha como saber, em tela nenhuma, se aquele e-mail era o dele. Uma frase que nomeia uma
// conta sem dizer se é a sua vira charada — e a pergunta que ela levanta ("fui eu que
// desliguei?") é a que decide se a pessoa religa agora ou vai procurar quem desligou.
describe("de quem é a conta que desligou o agente", () => {
  const desligada = {
    ligada: false,
    autor: "studioneedbr@gmail.com",
    em: "2026-08-28T07:16:13.000Z",
    motivo: "numero errado",
  };

  it("diz “você” quando quem lê é quem desligou", () => {
    const faixa = faixaDaChaveGeral(desligada, "studioneedbr@gmail.com")!;
    expect(faixa).toContain("por você (studioneedbr@gmail.com)");
  });

  it("não confunde maiúsculas nem espaço colado no e-mail", () => {
    expect(faixaDaChaveGeral(desligada, "  StudioNeedBR@Gmail.com ")!).toContain("por você");
  });

  it("nomeia a outra conta quando não foi você", () => {
    const faixa = faixaDaChaveGeral(desligada, "victor@needbr.com")!;
    expect(faixa).toContain("por studioneedbr@gmail.com");
    expect(faixa).not.toContain("você");
  });

  it("sem sessão, continua nomeando a conta — nunca chuta que foi você", () => {
    expect(faixaDaChaveGeral(desligada)!).not.toContain("você");
  });
});
