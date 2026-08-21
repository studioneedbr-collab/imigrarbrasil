import type { ServiceCatalogItem, ServiceSchedule } from "@/lib/domain/types";
import { getPricingParams } from "@/lib/agent/pricing-params";

// O piso e o "preço confirmado" de cada função vivem em pricing-params (DEFAULT_PRICING),
// que por sua vez lê a CCT da praça-base em lib/agent/cct.ts. Aqui só espelhamos, para
// catálogo e motor não divergirem — foi divergência entre os dois que, em 10/08/2026,
// deixou a Shayene passar um piso de portaria que não existia em convenção nenhuma.
const seed = (
  name: string,
  category: string,
  schedule: ServiceSchedule,
  description: string,
): Omit<ServiceCatalogItem, "id" | "costPerEmployee" | "salePrice"> => {
  const p = getPricingParams(name);
  return {
    name,
    category,
    baseSalary: p?.baseSalary ?? 0,
    marginPercent: 20,
    schedule,
    description,
    active: true,
    priceConfirmed: p?.priceConfirmed ?? false,
  };
};

export const SEED_SERVICES: Array<Omit<ServiceCatalogItem, "id" | "costPerEmployee" | "salePrice">> = [
  seed("Auxiliar de Serviços Gerais", "limpeza", "5x2_44h", "Limpeza e conservação (ASG)"),
  seed("Porteiro", "portaria", "12x36", "Controle de acesso e portaria"),
  seed("Recepcionista", "administrativo", "5x2_44h", "Recepção e atendimento"),
  seed("Zelador", "manutencao", "5x2_44h", "Zeladoria predial"),
  seed("Jardineiro", "manutencao", "6x1_44h", "Jardinagem e paisagismo"),
  seed("Operador de Piscina", "manutencao", "5x2_44h", "Guardião/operador de piscina"),
];

// Preço por PESSOA: a escala não multiplica postos (1 = 1 pessoa). Quando a tabela real
// trouxer o preço do posto por escala, isso passa a vir direto da tabela.
export const SCHEDULE_POSTS: Record<ServiceSchedule, number> = {
  "5x2_44h": 1,
  "6x1_44h": 1,
  "12x36": 1,
};
