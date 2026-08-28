import { describe, it, expect } from "vitest";
import {
  decidir,
  dentroDaJanela,
  INTERVALO_MINIMO_HORAS,
  type CasoEmEspera,
} from "@/lib/followup/regras";
import { CADENCIA_DIAS, MAX_TOQUES, proximoToqueSugerido } from "@/lib/followup/motivos";
import { escolherModelo, textoDoToque, preencher, type ModeloFollowup } from "@/lib/followup/modelos";

// Quarta-feira, 14h de Brasília (17h UTC). Dia útil, dentro das duas janelas.
const QUARTA_14H = new Date("2026-09-02T17:00:00.000Z");
const SABADO_14H = new Date("2026-09-05T17:00:00.000Z");
const QUARTA_3H = new Date("2026-09-02T06:00:00.000Z");

const RODADA = { enviadosHoje: 0, tetoDiario: 40 };

function caso(p: Partial<CasoEmEspera> = {}): CasoEmEspera {
  return {
    motivo: "consulado",
    proximoToqueEm: "2026-09-01T12:00:00.000Z",
    toquesNoMotivo: 0,
    jaRespondeuAlguma: true,
    temPrazoProcessual: false,
    temModeloNoIdioma: true,
    ...p,
  };
}

describe("o follow-up que pode sair", () => {
  it("sai como rascunho por padrão — alguém aprova antes", () => {
    expect(decidir(caso(), RODADA, QUARTA_14H)).toEqual({ tipo: "disparar", envio: "rascunho" });
  });

  it("sai sozinho só quando o modelo foi marcado para isso", () => {
    expect(decidir(caso({ envioDoModelo: "automatico" }), RODADA, QUARTA_14H)).toEqual({
      tipo: "disparar",
      envio: "automatico",
    });
  });
});

describe("caso com prazo processual", () => {
  it("nunca entra em follow-up automático — gera tarefa de ligar", () => {
    for (const envio of ["rascunho", "automatico"] as const) {
      expect(
        decidir(caso({ temPrazoProcessual: true, envioDoModelo: envio }), RODADA, QUARTA_14H),
      ).toEqual({ tipo: "tarefa_ligar" });
    }
  });

  it("vale mesmo quando a sequência já esgotou — prazo não vira 'sumiu'", () => {
    expect(
      decidir(caso({ temPrazoProcessual: true, toquesNoMotivo: 9 }), RODADA, QUARTA_14H),
    ).toEqual({ tipo: "tarefa_ligar" });
  });
});

describe("idioma", () => {
  it("contato sem modelo no seu idioma gera tarefa manual, não dispara", () => {
    expect(decidir(caso({ temModeloNoIdioma: false }), RODADA, QUARTA_14H)).toEqual({
      tipo: "tarefa_manual",
    });
  });

  it("não existe idioma de reserva: crioulo não cai em francês nem em português", () => {
    const modelos: ModeloFollowup[] = [
      { id: "1", motivo: "consulado", idioma: "pt", texto: "oi", variantes: [], envio: "rascunho", ativo: true },
      { id: "2", motivo: "consulado", idioma: "fr", texto: "bonjour", variantes: [], envio: "rascunho", ativo: true },
    ];
    expect(escolherModelo(modelos, "consulado", "ht")).toBeNull();
    expect(escolherModelo(modelos, "consulado", "pt-BR")?.id).toBe("1");
    expect(escolherModelo(modelos, "pagamento", "pt")).toBeNull();
  });

  it("modelo desativado não é escolhido", () => {
    const modelos: ModeloFollowup[] = [
      { id: "1", motivo: "consulado", idioma: "pt", texto: "oi", variantes: [], envio: "rascunho", ativo: false },
    ];
    expect(escolherModelo(modelos, "consulado", "pt")).toBeNull();
  });
});

describe("opt-out", () => {
  it("bloqueia todo disparo futuro, inclusive de outros motivos", () => {
    for (const motivo of ["consulado", "pagamento", "decisao_proposta"] as const) {
      expect(decidir(caso({ motivo, optOutAt: "2026-08-01T00:00:00.000Z" }), RODADA, QUARTA_14H)).toEqual({
        tipo: "bloqueado",
        porque: "opt_out",
      });
    }
  });

  it("quem foi encaminhado à DPU também não recebe", () => {
    expect(decidir(caso({ perfilDpu: true }), RODADA, QUARTA_14H).tipo).toBe("bloqueado");
  });

  it("quem disse que não tem interesse segue conversando, mas nada vai atrás dele", () => {
    expect(decidir(caso({ noFollowupAt: "2026-08-01T00:00:00.000Z" }), RODADA, QUARTA_14H)).toEqual({
      tipo: "bloqueado",
      porque: "sem_followup",
    });
  });
});

describe("proteção do número", () => {
  it("disparo fora da janela de horário é ADIADO, não cancelado", () => {
    expect(decidir(caso(), RODADA, QUARTA_3H)).toEqual({ tipo: "adiar", porque: "fora_da_janela" });
  });

  it("fim de semana adia", () => {
    expect(decidir(caso(), RODADA, SABADO_14H)).toEqual({ tipo: "adiar", porque: "fim_de_semana" });
  });

  it("quem está no exterior tem janela mais estreita — o fuso dele não se conhece", () => {
    // 9h de Brasília: horário decente aqui, madrugada em boa parte de onde este público está.
    const NOVE_DA_MANHA = new Date("2026-09-02T12:00:00.000Z");
    expect(dentroDaJanela(NOVE_DA_MANHA, false)).toBe(true);
    expect(dentroDaJanela(NOVE_DA_MANHA, true)).toBe(false);
    expect(decidir(caso({ noExterior: true }), RODADA, NOVE_DA_MANHA)).toEqual({
      tipo: "adiar",
      porque: "fora_da_janela",
    });
  });

  it("respeita o intervalo mínimo entre dois toques ao mesmo contato", () => {
    const horas = (h: number) => new Date(QUARTA_14H.getTime() - h * 3600 * 1000).toISOString();
    expect(decidir(caso({ ultimoToqueEm: horas(2) }), RODADA, QUARTA_14H)).toEqual({
      tipo: "adiar",
      porque: "intervalo_minimo",
    });
    expect(decidir(caso({ ultimoToqueEm: horas(INTERVALO_MINIMO_HORAS + 1) }), RODADA, QUARTA_14H).tipo).toBe(
      "disparar",
    );
  });

  it("o teto diário por instância é respeitado", () => {
    expect(decidir(caso(), { enviadosHoje: 40, tetoDiario: 40 }, QUARTA_14H)).toEqual({
      tipo: "adiar",
      porque: "teto_diario",
    });
    expect(decidir(caso(), { enviadosHoje: 39, tetoDiario: 40 }, QUARTA_14H).tipo).toBe("disparar");
  });

  it("nunca dispara para quem nunca respondeu nenhuma mensagem", () => {
    expect(decidir(caso({ jaRespondeuAlguma: false }), RODADA, QUARTA_14H)).toEqual({
      tipo: "bloqueado",
      porque: "nunca_respondeu",
    });
  });

  it("ensaio nunca vira mensagem de verdade", () => {
    expect(decidir(caso({ ensaio: true }), RODADA, QUARTA_14H)).toEqual({
      tipo: "bloqueado",
      porque: "ensaio",
    });
  });
});

describe("a sequência tem fim", () => {
  it("terceiro toque sem resposta move para PERDIDO com motivo 'sumiu'", () => {
    expect(decidir(caso({ toquesNoMotivo: MAX_TOQUES - 1 }), RODADA, QUARTA_14H).tipo).toBe("disparar");
    expect(decidir(caso({ toquesNoMotivo: MAX_TOQUES }), RODADA, QUARTA_14H)).toEqual({
      tipo: "encerrar_sumiu",
    });
  });
});

describe("caso em espera sem motivo registrado", () => {
  it("não vira mensagem genérica — vira pendência", () => {
    expect(decidir(caso({ motivo: null }), RODADA, QUARTA_14H)).toEqual({
      tipo: "bloqueado",
      porque: "sem_motivo_de_espera",
    });
  });
});

describe("a cadência sugerida", () => {
  it("é a do domínio, não a de vendas", () => {
    expect(CADENCIA_DIAS.consulado).toBe(30);
    expect(CADENCIA_DIAS.policia_federal).toBe(30);
    expect(CADENCIA_DIAS.decisao_proposta).toBe(2);
    // "Cliente pediu para retomar depois" não tem cadência: a data é a que ele indicou.
    expect(CADENCIA_DIAS.retomar_depois).toBeNull();
    expect(proximoToqueSugerido("retomar_depois")).toBeNull();
  });

  it("propõe a data a partir de hoje", () => {
    const d = proximoToqueSugerido("documento_com_cliente", QUARTA_14H)!;
    expect(Math.round((d.getTime() - QUARTA_14H.getTime()) / 86_400_000)).toBe(3);
  });
});

describe("a variação do texto", () => {
  const modelo: ModeloFollowup = {
    id: "m",
    motivo: "consulado",
    idioma: "pt",
    texto: "Oi{nome}, alguma notícia do consulado sobre{servico}?",
    variantes: ["Olá{nome}! O consulado já respondeu sobre{servico}?"],
    envio: "rascunho",
    ativo: true,
  };

  it("é estável: o mesmo caso, no mesmo toque, escolhe sempre a mesma frase", () => {
    const a = textoDoToque(modelo, { nome: "Ana", chave: "lead-1", toque: 1 });
    const b = textoDoToque(modelo, { nome: "Ana", chave: "lead-1", toque: 1 });
    expect(a).toBe(b);
  });

  it("campo ausente some junto com o espaço à frente", () => {
    expect(preencher("Oi{nome}, tudo bem?", {})).toBe("Oi, tudo bem?");
    expect(preencher("Oi{nome}, tudo bem?", { nome: "Ana" })).toBe("Oi Ana, tudo bem?");
  });
});
