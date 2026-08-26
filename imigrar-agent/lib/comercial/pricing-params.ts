import { FUNCTION_CATALOG } from "@/lib/comercial/function-catalog";
import { PRACA_BASE, resolverPiso, type CCT } from "@/lib/comercial/cct";

export interface PricingParams {
  functionName: string;
  baseSalary: number;
  schedule: string;
  // Benefícios da convenção (VT + VR/VA + sociais). Ausente => o motor calcula pela CCT
  // da praça (lib/agent/cct.ts). Deixe cadastrar por função porque contrato grande às
  // vezes negocia benefício acima do piso da convenção.
  beneficios?: number;
  uniformeMes: number;
  equipamentosFunc: number;
  materialFunc: number;
  priceConfirmed: boolean;
}

// Re-export para não quebrar quem já importava daqui. A fonte da verdade da CCT é
// lib/agent/cct.ts desde 13/08/2026, quando as convenções das nove praças chegaram.
export {
  CCT_POR_PRACA,
  PRACA_BASE,
  resolverPraca,
  resolverPiso,
  pisoServente,
  baseDeCalculo,
  pracasCadastradas,
  SALARIO_MINIMO_NACIONAL,
} from "@/lib/comercial/cct";
export type { CCT, BaseCalculo, AdicionaisCCT, BeneficiosCCT, PisoResolvido } from "@/lib/comercial/cct";
/** @deprecated Nome antigo de `CCT`. Mantido só para imports legados. */
export type CCTEstadual = CCT;

/**
 * As nove convenções coletivas chegaram em 13/08/2026 (SHAIENE-CTTs-2026.zip, enviado
 * pelo Pedro). O Rio foi lido cláusula por cláusula e conferido: a CCT SIEMACO-RJ
 * 2026/2027 traz a tabela de pisos completa (cláusula 3ª) e ainda diz o que fazer com
 * função que não está na tabela (cláusula 7ª). Por isso o piso deixou de ser placeholder.
 *
 * Antes desta data este arquivo carregava cinco funções com `baseSalary: 0` e uma trava
 * global (`CONFIRMAR_PISOS_CCT = false`), porque um piso de portaria chutado em
 * R$ 1.998,00 tinha chegado a um cliente em 10/08/2026. O piso real do Rio é R$ 2.051,95
 * — a trava foi substituída pelo dado de verdade.
 *
 * A trava continua existindo, mas mudou de lugar: agora é o `cadastrada` de cada praça em
 * lib/agent/cct.ts. Só o Rio está liberado; as outras oito praças têm os dados lidos das
 * convenções mas travados até o Pedro conferir (ver docs/conferencia-cct-2026.md).
 */
const PRACA = PRACA_BASE;

/** Escala e uniforme saem do catálogo; o piso, da CCT da praça-base (Rio). */
function paramsDoCatalogo(name: string, group: string, schedule: string, uniformeMes: number): PricingParams {
  const piso = resolverPiso(PRACA, name, group);
  return {
    functionName: name,
    baseSalary: piso?.valor ?? 0,
    schedule,
    uniformeMes,
    // O posto NÃO inclui material nem equipamento: as abas EQUIPAMENTOS (R$ 1.226,39/mês)
    // e MATERIAL (R$ 4.694,15/mês) da planilha são custo do CONTRATO e entram por rateio
    // em pricing.ts, não por cabeça.
    equipamentosFunc: 0,
    materialFunc: 0,
    // Sem piso na convenção e sem regra de fallback, a função sai sob consulta.
    priceConfirmed: (piso?.valor ?? 0) > 0,
  };
}

export const DEFAULT_PRICING: PricingParams[] = FUNCTION_CATALOG.map((f) =>
  paramsDoCatalogo(f.name, f.group, f.schedule, f.uniformeMes),
);

/** Funções com piso realmente cadastrado na praça-base. */
export const FUNCOES_COM_CCT = DEFAULT_PRICING.filter((p) => p.priceConfirmed).map((p) => p.functionName);

/** Funções que a convenção da praça-base não cobre. Vazio enquanto o Rio tiver fallback. */
export const FUNCOES_PENDENTES_CCT = DEFAULT_PRICING.filter((p) => !p.priceConfirmed).map((p) => p.functionName);

export function getPricingParams(name: string): PricingParams | undefined {
  return DEFAULT_PRICING.find((p) => p.functionName.toLowerCase() === name.toLowerCase());
}
