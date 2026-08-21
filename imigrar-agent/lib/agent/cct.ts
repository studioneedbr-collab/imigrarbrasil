/**
 * CONVENÇÕES COLETIVAS DE TRABALHO — dados por praça.
 *
 * Fonte: SHAIENE-CTTs-2026.zip, enviado pelo Pedro Provadelli em 13/08/2026.
 *
 * Este arquivo é a "planilha modelo" que o Eduardo pediu em 13/08/2026: em vez de a
 * Shayene inventar preço, ela lê a CCT da praça daqui e preenche as células da composição
 * de custos (lib/agent/pricing.ts → lib/planilha/composicao.ts). Cada valor traz a
 * cláusula de origem em `fonte`, para o Pedro e o Eduardo conferirem sem reabrir o PDF.
 *
 * REGRA QUE NÃO MUDA: praça com `cadastrada: false` NÃO é cotada. Os dados abaixo já
 * estão lidos das convenções, mas só o Rio passou por conferência humana — as outras oito
 * ficam travadas até o Pedro validar. Foi assim que, em 10/08/2026, um piso de portaria
 * chutado (R$ 1.998,00) chegou a um cliente; o piso real do Rio é R$ 2.051,95.
 */

/**
 * Monta o reconhecedor de praça a partir da lista de cidades e siglas.
 *
 * NÃO use `\b` aqui. Em JavaScript o `\b` só enxerga [A-Za-z0-9_], então uma alternativa
 * terminada em vogal acentuada nunca fecha: `/\b(paraná)\b/` não casa com "Paraná", porque
 * depois do "á" (que não é caractere de palavra) não existe fronteira. Era esse o motivo
 * de "Paraná" cair no default do Rio — e receber preço carioca — enquanto "Curitiba"
 * resolvia certo. Os lookarounds abaixo tratam as acentuadas como letra.
 */
const LETRA = "0-9A-Za-zÀ-ÖØ-öø-ÿ_";
function termos(alternativas: string): RegExp {
  return new RegExp(`(?<![${LETRA}])(?:${alternativas})(?![${LETRA}])`, "i");
}

/** Sobre o que o adicional incide. A CCT define — não é escolha nossa. */
export type BaseCalculo =
  /** Salário base da própria função. */
  | "salario_base"
  /** Piso da categoria de servente na praça (RJ cláusula 18ª, por exemplo). */
  | "piso_servente"
  /** Salário mínimo nacional (DF cláusula 13ª, SC agente de dedetização). */
  | "salario_minimo"
  /** Módulo 1 completo: salário base + adicionais já somados. */
  | "remuneracao";

export interface AdicionalNoturno {
  /** Percentual sobre a hora normal. CLT usa 20%; algumas CCTs sobem em troca da hora de 60min. */
  percentual: number;
  /**
   * true = hora noturna de 52min30s (art. 73 §1º CLT), o que gera horas extras fictícias
   * e entra na linha E do Módulo 1. false = a CCT fixou a hora em 60 minutos e compensou
   * subindo o percentual (é o caso do DF e do MS).
   */
  horaReduzida: boolean;
  base: BaseCalculo;
  fonte: string;
}

export interface AdicionalInsalubridade {
  /** Grau mínimo, quando a CCT prevê (o DF tem 10% para cozinha). */
  minimo?: number;
  medio: number;
  maximo: number;
  base: BaseCalculo;
  fonte: string;
}

export interface AdicionalPericulosidade {
  percentual: number;
  base: BaseCalculo;
  fonte: string;
}

export interface AdicionalIntrajornada {
  /** Minutos de intervalo suprimidos e indenizados por dia trabalhado. */
  intervaloMinutos: number;
  /** Acréscimo sobre a hora normal na indenização (art. 71 §4º CLT: 50%). */
  adicional: number;
  fonte: string;
}

/** Faixa de gratificação de liderança/encarregado, por tamanho da equipe. */
export interface FaixaLideranca {
  /** Teto de empregados sob responsabilidade. null = sem teto (a última faixa). */
  ateEmpregados: number | null;
  /** Percentual sobre `base`. Use um OU outro, nunca os dois. */
  percentual?: number;
  /** Valor fixo em R$/mês, quando a CCT fixa em reais em vez de percentual. */
  valor?: number;
  /** Piso próprio da função de liderança, quando a CCT dá piso em vez de gratificação. */
  pisoProprio?: number;
}

export interface AdicionalLideranca {
  faixas: FaixaLideranca[];
  base: BaseCalculo;
  fonte: string;
}

export interface AdicionaisCCT {
  noturno?: AdicionalNoturno;
  insalubridade?: AdicionalInsalubridade;
  periculosidade?: AdicionalPericulosidade;
  intrajornada?: AdicionalIntrajornada;
  lideranca?: AdicionalLideranca;
}

/**
 * Módulo 2.3 da composição (Benefícios Mensais e Diários).
 *
 * Vale-transporte e alimentação são calculados, não digitados: a CCT dá a tarifa/valor
 * diário e o percentual de desconto do empregado, e o custo da Shine é o líquido. Foi
 * assim que a planilha 2026 chegou aos R$ 108,89 de VT e R$ 534,60 de VR do Rio.
 */
export interface BeneficiosCCT {
  valeTransporte: {
    /** Tarifa unitária da passagem, em R$. */
    tarifa: number;
    /** Passagens por dia trabalhado (ida e volta = 2). */
    passagensDia: number;
    /** Desconto legal na folha do empregado, sobre o salário base (CLT: até 6%). */
    descontoPercentual: number;
    fonte: string;
  };
  alimentacao: {
    /** Valor por dia efetivamente trabalhado. Use este OU `valorMes`. */
    valorDia?: number;
    /** Valor fechado por mês, quando a CCT fixa mensal em vez de diário. */
    valorMes?: number;
    /** Desconto do empregado sobre o total concedido no mês. */
    descontoPercentual: number;
    fonte: string;
  };
  /** Cartão cesta básica, quando a CCT obriga (MG, SP). Custo cheio da empresa. */
  cestaBasica?: { valorMes: number; fonte: string };
  /** Benefício Social Familiar — custeio mensal por trabalhador, pago pela empresa. */
  beneficioSocial?: { valorMes: number; fonte: string };
  /** Dias trabalhados/mês usados no rateio de VT e alimentação na escala 5x2. */
  diasUteisMes: number;
}

/**
 * Regra de piso para função que a CCT não lista nominalmente.
 *
 * O Rio resolve isso na cláusula 7ª: liderança e função técnica pegam o piso do
 * encarregado; o resto pega o piso de servente. Sem isso, metade do catálogo cairia em
 * "sob consulta" mesmo com a convenção na mão.
 */
export interface FallbackPiso {
  /** Piso para função sem qualificação técnica e sem liderança. */
  naoTecnica: number;
  /** Piso para função técnica ou de liderança não listada. */
  tecnicaOuLideranca: number;
  fonte: string;
}

export interface CCT {
  /** Sigla da UF, ou rótulo da praça quando a convenção é municipal. */
  uf: string;
  /** Nome que a Shayene usa ao falar da praça com o cliente. */
  regiao: string;
  /** Sindicatos convenentes. */
  sindicato: string;
  /** Registro no MTE, quando o documento traz. */
  registroMte?: string;
  /** Vigência da convenção, como está no documento. */
  vigencia: string;
  /** Arquivo de origem dentro de SHAIENE-CTTs-2026.zip. */
  documento: string;
  /**
   * false = dados lidos da convenção mas ainda NÃO conferidos por gente. O motor não cota
   * a praça: devolve sob consulta e o comercial humano fecha o valor.
   */
  cadastrada: boolean;
  /** Piso mensal por função, como a convenção nomeia. */
  pisos: Record<string, number>;
  /** Piso de quem não está na tabela. Ausente = função não listada vira sob consulta. */
  fallback?: FallbackPiso;
  /** Uniforme mensal por função quando difere do padrão (Módulo 5). */
  uniformes?: Record<string, number>;
  beneficios?: BeneficiosCCT;
  adicionais?: AdicionaisCCT;
  /** Cidades e siglas que identificam a praça no texto que o cliente escreveu. */
  re: RegExp;
  /** O que ainda falta conferir antes de virar `cadastrada: true`. */
  pendencias?: string[];
}

// ─────────────────────────────── RIO DE JANEIRO ───────────────────────────────
// Única praça conferida. É a praça da planilha de composição Shine Rio 2026 e a CCT
// 2026/2027 confirma os três números que a planilha já usava: piso 1.851,90 (cláusula 3ª),
// auxílio-alimentação R$ 27,00/dia (cláusula 21ª) e Benefício Social R$ 22,70 (cláusula 27ª).

const RJ_SERVENTE = 1851.9;
const RJ_ENCARREGADO = 2312.75;

const RIO_DE_JANEIRO: CCT = {
  uf: "RJ",
  regiao: "Rio de Janeiro",
  sindicato: "SEAC-RJ x SIEMACO-RJ (Sind. Emp. Asseio e Cons. do Est. do RJ x Sind. Empregados de Empresas de Asseio e Conservação)",
  registroMte: "RJ000911/2026",
  vigencia: "01/03/2026 a 28/02/2027",
  documento: "RIO DE JANEIRO/CCT-SIEMACO-RJ/CCT SIEMACO-RJ - 2026-2027.pdf",
  cadastrada: true,
  // Cláusula 3ª, parágrafo primeiro. Nomes casados com o FUNCTION_CATALOG.
  pisos: {
    // Limpeza e conservação
    "Auxiliar de Serviços Gerais": RJ_SERVENTE,
    Servente: RJ_SERVENTE,
    Faxineira: RJ_SERVENTE,
    "Auxiliar de Limpeza": RJ_SERVENTE,
    Limpador: RJ_SERVENTE,
    "Limpador de Vidro": RJ_SERVENTE,
    "Limpador de Caixa d'Água": RJ_SERVENTE,
    "Limpador de Fachada com Rapel": 2359.48,
    "Alpinista Predial": 2965.75,
    "Alpinista Industrial": 3309.62,
    "Operador de Máquina de Limpeza Tripulada": 2163.18,
    "Enfermeira Supervisora de Higienização": 4727.39,
    "Auxiliar de Dedetização": RJ_SERVENTE,
    "Dedetizador sem Moto": 2111.61,
    "Dedetizador com Moto": 2201.94,

    // Portaria, vigia e controle de acesso — a CCT trata numa linha só:
    // "PORTEIRO/VIGIA TERCEIRIZADO/ZELADOR R$ 2.051,95".
    Porteiro: 2051.95,
    "Auxiliar de Portaria": 1863.13,
    "Porteiro/Vigia Terceirizado/Zelador": 2051.95,
    Vigia: 2051.95,
    "Vigia Terceirizado com Moto": 2051.95,
    "Controlador de Acesso": 2051.95,
    "Operador de CFTV": RJ_SERVENTE,
    "Operador Central de Controle Operacional": RJ_SERVENTE,

    // Recepção e administrativo
    Recepcionista: 1966.52,
    "Recepcionista Pleno (Bilíngue)": 3165.7,
    "Recepcionista Senior (Trilíngue)": 3819.4,
    "Auxiliar de Escritório": 2271.96,
    "Agente Administrativo": 2286.41,
    "Assistente Administrativo": 2158.74,
    "Assistente Administrativo Pleno": 2502.4,
    "Assistente Administrativo Senior": 2859.4,
    Digitador: 2286.41,
    "Escriturário Datilógrafo": 2650.33,
    "Técnico em Secretariado": 2407.7,
    "Tramitador de Documentos": RJ_SERVENTE,
    "Operador de Copiadora": RJ_SERVENTE,
    "Operador de Serviço de Atendimento ao Usuário": RJ_SERVENTE,
    Contínuo: RJ_SERVENTE,
    Mensageiro: RJ_SERVENTE,
    Arrecadador: RJ_SERVENTE,
    Almoxarife: 2638.33,
    "Auxiliar de Almoxarife": 1966.52,

    // Manutenção predial e jardinagem
    Zelador: 2051.95,
    "Auxiliar de Manutenção": RJ_SERVENTE,
    Jardineiro: 3035.56,
    "Auxiliar de Jardinagem": 1966.52,
    "Operador de Roçadeira": 1966.52,
    "Operador de Microtrator": 1966.52,
    "Operador de Moto Serra": 1966.52,

    // Logística e armazém
    "Ajudante de Armazém": RJ_SERVENTE,
    "Auxiliar de Embalagem": RJ_SERVENTE,
    "Operador de Empilhadeira": 2398.24,
    Remanejador: RJ_SERVENTE,
    Montador: RJ_SERVENTE,
    Triciclista: 1881.04,
    Manobrista: 1966.52,
    "Auxiliar de Produção": 1966.52,

    // Cozinha
    "Auxiliar de Cozinha": RJ_SERVENTE,
    Cozinheira: 2516.28,
    "Chefe de Cozinha": 2745.0,
    Copeira: RJ_SERVENTE,
    Garçom: 2638.33,

    // Saúde e educacional
    Maqueiro: RJ_SERVENTE,
    "Apoio Escolar": RJ_SERVENTE,

    // Supervisão e liderança
    Encarregado: RJ_ENCARREGADO,
    Supervisor: 4727.39,
    "Inspetor de Serviços": 2747.7,
    "Chefe de Departamento ou Seção": 3789.43,
  },
  // Cláusula 7ª e seu parágrafo único: a própria convenção diz onde encaixar quem não
  // está na tabela. Sem isso, "Operador de Piscina" cairia em sob consulta mesmo com a
  // CCT aberta na mesa.
  fallback: {
    naoTecnica: RJ_SERVENTE,
    tecnicaOuLideranca: RJ_ENCARREGADO,
    fonte: "Cláusula 7ª e parágrafo único — demais funções técnicas e de liderança recebem o piso do encarregado; as sem liderança e sem qualificação técnica, o piso de servente",
  },
  // Aba UNIFORME da planilha Shine Rio 2026 — a CCT não fixa valor, quem compra é a Shine.
  uniformes: { "Auxiliar de Serviços Gerais": 46.97, Porteiro: 58.5 },
  beneficios: {
    // Tarifa e passagens saem da planilha (Módulo 2.3-A); o desconto de 6% é a cláusula 22ª.
    valeTransporte: {
      tarifa: 5.0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "Cláusula 22ª, parágrafo primeiro — desconto de 6% sobre o salário base; tarifa e passagens conforme aba SERVENTE da planilha Shine Rio 2026",
    },
    alimentacao: {
      valorDia: 27.0,
      descontoPercentual: 0.1,
      fonte: "Cláusula 21ª — ticket de R$ 27,00 por dia efetivamente trabalhado, desconto de 10% do total concedido (parágrafo segundo)",
    },
    beneficioSocial: {
      valorMes: 22.7,
      fonte: "Cláusula 27ª, parágrafo segundo — custeio mensal de R$ 22,70 por trabalhador, pago pela empresa",
    },
    // 22 dias é o que a planilha 2026 usa (Módulo 2.3, células G57 e G59). A CCT cita
    // "média de 23 dias úteis" só para demonstrar o reajuste do auxílio, não para o cálculo.
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.2,
      horaReduzida: true,
      base: "salario_base",
      fonte: "Cláusula 17ª — 20% sobre o salário base entre 22h e 5h; hora noturna de 52min30s (parágrafo primeiro)",
    },
    insalubridade: {
      medio: 0.2,
      maximo: 0.4,
      base: "piso_servente",
      fonte: "Cláusula 18ª — 20% grau médio (hospitais, casas de saúde, ambulatórios) e 40% grau máximo (lixeiras de prédios, dedetização, banheiro público de grande circulação), calculados sobre o piso da categoria de servente",
    },
    periculosidade: {
      percentual: 0.3,
      base: "salario_base",
      fonte: "Cláusula 19ª — adicional de periculosidade na forma da lei (30%, art. 193 CLT). Não acumula com insalubridade (cláusula 18ª, parágrafo sétimo)",
    },
    intrajornada: {
      intervaloMinutos: 30,
      adicional: 0.5,
      fonte: "Cláusula 40ª, parágrafo quarto — indenização do intervalo intrajornada a 50% sobre a hora normal; intervalo de 30 minutos na escala 12x36",
    },
    lideranca: {
      faixas: [
        { ateEmpregados: 15, percentual: 0.15 },
        { ateEmpregados: 30, percentual: 0.25 },
        { ateEmpregados: 60, percentual: 0.3 },
        { ateEmpregados: null, percentual: 0.4 },
      ],
      base: "piso_servente",
      fonte: "Cláusula 14ª (líder de turma, até 15 empregados: 15%) e cláusula 13ª (encarregado: 25% de 16 a 30, 30% de 31 a 60, 40% acima de 61), sobre o piso de servente",
    },
  },
  re: termos("rio de janeiro|niter[óo]i|barra da tijuca|botafogo|copacabana|ipanema|tijuca|jacarepagu[áa]|duque de caxias|nova igua[çc]u|s(?:ã|a)o gon[çc]alo|petr[óo]polis|campos dos goytacazes|volta redonda|maca[ée]|rj"),
};

// ──────────────────────────────── SÃO PAULO ────────────────────────────────
// Tabela do SEAC-SP x SIEMACO-SP vigente em 01/01/2026. A tabela é de pisos e benefícios;
// as cláusulas de adicionais estão no corpo da CCT, que NÃO veio no zip — só o comunicado
// conjunto e a tabela de salários. Por isso os adicionais ficam vazios aqui.

const SAO_PAULO: CCT = {
  uf: "SP",
  regiao: "São Paulo",
  sindicato: "SEAC-SP x SIEMACO-SP",
  vigencia: "a partir de 01/01/2026",
  documento: "SÃO PAULO/CCT-SIEMACO-SP/Tabela-de-Salarios-2026.pdf",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1837.4,
    Servente: 1837.4,
    Faxineira: 1837.4,
    "Auxiliar de Limpeza": 1837.4,
    Limpador: 1837.4,
    Copeira: 1850.07,
    "Limpador de Vidro": 2014.1,
    Recepcionista: 1995.25,
    Porteiro: 2162.6,
    "Controlador de Acesso": 2162.6,
    Zelador: 2351.12,
    "Auxiliar de Manutenção": 1890.24,
    "Operador de Empilhadeira": 2627.83,
    Encarregado: 2404.68,
  },
  fallback: {
    naoTecnica: 1837.4,
    tecnicaOuLideranca: 1890.24,
    fonte: "Tabela SEAC-SP/SIEMACO-SP — 'PISO SALARIAL MÍNIMO' R$ 1.837,40 e 'DEMAIS FUNÇÕES' R$ 1.890,24",
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "PENDENTE — cláusula de vale-transporte não veio no zip; tarifa de São Paulo a confirmar",
    },
    alimentacao: {
      valorDia: 21.8,
      descontoPercentual: 0,
      fonte: "Tabela de benefícios — tíquete refeição (VR) R$ 21,80 com desconto fixo de R$ 1,46 por dia",
    },
    cestaBasica: { valorMes: 151.91, fonte: "Tabela de benefícios — Cesta Básica I" },
    beneficioSocial: { valorMes: 16.75, fonte: "Tabela de benefícios — Benefício Social Sindical (BSS)" },
    diasUteisMes: 22,
  },
  re: termos("s(?:ã|a)o paulo|sampa|campinas|santos|guarulhos|osasco|santo andr[ée]|s(?:ã|a)o bernardo|s(?:ã|a)o caetano|diadema|barueri|alphaville|ribeir(?:ã|a)o preto|sorocaba|jundia[íi]|sp"),
  pendencias: [
    "O corpo da CCT não veio no zip — só o comunicado conjunto e a tabela de salários. Faltam as cláusulas de adicional noturno, insalubridade, periculosidade e intrajornada.",
    "Desconto do VR: a tabela diz R$ 1,46 por dia, não um percentual. Conferir se é por dia trabalhado.",
    "Tarifa de vale-transporte de São Paulo não consta na tabela.",
    "PPR de R$ 356,39/ano (2 parcelas) não foi lançado — decidir se entra no custo do posto.",
    "A tabela não nomeia 'servente'/'ASG': foram encaixados no PISO SALARIAL MÍNIMO. Confirmar com o Pedro.",
  ],
};

// ────────────────────────────── MINAS GERAIS ──────────────────────────────
// Três convenções no zip (SINDEAC-SEAC, SINDI-ASSEIO RMBH e Uberlândia) com a MESMA
// tabela de pisos. O que muda entre elas é o auxílio-alimentação.

const MINAS_GERAIS: CCT = {
  uf: "MG",
  regiao: "Minas Gerais",
  sindicato: "SINDEAC x SEAC-MG (e SINDI-ASSEIO RMBH / Uberlândia, mesma tabela de pisos)",
  vigencia: "2026",
  documento: "MINAS GERAIS/CCT-2026-SINDEAC-e-SEAC.pdf",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1772.8,
    Servente: 1772.8,
    Faxineira: 1772.8,
    "Auxiliar de Limpeza": 1772.8,
    "Limpador de Caixa d'Água": 1772.8,
    "Limpador de Vidro": 1941.39,
    "Operador de Piscina": 1772.8,
    "Guardião de Piscina": 1772.8,
    Porteiro: 2294.91,
    Recepcionista: 3043.29,
    Jardineiro: 2468.38,
    Zelador: 2648.04,
    Encarregado: 2648.04,
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "PENDENTE — tarifa a confirmar",
    },
    alimentacao: {
      valorDia: 31.34,
      descontoPercentual: 0,
      fonte: "Cláusula 13ª (SINDEAC) — Ticket Alimentação/Refeição de R$ 31,34 por dia efetivamente trabalhado a partir de 01/01/2026",
    },
    cestaBasica: { valorMes: 200.0, fonte: "Cláusula 14ª — cartão cesta básica de R$ 200,00/mês" },
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.39,
      horaReduzida: false,
      base: "salario_base",
      fonte: "Cláusula 10ª — adicional noturno de 39% sobre a hora normal (a CCT já embute a hora reduzida no percentual)",
    },
    intrajornada: {
      intervaloMinutos: 30,
      adicional: 0.5,
      fonte: "Parágrafo quarto — indenização do intervalo intrajornada a 50% sobre a hora normal",
    },
  },
  re: termos("minas gerais|minas|belo horizonte|contagem|betim|uberl[âa]ndia|uberaba|juiz de fora|montes claros|mg"),
  pendencias: [
    "Três convenções no zip com a mesma tabela de pisos mas auxílio-alimentação diferente (SINDEAC R$ 31,34/dia; Uberlândia R$ 416,87/mês). Definir qual vale por cidade antes de cotar.",
    "Adicional noturno de 39% é atípico — a CCT diz que já compensa a hora reduzida. Confirmar com o DP.",
    "Insalubridade: a CCT trata só do caso de banheiros públicos e coletivos. Percentual e base a extrair.",
    "Periculosidade e gratificação de liderança não foram localizadas no texto.",
    "Tarifa de vale-transporte não consta.",
  ],
};

// ──────────────────────────────── BRASÍLIA / DF ────────────────────────────────

const BRASILIA: CCT = {
  uf: "DF",
  regiao: "Brasília / Distrito Federal",
  sindicato: "SINDISERVIÇOS-DF x SEAC-DF",
  vigencia: "2025/2026",
  documento: "BRASÍLIA/CCT_2025-2026_SINDISERVICOS_X_SEAC.pdf",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1743.69,
    Servente: 1743.69,
    "Auxiliar de Limpeza": 1743.69,
    "Auxiliar de Jardinagem": 1743.69,
    "Operador de Piscina": 1743.69,
    "Guardião de Piscina": 1743.69,
    Jardineiro: 2574.37,
    Recepcionista: 2574.37,
    Zelador: 1900.2,
    Encarregado: 3383.5,
    Supervisor: 4220.33,
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "Cláusula de vale-transporte — desconto de 6% sobre o salário base. Tarifa a confirmar",
    },
    alimentacao: {
      descontoPercentual: 0,
      fonte: "PENDENTE — cláusula 17ª (auxílio alimentação) não trouxe valor no texto extraído",
    },
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.225,
      horaReduzida: false,
      base: "salario_base",
      fonte: "Adicional noturno de 22,5% sobre a hora trabalhada, com a hora fixada em 60 minutos (a CCT troca a hora reduzida pelo percentual maior)",
    },
    insalubridade: {
      medio: 0.2,
      maximo: 0.4,
      base: "salario_minimo",
      fonte: "Cláusula 13ª — insalubridade em banheiro público e de grande circulação, 40% para locais de uso coletivo e grande circulação, calculada sobre o salário mínimo nacional",
    },
    periculosidade: {
      percentual: 0.3,
      base: "salario_base",
      fonte: "Cláusula 15ª — 30% para jauzeiro em balancim",
    },
    lideranca: {
      faixas: [{ ateEmpregados: 15, pisoProprio: 2600.0 }],
      base: "salario_base",
      fonte: "Tabela de pisos — Líder de Equipe R$ 2.600,00, só para contratos de até 15 funcionários por turno (parágrafo segundo)",
    },
  },
  re: termos("bras[íi]lia|distrito federal|df|taguatinga|ceil[âa]ndia|gama|sobradinho|planaltina|guar[áa]|[áa]guas claras"),
  pendencias: [
    "Vigência 2025/2026 — é a convenção mais antiga do lote. Confirmar se já saiu a de 2026/2027 antes de cotar.",
    "Valor do auxílio-alimentação não foi localizado no texto (cláusula 17ª).",
    "Insalubridade calculada sobre salário mínimo nacional — o valor de 2026 precisa ser cadastrado (ver SALARIO_MINIMO_NACIONAL).",
    "Tarifa de vale-transporte não consta.",
    "Insalubridade de 10% para cozinheiras (cláusula 14ª) não foi lançada.",
  ],
};

// ───────────────────────────── ESPÍRITO SANTO ─────────────────────────────
// Piso único por tipo de trabalhador, sem tabela por função.

const ESPIRITO_SANTO: CCT = {
  uf: "ES",
  regiao: "Espírito Santo",
  sindicato: "Asseio e conservação do Espírito Santo",
  vigencia: "a partir de novembro/2025",
  documento: "ESPIRITO SANTO/ICRegistrado724192435.doc",
  cadastrada: false,
  pisos: {},
  fallback: {
    naoTecnica: 2526.0,
    tecnicaOuLideranca: 2526.0,
    fonte: "Cláusula 3ª, alínea 'a' — piso de R$ 2.526,00 para trabalhadores que exercem função profissional",
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "Cláusula 13ª — desconto de até 6% do salário. Tarifa a confirmar",
    },
    alimentacao: {
      valorDia: 26.0,
      descontoPercentual: 0,
      fonte: "Cláusula 12ª — cartão alimentação/refeição de R$ 26,00 por dia trabalhado a partir de 01/2026",
    },
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.2,
      horaReduzida: true,
      base: "salario_base",
      fonte: "Cláusula 10ª — acréscimo de 20% sobre a hora noturna, nos termos da CLT",
    },
    insalubridade: {
      medio: 0.2,
      maximo: 0.4,
      base: "piso_servente",
      fonte: "Cláusula de insalubridade — percentuais fixados nos respectivos laudos, incidindo sobre os pisos salariais da categoria",
    },
  },
  re: termos("esp[íi]rito santo|vit[óo]ria|vila velha|serra|cariacica|guarapari|linhares|colatina|es"),
  pendencias: [
    "A CCT não traz tabela por função: é um piso único de R$ 2.526,00. Confirmar com o Pedro se porteiro, recepcionista e jardineiro entram todos nesse valor.",
    "Alínea 'b' da cláusula 3ª (outro grupo de trabalhadores) não foi lida — pode haver piso menor.",
    "Existe piso diferenciado para os 'Grandes Complexos da Região Sul' (Selita, Porto Alegre, Nassau, Usina Paineiras, Suzano) que não foi lançado.",
    "Tarifa de vale-transporte não consta.",
  ],
};

// ────────────────────────── MATO GROSSO DO SUL ──────────────────────────
// Piso único + gratificação por função. O "piso da função" é piso + gratificação.

const MATO_GROSSO_DO_SUL: CCT = {
  uf: "MS",
  regiao: "Mato Grosso do Sul",
  sindicato: "Asseio e conservação do Mato Grosso do Sul",
  vigencia: "a partir de 01/01/2026",
  documento: "MATO GROSSO DO SUL/ICRegistrado372675737.doc",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1651.0,
    Servente: 1651.0,
    Faxineira: 1651.0,
    Limpador: 1651.0,
    Recepcionista: 1786.9,
    Copeira: 1748.13,
    "Auxiliar de Cozinha": 1748.13,
    "Auxiliar de Almoxarife": 1786.91,
    "Ajudante de Armazém": 1786.91,
    "Operador de Copiadora": 1786.91,
    Maqueiro: 1786.91,
    "Auxiliar de Escritório": 1854.98,
    Contínuo: 1854.98,
    Mensageiro: 1854.98,
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "Desconto de 6% sobre o salário base. Tarifa a confirmar",
    },
    alimentacao: {
      valorMes: 400.0,
      descontoPercentual: 0,
      fonte: "Cláusula 14ª — auxílio alimentação de R$ 400,00 por mês trabalhado",
    },
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.25,
      horaReduzida: false,
      base: "salario_base",
      fonte: "Cláusula 8ª — 25% com a hora noturna fixada em 60 minutos",
    },
    periculosidade: {
      percentual: 0.3,
      base: "salario_base",
      fonte: "Cláusula de periculosidade — base de cálculo é o piso da categoria; 30% ao bombeiro civil (parágrafo quinto, Lei 11.901/2009)",
    },
    intrajornada: {
      intervaloMinutos: 60,
      adicional: 0.5,
      fonte: "Intervalo de 60 minutos; a supressão é paga integralmente com adicional de 50%, independentemente do quanto foi suprimido",
    },
  },
  // "Campo Grande" ficou de fora de propósito: é também um bairro grande do Rio. Sozinho,
  // o nome cai na praça-base (Rio); com a sigla ("Campo Grande/MS"), o `m[sS]` pega.
  re: termos("mato grosso do sul|dourados|tr[êe]s lagoas|corumb[áa]|ponta por[ãa]|ms"),
  pendencias: [
    "O modelo do MS é piso único de R$ 1.651,00 + gratificação por função (cláusulas 5ª e 6ª). A tabela completa de gratificações tem ~37 linhas e só parte foi lançada — faltam porteiro, jardineiro e zelador.",
    "Insalubridade não foi localizada no texto extraído.",
    "Gratificação de encarregado é proporcional ao número de empregados, mas a tabela de faixas não foi lida.",
    "Tarifa de vale-transporte não consta.",
  ],
};

// ─────────────────────────────── PARANÁ ───────────────────────────────

const PARANA: CCT = {
  uf: "PR",
  regiao: "Paraná",
  sindicato: "Asseio e conservação do Paraná",
  vigencia: "2026/2028",
  documento: "PARANÁ/Convenção-Coletiva-de-Trabalho-2026.2028.pdf",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1900.0,
    Servente: 1900.0,
    Faxineira: 1900.0,
    "Auxiliar de Limpeza": 1900.0,
    Copeira: 1961.0,
    "Auxiliar de Cozinha": 1961.0,
    Jardineiro: 2029.0,
    Porteiro: 2415.0,
    Zelador: 3023.0,
    Almoxarife: 3023.0,
    Supervisor: 3023.0,
    Maqueiro: 1998.0,
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "PENDENTE — cláusula de vale-transporte a extrair",
    },
    alimentacao: {
      valorMes: 494.0,
      descontoPercentual: 0.2,
      fonte: "Cláusula 11ª, parágrafo quinto — vale alimentação (mercado) de R$ 494,00/mês, com desconto de até 20%",
    },
    diasUteisMes: 22,
  },
  adicionais: {
    insalubridade: {
      medio: 0.2,
      maximo: 0.4,
      base: "salario_minimo",
      fonte: "Parágrafo quinto — grau máximo (40%) a coletores e limpeza de fundo de vale; parágrafo sexto define a base de cálculo",
    },
    lideranca: {
      faixas: [
        { ateEmpregados: 10, pisoProprio: 2191.0 },
        { ateEmpregados: 20, pisoProprio: 2279.0 },
        { ateEmpregados: null, pisoProprio: 2404.0 },
      ],
      base: "salario_base",
      fonte: "Cláusula 3ª, item 03 — encarregados: 3 a 10 empregados R$ 2.191,00; 11 a 20 R$ 2.279,00; acima de 20 R$ 2.404,00",
    },
  },
  re: termos("paran[áa]|curitiba|londrina|maring[áa]|foz do igua[çc]u|ponta grossa|cascavel|pr"),
  pendencias: [
    "Recepcionista tem 'gratificação contratual' de R$ 43,00/mês somada ao piso — o piso-base dela não foi localizado.",
    "Porteiro em regime SDF (sábado, domingo e feriado, 12h) tem composição própria de R$ 1.869,00 com rubricas separadas — não foi modelado.",
    "Adicional noturno e periculosidade não foram localizados no texto.",
    "Intrajornada aparece como rubrica de R$ 79,00 no porteiro SDF, mas a regra geral não foi lida.",
    "Tarifa de vale-transporte não consta.",
  ],
};

// ────────────────────────── RIO GRANDE DO SUL ──────────────────────────

const RIO_GRANDE_DO_SUL: CCT = {
  uf: "RS",
  regiao: "Rio Grande do Sul",
  sindicato: "Asseio e conservação do Rio Grande do Sul",
  vigencia: "a partir de 01/01/2026",
  documento: "RIO GRANDE DO SUL/ICRegistrado343831725.doc",
  cadastrada: false,
  pisos: {
    "Auxiliar de Serviços Gerais": 1765.86,
    Servente: 1765.86,
    Faxineira: 1765.86,
    "Auxiliar de Limpeza": 1765.86,
    Limpador: 1765.86,
    "Auxiliar de Manutenção": 1765.86,
    "Auxiliar de Cozinha": 1765.86,
    Copeira: 1765.86,
    Contínuo: 1765.86,
    Jardineiro: 1765.86,
    "Auxiliar de Almoxarife": 1765.86,
    Porteiro: 2126.25,
    Vigia: 2126.25,
    "Controlador de Acesso": 2126.25,
    Recepcionista: 1996.44,
    Zelador: 2151.89,
    Almoxarife: 2120.93,
    Cozinheira: 1854.05,
    "Alpinista Predial": 2243.81,
    "Auxiliar de Escritório": 2307.83,
    "Assistente Administrativo": 2307.83,
    "Técnico em Secretariado": 2750.94,
    "Auxiliar de Dedetização": 1942.3,
    "Operador Central de Controle Operacional": 2126.25,
  },
  fallback: {
    naoTecnica: 1765.86,
    tecnicaOuLideranca: 1765.86,
    fonte: "Cláusula 4ª — salário normativo geral da categoria de R$ 1.765,86 a partir de 01/01/2026",
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "Cláusula de vale-transporte — desconto de até 6% do salário normativo da função",
    },
    alimentacao: {
      valorDia: 27.15,
      descontoPercentual: 0.19,
      fonte: "Cláusula 20ª — auxílio alimentação de R$ 27,15 por dia efetivamente trabalhado (jornada acima de 6h), desconto de até 19%",
    },
    diasUteisMes: 22,
  },
  re: termos("rio grande do sul|porto alegre|caxias do sul|pelotas|canoas|santa maria|gravata[íi]|novo hamburgo|rs"),
  pendencias: [
    "Adicional noturno, insalubridade, periculosidade e intrajornada não foram localizados no texto extraído.",
    "Benefício Social Familiar é citado na CCT mas o valor do custeio não foi lido.",
    "Auxílio lanche (cláusula 21ª) para jornada de até 6h não foi lançado.",
    "Gratificação de liderança/encarregado não foi localizada.",
    "Tarifa de vale-transporte não consta.",
  ],
};

// ───────────────────────────── SANTA CATARINA ─────────────────────────────
// Atenção: em SC os "pisos" publicados JÁ EMBUTEM insalubridade ou periculosidade.
// O que vai no Módulo 1-A é o `pisos` abaixo (a parcela salarial pura); o adicional
// embutido está em `adicionalEmbutido` e o motor soma nas linhas B/C, não em A.

const SANTA_CATARINA: CCT = {
  uf: "SC",
  regiao: "Santa Catarina",
  sindicato: "SEAC-SC",
  vigencia: "a partir de 01/01/2026",
  documento: "SANTA CATARINA/CCT-SEAC-SC/CCT 2026 - SEAC - SC0001022026.doc",
  cadastrada: false,
  // Parcela salarial pura (a CCT chama de "piso salarial" na composição de cada alínea).
  pisos: {
    "Auxiliar de Serviços Gerais": 1752.85,
    Servente: 1752.85,
    Copeira: 1752.85,
    Contínuo: 1752.85,
    Recepcionista: 1857.54,
    Cozinheira: 1857.54,
    Garçom: 1857.54,
    Porteiro: 2496.27,
    Jardineiro: 2097.5,
    Zelador: 1977.73,
    "Auxiliar de Manutenção": 1977.73,
    Manobrista: 1977.73,
    Digitador: 1981.22,
    "Auxiliar de Dedetização": 1849.97,
    "Operador de Empilhadeira": 2952.84,
    Encarregado: 2397.34,
  },
  fallback: {
    naoTecnica: 1752.85,
    tecnicaOuLideranca: 1910.81,
    fonte: "Cláusula 3ª, parágrafo primeiro — remuneração básica de R$ 1.752,85; alínea A (pessoal administrativo) R$ 1.910,81",
  },
  beneficios: {
    valeTransporte: {
      tarifa: 0,
      passagensDia: 2,
      descontoPercentual: 0.06,
      fonte: "PENDENTE — cláusula de vale-transporte a extrair",
    },
    alimentacao: {
      descontoPercentual: 0.01,
      fonte: "PENDENTE — valor do vale-alimentação não localizado; a CCT só fixa o desconto de 1% do valor fornecido",
    },
    diasUteisMes: 22,
  },
  adicionais: {
    noturno: {
      percentual: 0.2,
      horaReduzida: true,
      base: "salario_base",
      fonte: "Quadro de composição por escala — adicional noturno de 20% com hora noturna reduzida",
    },
    insalubridade: {
      medio: 0.2,
      maximo: 0.4,
      base: "salario_base",
      fonte: "Cláusula 3ª — a CCT já publica o piso de servente com 20% de insalubridade grau médio embutido (R$ 1.752,85 + R$ 350,57 = R$ 2.103,42); grau máximo (40%) é calculado sobre o salário mínimo nacional no caso do agente de dedetização",
    },
    periculosidade: {
      percentual: 0.3,
      base: "salario_base",
      fonte: "Cláusula 3ª, parágrafo terceiro — 30% ao servente/ASG que limpa vidros e fachadas em andaime ou balancim, nas horas efetivamente trabalhadas",
    },
    intrajornada: {
      intervaloMinutos: 30,
      adicional: 0.5,
      fonte: "Quadro de composição por escala — 30 minutos normais com acréscimo de 50% por dia trabalhado, nos dias em que houver supressão do intervalo",
    },
  },
  re: termos("santa catarina|florian[óo]polis|joinville|blumenau|itaja[íi]|chapec[óo]|criciuma|crici[úu]ma|sc"),
  pendencias: [
    "ATENÇÃO: em SC o piso divulgado já embute insalubridade (servente: R$ 1.752,85 + R$ 350,57 = R$ 2.103,42). Lançamos só a parcela salarial em `pisos` — conferir se o DP calcula encargos sobre a parcela pura ou sobre o total.",
    "Valor do vale-alimentação não foi localizado.",
    "Tarifa de vale-transporte não consta.",
    "Insalubridade em grau máximo é sobre o salário mínimo nacional — precisa do valor de 2026.",
    "Jornada: os pisos correspondem a 220h/mês; telefonista, digitador e ascensorista são 180h. O motor ainda não trata jornada reduzida.",
  ],
};

// ─────────────────── PRAÇAS SEM CONVENÇÃO NO LOTE DE 13/08/2026 ───────────────────
// O zip do Pedro cobre nove praças. Estas duas existem aqui para a Shayene NOMEAR a
// região ("Salvador") ao dizer que o comercial confirma o valor — e, principalmente,
// para o cliente de fora NÃO cair no default do Rio e receber o preço carioca.

const semConvencao = (uf: string, regiao: string, re: RegExp): CCT => ({
  uf,
  regiao,
  sindicato: "",
  vigencia: "",
  documento: "",
  cadastrada: false,
  pisos: {},
  re,
  pendencias: [`Nenhuma convenção de ${regiao} veio no lote de 13/08/2026. Pedir ao Pedro antes de cotar.`],
});

const NORDESTE = semConvencao(
  "NE",
  "Nordeste",
  termos(
    "nordeste|bahia|salvador|feira de santana|pernambuco|recife|olinda|jaboat(?:ã|a)o|cear[áa]|fortaleza|natal|jo(?:ã|a)o pessoa|macei[óo]|aracaju|s(?:ã|a)o lu[íi]s|teresina|ba|pe|ce|rn|pb|al|se|ma|pi",
  ),
);

const NORTE_CENTRO_OESTE = semConvencao(
  "NCO",
  "Norte e Centro-Oeste",
  termos(
    "norte|centro-oeste|goi[áa]s|goi[âa]nia|an[áa]polis|mato grosso|cuiab[áa]|v[áa]rzea grande|rond[ôo]nia|porto velho|acre|rio branco|amazonas|manaus|par[áa]|bel[ée]m|amap[áa]|macap[áa]|roraima|boa vista|tocantins|palmas|go|mt|ro|ac|am|pa|ap|rr|to",
  ),
);

/**
 * Praças reconhecidas. A ordem importa: quem casa primeiro ganha, então as nove praças
 * com convenção vêm antes dos dois blocos genéricos.
 */
export const CCT_POR_PRACA: CCT[] = [
  SAO_PAULO,
  RIO_DE_JANEIRO,
  MINAS_GERAIS,
  BRASILIA,
  ESPIRITO_SANTO,
  MATO_GROSSO_DO_SUL,
  PARANA,
  RIO_GRANDE_DO_SUL,
  SANTA_CATARINA,
  NORDESTE,
  NORTE_CENTRO_OESTE,
];

/** Praça da composição fechada da planilha. É o default quando o cliente não diz onde é. */
export const PRACA_BASE = RIO_DE_JANEIRO;

/**
 * Salário mínimo nacional, base de cálculo da insalubridade em DF, PR e SC.
 *
 * Zerado de propósito: nenhum documento do zip traz o valor de 2026 e um número errado
 * aqui vira preço errado na conversa. Enquanto for 0, o motor devolve sob consulta para
 * qualquer posto insalubre nessas praças. Preencha quando o DP confirmar.
 */
export const SALARIO_MINIMO_NACIONAL = 0;

/**
 * Identifica a praça a partir do texto que o cliente escreveu ("Barra", "SP", "Belo
 * Horizonte"). Sem região, ou região não reconhecida, devolve o Rio — a praça da
 * composição fechada, e a única em que a Shayene pode cotar hoje.
 */
export function resolverPraca(region?: string): CCT {
  if (!region?.trim()) return PRACA_BASE;
  return CCT_POR_PRACA.find((c) => c.re.test(region)) ?? PRACA_BASE;
}

/** Praças que o motor pode cotar sozinho. */
export function pracasCadastradas(): CCT[] {
  return CCT_POR_PRACA.filter((c) => c.cadastrada);
}

// ─────────────────────────── RESOLUÇÃO DE PISO ───────────────────────────

/**
 * Grupos do catálogo que a CCT do Rio trata como "função técnica ou de liderança" na
 * cláusula 7ª. Manutenção e indústria entram porque eletricista, soldador e torneiro têm
 * qualificação técnico-profissional; saúde e administrativo, pelo mesmo motivo.
 *
 * Na dúvida, a função vai para o piso MAIOR (o do encarregado). Errar para cima custa uma
 * proposta perdida; errar para baixo custa a diferença todo mês, do bolso da Shine.
 */
const GRUPOS_TECNICOS = new Set(["supervisao", "industrial", "saude", "manutencao", "administrativo"]);

/** Nome que denuncia liderança mesmo quando o grupo do catálogo não é "supervisao". */
const NOME_DE_LIDERANCA = /\b(supervisor|coordenador|encarregado|chefe|l[íi]der|inspetor|gerente)/i;

export interface PisoResolvido {
  valor: number;
  /** true quando o piso veio da regra de fallback da CCT, não de uma linha nominal. */
  porFallback: boolean;
  fonte: string;
}

/**
 * Piso da função na praça. Procura primeiro pelo nome exato da tabela da convenção; se não
 * achar, aplica a regra de fallback que a própria CCT define (o Rio tem uma na cláusula
 * 7ª). Praça sem tabela e sem fallback devolve undefined — e aí o motor sai sob consulta.
 */
export function resolverPiso(cct: CCT, functionName: string, group?: string): PisoResolvido | undefined {
  const nominal = cct.pisos[functionName];
  if (typeof nominal === "number" && nominal > 0) {
    return { valor: nominal, porFallback: false, fonte: `Tabela de pisos da CCT ${cct.uf} — ${functionName}` };
  }
  // Sem `group` a função não está no catálogo da Shine, e o fallback da CCT não se aplica:
  // a cláusula 7ª do Rio fala das funções DA CATEGORIA, não de qualquer nome que apareça
  // na conversa. Sem esta guarda, "Astronauta" pegaria o piso do encarregado e a Shayene
  // cotaria um serviço que a Shine não presta.
  if (!group || !cct.fallback) return undefined;
  const tecnica = NOME_DE_LIDERANCA.test(functionName) || GRUPOS_TECNICOS.has(group);
  return {
    valor: tecnica ? cct.fallback.tecnicaOuLideranca : cct.fallback.naoTecnica,
    porFallback: true,
    fonte: cct.fallback.fonte,
  };
}

/**
 * Piso da categoria de servente na praça — base de cálculo da insalubridade e da
 * gratificação de liderança em várias convenções (RJ, cláusulas 13ª, 14ª e 18ª).
 */
export function pisoServente(cct: CCT): number | undefined {
  return cct.pisos["Servente"] ?? cct.pisos["Auxiliar de Serviços Gerais"] ?? cct.fallback?.naoTecnica;
}

/**
 * Valor sobre o qual um adicional incide, conforme a base que a CCT mandou usar.
 * Devolve undefined quando a base existe mas o valor não está cadastrado (é o caso da
 * insalubridade sobre salário mínimo enquanto SALARIO_MINIMO_NACIONAL for 0).
 */
export function baseDeCalculo(cct: CCT, base: BaseCalculo, salarioBase: number, remuneracao: number): number | undefined {
  switch (base) {
    case "salario_base":
      return salarioBase;
    case "remuneracao":
      return remuneracao;
    case "piso_servente":
      return pisoServente(cct);
    case "salario_minimo":
      return SALARIO_MINIMO_NACIONAL > 0 ? SALARIO_MINIMO_NACIONAL : undefined;
  }
}
