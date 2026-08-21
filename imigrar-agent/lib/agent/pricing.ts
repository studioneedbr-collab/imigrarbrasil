import type { ServiceSchedule } from "@/lib/domain/types";
import { SEED_SERVICES, SCHEDULE_POSTS } from "@/lib/agent/catalog";
import { getPricingParams, type PricingParams } from "@/lib/agent/pricing-params";
import {
  resolverPraca,
  resolverPiso,
  baseDeCalculo,
  PRACA_BASE,
  type CCT,
  type AdicionaisCCT,
  type BeneficiosCCT,
} from "@/lib/agent/cct";
import { FUNCTION_CATALOG } from "@/lib/agent/function-catalog";
import { dimensionar, coberturaDimensionavel, type Cobertura } from "@/lib/agent/dimensionamento";

// ──────────────────── PERCENTUAIS DA PLANILHA SHINE RIO 2026 ────────────────────
// Aba SERVENTE, a única composição fechada da planilha: salário 1.851,90 → custo
// 3.930,10. Os percentuais são os da IN 05/2017 e não dependem da praça — o que muda de
// praça para praça é o PISO e os BENEFÍCIOS, e esses vêm da CCT (lib/agent/cct.ts).
// O preço de venda depende ainda da taxa administrativa, que é decisão da empresa e
// mora no bloco do BDI mais abaixo.
const ASG_SALARY = 1851.9;

// Módulo 2.1 — 13º (8,33%) + férias e adicional (12,10%), sobre o Módulo 1.
const RATE_13_FERIAS = 0.0833 + 0.121;
// Módulo 2.2 — INSS 20% + Sal.Educação 2,5% + RAT×FAP 1,5% + SESC 1,5% + SENAI 1% +
// SEBRAE 0,6% + INCRA 0,2% + FGTS 8% = 35,3%. Incide sobre Módulo 1 + Módulo 2.1, e não
// só sobre o salário: é assim que a planilha chega aos R$ 787,27 (2.230,24 × 35,3%).
const RATE_ENCARGOS = 0.353;
// Módulo 3 — provisão para rescisão, 6,07% sobre o Módulo 1 (soma das seis linhas).
const RATE_RESCISAO = 0.0607;
// Módulo 4.1 — reposição do profissional ausente. A planilha aplica 2,76% sobre uma base
// própria (J84 = 3.152,63) que não é nenhum dos módulos redondos; mantemos o percentual
// calibrado sobre o Módulo 1, que reproduz os R$ 87,01 do ASG e acompanha o piso.
const RATE_REPOSICAO = 87.01 / ASG_SALARY;

/**
 * Linhas de cada submódulo, para a planilha de composição sair item a item como a modelo.
 *
 * Os percentuais são os da aba SERVENTE. O 4.1 é a exceção: a planilha aplica os dele
 * sobre uma base própria (a célula J84, R$ 3.152,63, que não é nenhum dos módulos
 * redondos), então aqui vira PESO de rateio do total — a soma continua sendo o R$ 87,01
 * calibrado, e cada linha fica proporcional ao que a planilha mostra.
 */
export const SUBMODULOS = {
  m21: [
    ["13º salário", 0.0833],
    ["Férias e adicional de férias", 0.121],
  ],
  m22: [
    ["INSS", 0.2],
    ["Salário Educação", 0.025],
    ["Seguro Acidente do Trabalho (RAT x FAP)", 0.015],
    ["SESC ou SESI", 0.015],
    ["SENAI ou SENAC", 0.01],
    ["SEBRAE", 0.006],
    ["INCRA", 0.002],
    ["FGTS", 0.08],
  ],
  m3: [
    ["Aviso prévio indenizado", 0.0042],
    ["Incidência do FGTS sobre o aviso prévio indenizado", 0.0003],
    ["Multa do FGTS sobre o aviso prévio indenizado", 0.02],
    ["Aviso prévio trabalhado", 0.0194],
    ["Incidência dos encargos do submódulo 2.2 sobre o aviso prévio trabalhado", 0.0068],
    ["Multa do FGTS sobre o aviso prévio trabalhado", 0.01],
  ],
  m41: [
    ["Substituto na cobertura de férias", 0.0101 / 0.0276],
    ["Substituto na cobertura das ausências legais", 0.0128 / 0.0276],
    ["Substituto na cobertura de licença-paternidade", 0.0036 / 0.0276],
    ["Substituto na cobertura das ausências por acidente de trabalho", 0.0003 / 0.0276],
    ["Substituto na cobertura de afastamento maternidade", 0.0008 / 0.0276],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>;

// Jornada mensal padrão da categoria (8h/dia). A CCT de SC confirma no parágrafo quarto
// da cláusula 3ª: os pisos correspondem a 220 horas mensais.
const HORAS_MES = 220;

// Hora noturna reduzida: 52min30s valem uma hora (art. 73 §1º CLT). Cada hora do relógio
// no período noturno vira 60/52,5 horas de pagamento — o excedente é a linha E do Módulo 1.
const FATOR_HORA_REDUZIDA = 60 / 52.5 - 1;

// Janela noturna legal: 22h às 5h.
const HORAS_NOTURNAS_POR_TURNO = 7;

/**
 * Dias trabalhados por mês em cada escala. Entra no vale-transporte, no auxílio-refeição
 * (ambos "por dia efetivamente trabalhado", nas palavras da CCT) e na intrajornada.
 *
 * 22 é o que a planilha 2026 usa na aba SERVENTE (células G57 e G59) para o 5x2. O 12x36
 * dá 365/2/12 = 15,21 turnos por mês — usar 22 aqui pagaria sete dias de vale que o
 * porteiro não trabalha e inflaria o posto de portaria.
 */
export const DIAS_POR_ESCALA: Record<string, number> = {
  "5x2_44h": 22,
  "6x1_44h": 26,
  "12x36": 15.21,
};

function diasTrabalhados(schedule: string, cct: CCT): number {
  return DIAS_POR_ESCALA[schedule] ?? cct.beneficios?.diasUteisMes ?? 22;
}

// ─────────────────────────────── BDI (MÓDULO 6) ───────────────────────────────
// TAXA ADMINISTRATIVA — decisão da empresa, não da planilha. O Eduardo fechou em
// 17/08/2026: 2% de custo (custos indiretos) e 8% de lucro. A planilha modelo trazia 6%
// de lucro; o teste do Phillipe rodou com 8% total (2% + 6%) e a diferença apareceu.
// Para mudar a margem, mexa AQUI — é a única fonte destes percentuais no sistema.
export const CUSTOS_INDIRETOS = 0.02;
export const LUCRO = 0.08;
// Tributos não são escolha: PIS 1,39% + COFINS 6,42% + ISS 5,00%, no Lucro Real.
export const TRIBUTOS = 0.1281;

/**
 * Cada parcela incide "por dentro": os indiretos sobre o custo, o lucro sobre o custo já
 * com os indiretos, e os tributos sobre o PREÇO DE VENDA — por isso dividem em vez de
 * multiplicar. É a mecânica da planilha modelo (IN 05/2017).
 *
 * A conta é COMPOSTA, não calibrada num preço-alvo: com os 6% antigos ela dá 0,24005, os
 * mesmos 24,00% que a planilha mostra e que o seed do agent_config guardava como 0,24004.
 * Antes o BDI vinha de dividir o preço do ASG pelo custo dele — o que travava a margem no
 * valor de uma planilha de 2026 e escondia de quem lê onde o lucro era decidido.
 */
export const BDI = ((1 + CUSTOS_INDIRETOS) * (1 + LUCRO)) / (1 - TRIBUTOS) - 1;

// ─────────────────────── MATERIAL E EQUIPAMENTO ───────────────────────
// Abas EQUIPAMENTOS e MATERIAL da planilha Shine Rio 2026. Estes são custos DO CONTRATO,
// não do posto: a lista é de um prédio inteiro (70 dispensers, 150 lixeiras de banheiro,
// 6 enceradeiras), e o rodapé de cada aba divide o total por 12 — a planilha foi montada
// para um contrato de 12 postos.
//
// Por isso o motor rateia pelo número de postos DO CONTRATO em vez de somar um valor fixo
// por cabeça: um contrato de 20 postos dilui o mesmo material em mais gente, um de 4 o
// concentra. Foi a decisão do Eduardo em 11/08/2026, depois de os testes com a Shayene
// saírem abaixo do esperado justamente por o material não entrar em lugar nenhum.
const EQUIPAMENTOS_MENSAL_CONTRATO = 1226.39; // aba EQUIPAMENTOS, "Valor Mensal - R$"
const MATERIAL_MENSAL_CONTRATO = 4694.15; // aba MATERIAL, "Total Mensal"

/**
 * Abaixo deste número de postos o rateio deixa de fazer sentido e o material vai para o
 * humano dimensionar pelo escopo real.
 *
 * A lista da planilha é de um prédio grande. Rateada em 1 posto dá R$ 5.920,54/mês só de
 * material — o preço do posto mais que dobraria (passaria de R$ 12 mil), e nenhum cliente de um
 * posto precisa de 150 lixeiras de banheiro. De 8 postos para cima o rateio fica entre
 * R$ 740 e R$ 197 por posto (+19% a +5% no preço), que é faixa defensável.
 */
export const POSTOS_MINIMOS_MATERIAL = 8;

/** Praça da composição fechada da planilha. */
export const REGIAO_BASE = PRACA_BASE.regiao;

// ────────────────────────────── ADICIONAIS DO POSTO ──────────────────────────────

/**
 * O que o posto tem de adicional. Nada aqui é automático: insalubridade depende de laudo,
 * periculosidade depende da atividade, noturno depende do horário. A Shayene levanta isso
 * com o cliente e passa adiante — é exatamente o que o Eduardo pediu em 13/08/2026, as
 * "células pendentes para serem inseridas de acordo com as informações coletadas".
 */
export interface AdicionaisInput {
  /** Grau do laudo do SESMET. Ausente = posto salubre. */
  insalubridade?: "minimo" | "medio" | "maximo";
  /** Atividade perigosa (fachada com rapel, andaime acima de 2,5m, alpinismo). */
  periculosidade?: boolean;
  /** Posto noturno. Usa a janela legal de 22h às 5h. */
  noturno?: boolean;
  /** Sobrescreve as horas noturnas do mês quando o posto tem janela própria. */
  horasNoturnasMes?: number;
  /** Posto que não pode parar: o intervalo é suprimido e indenizado. */
  intrajornadaIndenizada?: boolean;
  /** Quantos empregados ficam sob esta pessoa. Dispara a gratificação de liderança. */
  lideraEquipeDe?: number;
}

/** Módulo 1 detalhado, linha a linha, como sai na planilha. */
export interface Modulo1 {
  salarioBase: number;
  periculosidade: number;
  insalubridade: number;
  adicionalNoturno: number;
  horaNoturnaReduzida: number;
  gratificacaoFuncao: number;
  total: number;
}

export interface CostBreakdown {
  salarioBase: number;
  /** Módulo 1 completo: salário base + adicionais da CCT. */
  modulo1: Modulo1;
  /** Total da remuneração (Módulo 1). É a base dos módulos 2, 3 e 4. */
  remuneracao: number;
  decimoTerceiroFerias: number;
  encargos: number;
  beneficios: number;
  /** Detalhe do Módulo 2.3, para a planilha e para a conferência. */
  beneficiosDetalhe: { valeTransporte: number; alimentacao: number; cestaBasica: number; beneficioSocial: number };
  provisaoRescisao: number;
  reposicaoAusencias: number;
  /** Módulo 4.2 — substituto/indenização do intervalo intrajornada. */
  intrajornada: number;
  uniforme: number;
  equipamentos: number;
  material: number;
  custoPuro: number;
  bdi: number;
  precoVenda: number;
  priceConfirmed: boolean;
}

/** Adicional pedido que a CCT da praça não sabe calcular. Vira sob consulta. */
export interface AdicionalNaoCoberto {
  adicional: string;
  motivo: string;
}

interface ComputeContext {
  cct: CCT;
  schedule: string;
  adicionais?: AdicionaisInput;
}

/**
 * Monta o Módulo 1 (composição da remuneração) com os adicionais que a CCT da praça
 * define. Devolve também o que não conseguiu calcular: adicional pedido sem cláusula na
 * convenção, ou com base de cálculo que ainda não está cadastrada.
 */
export function computeModulo1(
  p: PricingParams,
  ctx: ComputeContext,
): { modulo1: Modulo1; naoCobertos: AdicionalNaoCoberto[] } {
  const { cct, schedule, adicionais: ad } = ctx;
  const cctAd = cct.adicionais;
  const naoCobertos: AdicionalNaoCoberto[] = [];
  const s = p.baseSalary;
  const valorHora = s / HORAS_MES;

  // B — Periculosidade. Não acumula com insalubridade (RJ, cláusula 18ª §7º): o empregado
  // opta pelo que for melhor, e o custo é o maior dos dois.
  let periculosidade = 0;
  if (ad?.periculosidade) {
    if (!cctAd?.periculosidade) {
      naoCobertos.push({ adicional: "periculosidade", motivo: `A CCT de ${cct.regiao} não tem cláusula de periculosidade cadastrada.` });
    } else {
      const base = baseDeCalculo(cct, cctAd.periculosidade.base, s, s);
      if (base === undefined) {
        naoCobertos.push({ adicional: "periculosidade", motivo: `A base de cálculo da periculosidade em ${cct.regiao} ainda não está cadastrada.` });
      } else {
        periculosidade = base * cctAd.periculosidade.percentual;
      }
    }
  }

  // C — Insalubridade.
  let insalubridade = 0;
  if (ad?.insalubridade) {
    if (!cctAd?.insalubridade) {
      naoCobertos.push({ adicional: "insalubridade", motivo: `A CCT de ${cct.regiao} não tem cláusula de insalubridade cadastrada.` });
    } else {
      const grau = cctAd.insalubridade[ad.insalubridade];
      const base = baseDeCalculo(cct, cctAd.insalubridade.base, s, s);
      if (grau === undefined) {
        naoCobertos.push({ adicional: "insalubridade", motivo: `A CCT de ${cct.regiao} não prevê insalubridade em grau ${ad.insalubridade}.` });
      } else if (base === undefined) {
        naoCobertos.push({
          adicional: "insalubridade",
          motivo: `Em ${cct.regiao} a insalubridade incide sobre o salário mínimo nacional, que ainda não está cadastrado no motor.`,
        });
      } else {
        insalubridade = base * grau;
      }
    }
  }

  // Só um dos dois entra no custo (o maior), como manda a regra da opção.
  if (periculosidade > 0 && insalubridade > 0) {
    if (periculosidade >= insalubridade) insalubridade = 0;
    else periculosidade = 0;
  }

  // D e E — Adicional noturno e hora noturna reduzida.
  let adicionalNoturno = 0;
  let horaNoturnaReduzida = 0;
  if (ad?.noturno) {
    if (!cctAd?.noturno) {
      naoCobertos.push({ adicional: "adicional noturno", motivo: `A CCT de ${cct.regiao} não tem cláusula de adicional noturno cadastrada.` });
    } else {
      const horas = ad.horasNoturnasMes ?? HORAS_NOTURNAS_POR_TURNO * diasTrabalhados(schedule, cct);
      const base = baseDeCalculo(cct, cctAd.noturno.base, s, s);
      const horaBase = base === undefined ? valorHora : base / HORAS_MES;
      adicionalNoturno = horaBase * horas * cctAd.noturno.percentual;
      // Só quando a convenção mantém a hora de 52min30s. DF e MS fixaram a hora em 60
      // minutos e compensaram subindo o percentual — lá esta linha é zero de propósito.
      if (cctAd.noturno.horaReduzida) horaNoturnaReduzida = horaBase * horas * FATOR_HORA_REDUZIDA;
    }
  }

  // F — Gratificação de função (liderança/encarregado).
  let gratificacaoFuncao = 0;
  let salarioBase = s;
  if (typeof ad?.lideraEquipeDe === "number" && ad.lideraEquipeDe > 0) {
    if (!cctAd?.lideranca) {
      naoCobertos.push({ adicional: "gratificação de liderança", motivo: `A CCT de ${cct.regiao} não tem cláusula de gratificação de liderança cadastrada.` });
    } else {
      const faixa = cctAd.lideranca.faixas.find(
        (f) => f.ateEmpregados === null || ad.lideraEquipeDe! <= f.ateEmpregados,
      );
      if (!faixa) {
        naoCobertos.push({ adicional: "gratificação de liderança", motivo: `Equipe de ${ad.lideraEquipeDe} não se encaixa em nenhuma faixa da CCT de ${cct.regiao}.` });
      } else if (typeof faixa.pisoProprio === "number") {
        // Algumas praças dão piso próprio ao líder em vez de gratificação sobre o piso da
        // função (PR, cláusula 3ª item 03; DF, Líder de Equipe). Aí o piso é substituído.
        salarioBase = Math.max(salarioBase, faixa.pisoProprio);
      } else if (typeof faixa.valor === "number") {
        gratificacaoFuncao = faixa.valor;
      } else if (typeof faixa.percentual === "number") {
        const base = baseDeCalculo(cct, cctAd.lideranca.base, s, s);
        if (base === undefined) {
          naoCobertos.push({ adicional: "gratificação de liderança", motivo: `A base de cálculo da gratificação em ${cct.regiao} ainda não está cadastrada.` });
        } else {
          gratificacaoFuncao = base * faixa.percentual;
        }
      }
    }
  }

  const modulo1: Modulo1 = {
    salarioBase: round2(salarioBase),
    periculosidade: round2(periculosidade),
    insalubridade: round2(insalubridade),
    adicionalNoturno: round2(adicionalNoturno),
    horaNoturnaReduzida: round2(horaNoturnaReduzida),
    gratificacaoFuncao: round2(gratificacaoFuncao),
    total: round2(salarioBase + periculosidade + insalubridade + adicionalNoturno + horaNoturnaReduzida + gratificacaoFuncao),
  };
  return { modulo1, naoCobertos };
}

/** Módulo 2.3 — benefícios mensais e diários, calculados pela CCT da praça. */
function computeBeneficios(
  p: PricingParams,
  ctx: ComputeContext,
): { total: number; detalhe: CostBreakdown["beneficiosDetalhe"]; naoCobertos: AdicionalNaoCoberto[] } {
  const { cct, schedule } = ctx;
  const naoCobertos: AdicionalNaoCoberto[] = [];
  // Benefício negociado acima da convenção, cadastrado na função: manda no total e a
  // composição não tenta adivinhar a repartição.
  if (typeof p.beneficios === "number") {
    return {
      total: p.beneficios,
      detalhe: { valeTransporte: 0, alimentacao: 0, cestaBasica: 0, beneficioSocial: p.beneficios },
      naoCobertos,
    };
  }
  const b = cct.beneficios;
  if (!b) {
    naoCobertos.push({ adicional: "benefícios", motivo: `A CCT de ${cct.regiao} não tem os benefícios do Módulo 2.3 cadastrados.` });
    return { total: 0, detalhe: { valeTransporte: 0, alimentacao: 0, cestaBasica: 0, beneficioSocial: 0 }, naoCobertos };
  }
  const dias = diasTrabalhados(schedule, cct);

  // Vale-transporte: custo da Shine é a passagem cheia menos o desconto legal na folha.
  // Quando o desconto supera a passagem, o custo é zero — nunca negativo.
  const passagens = b.valeTransporte.tarifa * b.valeTransporte.passagensDia * dias;
  const descontoVt = p.baseSalary * b.valeTransporte.descontoPercentual;
  const valeTransporte = Math.max(0, passagens - descontoVt);
  if (b.valeTransporte.tarifa <= 0) {
    naoCobertos.push({ adicional: "vale-transporte", motivo: `A tarifa de transporte de ${cct.regiao} não está cadastrada.` });
  }

  // Alimentação: diária × dias, ou valor mensal fechado, menos o desconto do empregado.
  const bruto = typeof b.alimentacao.valorMes === "number"
    ? b.alimentacao.valorMes
    : (b.alimentacao.valorDia ?? 0) * dias;
  const alimentacao = bruto * (1 - b.alimentacao.descontoPercentual);
  if (bruto <= 0) {
    naoCobertos.push({ adicional: "auxílio-alimentação", motivo: `O valor do auxílio-alimentação de ${cct.regiao} não está cadastrado.` });
  }

  const cestaBasica = b.cestaBasica?.valorMes ?? 0;
  const beneficioSocial = b.beneficioSocial?.valorMes ?? 0;
  const detalhe = {
    valeTransporte: round2(valeTransporte),
    alimentacao: round2(alimentacao),
    cestaBasica: round2(cestaBasica),
    beneficioSocial: round2(beneficioSocial),
  };
  return {
    total: detalhe.valeTransporte + detalhe.alimentacao + detalhe.cestaBasica + detalhe.beneficioSocial,
    detalhe,
    naoCobertos,
  };
}

/** Módulo 4.2 — intervalo intrajornada suprimido e indenizado. */
function computeIntrajornada(remuneracao: number, ctx: ComputeContext): { valor: number; naoCobertos: AdicionalNaoCoberto[] } {
  const { cct, schedule, adicionais: ad } = ctx;
  if (!ad?.intrajornadaIndenizada) return { valor: 0, naoCobertos: [] };
  const regra = cct.adicionais?.intrajornada;
  if (!regra) {
    return {
      valor: 0,
      naoCobertos: [{ adicional: "intrajornada", motivo: `A CCT de ${cct.regiao} não tem cláusula de intervalo intrajornada cadastrada.` }],
    };
  }
  // O intervalo suprimido é pago como hora normal acrescida do adicional (art. 71 §4º da
  // CLT e, no Rio, cláusula 40ª §4º). 30 min a 50% = 0,75h de pagamento por dia.
  const valorHora = remuneracao / HORAS_MES;
  const horasPorDia = (regra.intervaloMinutos / 60) * (1 + regra.adicional);
  return { valor: valorHora * horasPorDia * diasTrabalhados(schedule, cct), naoCobertos: [] };
}

export function computeCostBreakdown(p: PricingParams, ctx?: Partial<ComputeContext>): CostBreakdown & { naoCobertos: AdicionalNaoCoberto[] } {
  const context: ComputeContext = {
    cct: ctx?.cct ?? PRACA_BASE,
    schedule: ctx?.schedule ?? p.schedule,
    adicionais: ctx?.adicionais,
  };

  const { modulo1, naoCobertos: naoM1 } = computeModulo1(p, context);
  const remuneracao = modulo1.total;

  const decimoTerceiroFerias = remuneracao * RATE_13_FERIAS;
  // Encargos incidem sobre a remuneração JÁ acrescida do 13º e das férias — é o que a
  // planilha faz (2.230,24 × 35,3% = 787,27), não 35,3% do salário seco.
  const encargos = (remuneracao + decimoTerceiroFerias) * RATE_ENCARGOS;
  const provisaoRescisao = remuneracao * RATE_RESCISAO;
  const reposicaoAusencias = remuneracao * RATE_REPOSICAO;

  const ben = computeBeneficios(p, context);
  const intra = computeIntrajornada(remuneracao, context);

  const custoPuro =
    remuneracao + decimoTerceiroFerias + encargos + ben.total +
    provisaoRescisao + reposicaoAusencias + intra.valor +
    p.uniformeMes + p.equipamentosFunc + p.materialFunc;
  const bdi = custoPuro * BDI;

  return {
    salarioBase: modulo1.salarioBase,
    modulo1,
    remuneracao: round2(remuneracao),
    decimoTerceiroFerias: round2(decimoTerceiroFerias),
    encargos: round2(encargos),
    beneficios: round2(ben.total),
    beneficiosDetalhe: ben.detalhe,
    provisaoRescisao: round2(provisaoRescisao),
    reposicaoAusencias: round2(reposicaoAusencias),
    intrajornada: round2(intra.valor),
    uniforme: round2(p.uniformeMes),
    equipamentos: round2(p.equipamentosFunc),
    material: round2(p.materialFunc),
    custoPuro: round2(custoPuro),
    bdi: round2(bdi),
    precoVenda: round2(custoPuro + bdi),
    priceConfirmed: p.priceConfirmed,
    naoCobertos: [...naoM1, ...ben.naoCobertos, ...intra.naoCobertos],
  };
}

export interface PriceInput {
  serviceName: string;
  employeesCount: number;
  schedule?: ServiceSchedule;
  region?: string;
  /**
   * Cliente já fornece o uniforme, então o Módulo 5 sai do posto. É o ÚNICO item que a
   * Shayene pode abater sozinha: o uniforme é compra da Shine, não obrigação da CCT, e o
   * valor está na planilha (ASG R$ 46,97/mês; porteiro R$ 58,50).
   *
   * O vale-refeição NÃO entra aqui de propósito, por mais que o cliente ofereça refeição
   * no local: é cláusula da convenção e a Shine paga do mesmo jeito, a menos que a CCT
   * daquela praça permita a substituição. Tirar o VR por conta própria cotaria abaixo do
   * custo real e a diferença sairia da Shine. Esse pedido vai para o comercial humano.
   */
  semUniforme?: boolean;
  /**
   * Cliente quer que a Shine forneça material de limpeza e equipamento. O custo das abas
   * EQUIPAMENTOS e MATERIAL é rateado pelos postos do contrato e entra no Módulo 5.
   *
   * Só vale a partir de POSTOS_MINIMOS_MATERIAL postos. Abaixo disso o resultado vem com
   * materialSobConsulta = true e SEM material no preço.
   */
  comMaterial?: boolean;
  /** Adicionais do posto (insalubridade, periculosidade, noturno, intrajornada, liderança). */
  adicionais?: AdicionaisInput;
  /**
   * Cobertura do posto. Quando vem preenchida, `employeesCount` passa a significar
   * quantidade de POSTOS (não de pessoas) e o motor dimensiona: um posto 24h na 12x36 são
   * quatro funcionários, dois deles com adicional noturno. Ver lib/agent/dimensionamento.
   *
   * Ausente = comportamento histórico, um posto é uma pessoa.
   */
  cobertura?: Cobertura;
  // Parâmetros de precificação registrados no admin (repo function_pricing).
  // Quando fornecidos, têm prioridade sobre o lookup interno (getPricingParams).
  params?: PricingParams;
  /**
   * USO INTERNO do dimensionamento por cobertura: base do rateio de material, em
   * funcionários do contrato. Sem isto, a sub-cotação de um turno de 2 pessoas acharia que
   * o contrato tem 2 postos e o rateio sairia inflado ao dobro (ou cairia em sob consulta
   * num contrato que na verdade tem 4 pessoas).
   */
  rateioBase?: number;
}

export interface PriceResult {
  serviceName: string;
  schedule: ServiceSchedule;
  postsPerEmployee: number;
  unitCost: number;
  unitSalePrice: number;
  totalSalePrice: number;
  costBreakdown: CostBreakdown;
  /** true quando o valor NÃO deve ser apresentado como final — mostrar "sob consulta". */
  sobConsulta: boolean;
  priceConfirmed: boolean;
  /** Praça identificada na região informada (default: Rio de Janeiro). */
  regiao: string;
  /** true quando a CCT daquela praça está cadastrada e conferida, e o motor pôde cotar. */
  cctCadastrada: boolean;
  /** Sindicato e vigência da convenção usada — vai para a planilha e para a proposta. */
  cct: { uf: string; sindicato: string; vigencia: string; documento: string };
  /** Cláusulas de adicional da praça, com a fonte de cada uma (para a planilha). */
  cctAdicionais?: AdicionaisCCT;
  /** Cláusulas de benefício da praça, com a fonte de cada uma (para a planilha). */
  cctBeneficios?: BeneficiosCCT;
  /** Dias trabalhados no mês na escala cotada — base do VT e do auxílio-refeição. */
  diasTrabalhadosMes: number;
  /** true quando o piso veio da regra de fallback da CCT, não de uma linha nominal. */
  pisoPorFallback: boolean;
  /** De onde saiu o piso, para conferência. */
  fontePiso: string;
  /** Adicionais pedidos que a CCT da praça não sabe calcular. Qualquer item aqui = sob consulta. */
  adicionaisNaoCobertos: AdicionalNaoCoberto[];
  /** true quando material e equipamento entraram no preço, rateados pelos postos. */
  comMaterial: boolean;
  /** Cliente pediu material mas o contrato é pequeno demais para o rateio. */
  materialSobConsulta: boolean;
  /** Rateio de material + equipamento embutido em cada posto (0 quando não entrou). */
  rateioMaterialPorPosto: number;
  /** Cobertura dimensionada, quando o posto não é uma pessoa só. */
  cobertura?: Cobertura;
  /** Funcionários que compõem UM posto (1 sem cobertura; 4 num posto 24h). */
  funcionariosPorPosto: number;
  /** Funcionários do contrato inteiro: postos × funcionariosPorPosto. */
  funcionariosTotais: number;
  /**
   * Composição de cada turno do posto, quando há cobertura. A planilha de conferência sai
   * com uma aba por turno: é na aba noturna que aparecem as linhas D (adicional noturno) e
   * E (hora noturna reduzida), e uma aba só com os quatro misturados seria inconferível
   * contra a CCT.
   */
  turnos?: TurnoPrecificado[];
  /** Cobertura pedida numa escala que a tabela não dimensiona: quem resolve é humano. */
  coberturaNaoDimensionavel: boolean;
}

export interface TurnoPrecificado {
  rotulo: string;
  funcionarios: number;
  noturno: boolean;
  /** Preço de venda de UM funcionário deste turno. */
  unitSalePrice: number;
  /** Preço de venda do turno inteiro dentro de um posto. */
  totalSalePrice: number;
  costBreakdown: CostBreakdown;
}

/**
 * Preço de um posto, dimensionando a cobertura quando houver.
 *
 * Com `cobertura`, a composição roda UMA VEZ POR TURNO — a noturna com adicional noturno
 * por cima do que o cliente informou — e `unitSalePrice` passa a ser o preço do posto
 * inteiro (os quatro funcionários de um posto 24h, por exemplo). A margem não se perde no
 * caminho: o BDI é multiplicativo sobre o custo, então somar o preço de venda dos turnos dá
 * exatamente o mesmo que aplicar 2% + 8% + tributos sobre a soma dos custos — inclusive
 * sobre o adicional noturno e a hora reduzida dos dois funcionários da noite.
 */
export function calcularPreco(input: PriceInput): PriceResult {
  if (!input.cobertura) return calcularPostoSimples(input);

  const dim = dimensionar(input.cobertura);
  const base = calcularPostoSimples({ ...input, cobertura: undefined });
  if (!coberturaDimensionavel(base.schedule)) {
    // Posto 24h em três turnos de 8h existe, mas o Eduardo validou só a 12x36. Devolver um
    // número aqui seria dimensionamento inventado — que é o erro que este módulo corrige.
    return { ...base, cobertura: input.cobertura, coberturaNaoDimensionavel: true, sobConsulta: true, priceConfirmed: false };
  }

  const postos = input.employeesCount;
  const funcionariosTotais = postos * dim.funcionariosPorPosto;

  // Uma cotação por turno. O adicional noturno do turno da noite SOMA ao que o cliente
  // informou, não substitui: posto 24h em hospital é insalubre de dia e de noite.
  const cotacoes = dim.turnos.map((t) =>
    calcularPostoSimples({
      ...input,
      cobertura: undefined,
      employeesCount: t.funcionariosPorPosto,
      adicionais: t.noturno ? { ...input.adicionais, noturno: true } : input.adicionais,
      rateioBase: funcionariosTotais,
    }),
  );

  const turnos: TurnoPrecificado[] = dim.turnos.map((t, i) => ({
    rotulo: t.rotulo,
    funcionarios: t.funcionariosPorPosto,
    noturno: t.noturno,
    unitSalePrice: cotacoes[i].unitSalePrice,
    totalSalePrice: cotacoes[i].totalSalePrice,
    costBreakdown: cotacoes[i].costBreakdown,
  }));

  const unitSalePrice = round2(turnos.reduce((s, t) => s + t.totalSalePrice, 0));
  // Um turno que a CCT não sabe calcular contamina o posto inteiro: nada aqui é cotado
  // ignorando adicional, senão o preço sai abaixo do custo.
  const naoCobertos = cotacoes.flatMap((c) => c.adicionaisNaoCobertos);
  const priceConfirmed = cotacoes.every((c) => c.priceConfirmed);

  return {
    ...cotacoes[0],
    unitCost: round2(cotacoes.reduce((s, c) => s + c.unitCost * c.funcionariosTotais, 0)),
    unitSalePrice,
    totalSalePrice: round2(unitSalePrice * postos),
    // Composição do POSTO inteiro (os funcionários de um posto somados), não de uma pessoa.
    costBreakdown: turnos
      .map((t) => multiplicarBreakdown(t.costBreakdown, t.funcionarios))
      .reduce(somarBreakdowns),
    adicionaisNaoCobertos: naoCobertos,
    priceConfirmed,
    sobConsulta: !priceConfirmed,
    rateioMaterialPorPosto: round2(
      turnos.reduce((s, t) => s + (t.costBreakdown.equipamentos + t.costBreakdown.material) * t.funcionarios, 0),
    ),
    cobertura: input.cobertura,
    funcionariosPorPosto: dim.funcionariosPorPosto,
    funcionariosTotais,
    turnos,
    coberturaNaoDimensionavel: false,
  };
}

const CHAVES_BREAKDOWN = [
  "salarioBase", "remuneracao", "decimoTerceiroFerias", "encargos", "beneficios",
  "provisaoRescisao", "reposicaoAusencias", "intrajornada", "uniforme", "equipamentos",
  "material", "custoPuro", "bdi", "precoVenda",
] as const;

function multiplicarBreakdown(b: CostBreakdown, n: number): CostBreakdown {
  const out = { ...b, modulo1: { ...b.modulo1 }, beneficiosDetalhe: { ...b.beneficiosDetalhe } };
  for (const k of CHAVES_BREAKDOWN) out[k] = round2(b[k] * n);
  for (const k of Object.keys(out.modulo1) as Array<keyof Modulo1>) out.modulo1[k] = round2(b.modulo1[k] * n);
  for (const k of Object.keys(out.beneficiosDetalhe) as Array<keyof CostBreakdown["beneficiosDetalhe"]>) {
    out.beneficiosDetalhe[k] = round2(b.beneficiosDetalhe[k] * n);
  }
  return out;
}

function somarBreakdowns(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  const out = { ...a, modulo1: { ...a.modulo1 }, beneficiosDetalhe: { ...a.beneficiosDetalhe } };
  for (const k of CHAVES_BREAKDOWN) out[k] = round2(a[k] + b[k]);
  for (const k of Object.keys(out.modulo1) as Array<keyof Modulo1>) out.modulo1[k] = round2(a.modulo1[k] + b.modulo1[k]);
  for (const k of Object.keys(out.beneficiosDetalhe) as Array<keyof CostBreakdown["beneficiosDetalhe"]>) {
    out.beneficiosDetalhe[k] = round2(a.beneficiosDetalhe[k] + b.beneficiosDetalhe[k]);
  }
  out.priceConfirmed = a.priceConfirmed && b.priceConfirmed;
  return out;
}

function calcularPostoSimples(input: PriceInput): PriceResult {
  const service = SEED_SERVICES.find(
    (s) => s.name.toLowerCase() === input.serviceName.toLowerCase(),
  );
  const params = input.params ?? getPricingParams(input.serviceName);
  const schedule =
    input.schedule ?? service?.schedule ?? (params?.schedule as ServiceSchedule | undefined) ?? "5x2_44h";
  const posts = SCHEDULE_POSTS[schedule] ?? 1;

  const resolvedParams: PricingParams = params ?? {
    functionName: service?.name ?? input.serviceName,
    baseSalary: 0,
    schedule,
    uniformeMes: 46.97,
    equipamentosFunc: 0,
    materialFunc: 0,
    priceConfirmed: false,
  };

  // Praça do serviço. O piso, os benefícios, os adicionais e o uniforme são os da CCT
  // dali; praça com convenção não conferida sai sob consulta (ver cctCadastrada).
  const praca = resolverPraca(input.region);
  const grupo = FUNCTION_CATALOG.find((f) => f.name === resolvedParams.functionName)?.group;
  const piso = resolverPiso(praca, resolvedParams.functionName, grupo);
  const uniformeLocal = praca.uniformes?.[resolvedParams.functionName];

  const paramsRegionais: PricingParams = {
    ...resolvedParams,
    ...(piso ? { baseSalary: piso.valor } : {}),
    ...(typeof uniformeLocal === "number" ? { uniformeMes: uniformeLocal } : {}),
  };
  // Cliente fornece o uniforme: zera o Módulo 5. O BDI incide sobre o custo já sem ele,
  // então o abatimento no preço final é maior que os R$ 46,97 do custo — é assim mesmo.
  const paramsSemUniforme: PricingParams = input.semUniforme
    ? { ...paramsRegionais, uniformeMes: 0 }
    : paramsRegionais;

  // Material e equipamento: rateio do custo do contrato pelos FUNCIONÁRIOS contratados.
  // Sem cobertura os dois números são o mesmo (um posto é uma pessoa), e o corte de
  // POSTOS_MINIMOS_MATERIAL segue calibrado como sempre foi. Com cobertura, o rateioBase
  // chega de fora: a sub-cotação de um turno de 2 pessoas não pode achar que o contrato
  // inteiro tem 2 postos.
  const postosContrato = input.rateioBase ?? input.employeesCount;
  const materialCotavel = input.comMaterial === true && postosContrato >= POSTOS_MINIMOS_MATERIAL;
  const paramsFinais: PricingParams = materialCotavel
    ? {
        ...paramsSemUniforme,
        equipamentosFunc: round2(EQUIPAMENTOS_MENSAL_CONTRATO / postosContrato),
        materialFunc: round2(MATERIAL_MENSAL_CONTRATO / postosContrato),
      }
    : paramsSemUniforme;

  const { naoCobertos, ...breakdown } = computeCostBreakdown(paramsFinais, {
    cct: praca,
    schedule,
    adicionais: input.adicionais,
  });
  const unitSalePrice = round2(breakdown.precoVenda * posts);
  const unitCost = round2(breakdown.custoPuro * posts);
  const totalSalePrice = round2(unitSalePrice * input.employeesCount);

  // Veto do admin. A tela Comercial → Preços por função pode bloquear uma função
  // desmarcando "preço confirmado", e isso continua valendo mesmo com a CCT cadastrada.
  //
  // Só conta como veto quando a linha tem piso próprio cadastrado: linha com salário 0 é
  // resquício da migration 011, que zerou o catálogo inteiro quando não havia CCT
  // nenhuma. Tratar aquilo como veto travaria todas as funções em produção até alguém
  // rodar a migration 015 — e migration pendente já segurou coisa demais aqui.
  const vetadaNoAdmin =
    input.params !== undefined && input.params.baseSalary > 0 && input.params.priceConfirmed === false;

  // Para o preço ser final, tudo isto precisa valer: piso de verdade na convenção, praça
  // conferida, nenhum adicional pedido que a CCT não saiba calcular, e sem veto do admin.
  const priceConfirmed =
    !vetadaNoAdmin &&
    paramsFinais.baseSalary > 0 &&
    praca.cadastrada &&
    naoCobertos.length === 0;

  return {
    serviceName: service?.name ?? input.serviceName,
    schedule,
    postsPerEmployee: posts,
    unitCost,
    unitSalePrice,
    totalSalePrice,
    costBreakdown: breakdown,
    priceConfirmed,
    sobConsulta: !priceConfirmed,
    regiao: praca.regiao,
    cctCadastrada: praca.cadastrada,
    cct: { uf: praca.uf, sindicato: praca.sindicato, vigencia: praca.vigencia, documento: praca.documento },
    cctAdicionais: praca.adicionais,
    cctBeneficios: praca.beneficios,
    diasTrabalhadosMes: diasTrabalhados(schedule, praca),
    pisoPorFallback: piso?.porFallback ?? false,
    fontePiso: piso?.fonte ?? "Sem piso na convenção da praça",
    adicionaisNaoCobertos: naoCobertos,
    comMaterial: materialCotavel,
    materialSobConsulta: input.comMaterial === true && !materialCotavel,
    rateioMaterialPorPosto: round2(breakdown.equipamentos + breakdown.material),
    // Sem cobertura, um posto é uma pessoa — é o que o sistema sempre assumiu.
    funcionariosPorPosto: 1,
    funcionariosTotais: input.employeesCount,
    coberturaNaoDimensionavel: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
