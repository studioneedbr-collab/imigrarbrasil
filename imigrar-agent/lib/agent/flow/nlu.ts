import type { FlowStateId } from "@/lib/domain/types";
import { STATES } from "@/lib/agent/flow/states";

// NLU híbrida (menu-estrito): mapeia texto livre para o próximo estado dentro de uma
// tela de menu, SEM depender de chave de API. Prioriza número solto (opção do menu
// atual) e, se não houver, faz match por palavra-chave contra as opções conhecidas.
// Retorna {} quando nada casa — o chamador mantém o estado atual e re-exibe o menu.
export function mapFreeText(current: FlowStateId, input: string): { state?: FlowStateId } {
  const raw = input.trim();
  const t = raw.toLowerCase();
  const opts = STATES[current].options ?? {};

  // 1) Número solto correspondente a uma opção do menu atual ("1", "2️⃣", "opção 3").
  const num = raw.match(/(\d+)/);
  if (num && opts[num[1]] && opts[num[1]] !== current) {
    return { state: opts[num[1]] };
  }

  // 2) Palavras-chave (contextuais + globais do funil comercial).
  if (/or[çc]amento|or[çc]ar|cota[çc][ãa]o|pre[çc]o|valor/.test(t)) return { state: "S5" };
  if (/conhecer|quais.*servi|portf[óo]lio|cat[áa]logo|saber mais/.test(t)) return { state: "S6" };
  if (/consultor|falar com (algu[ée]m|humano|atendente|pessoa|respons[áa]vel|vendedor)/.test(t)) return { state: "S7" };
  if (/renova[çc]|altera[çc][ãa]o.*contrato|mudan[çc]a.*contrato/.test(t)) return { state: "S8" };

  // Triagem: quer contratar/orçar → é cliente (S2 → S3).
  if (current === "S2" && /\bcliente\b|contratar|contrata[çc]|orçar|comprar/.test(t)) return { state: "S3" };

  // Setor comercial (S3 → S4).
  if (current === "S3" && /comercial|vender|vendas|contratar/.test(t)) return { state: "S4" };

  return {};
}
