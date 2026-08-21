import type { LeadSetor } from "@/lib/domain/types";

// Rede de segurança determinística de roteamento. Roda DEPOIS do DeepSeek e SÓ cobre
// o que ele deixar passar: quando a mensagem casa com um padrão CLARO (colaborador já
// alocado, funcionário interno, candidato) e o modelo não disparou a tool certa, o
// sistema força o encaminhamento. Padrões conservadores de propósito: um pedido
// comercial ("preciso de um porteiro") nunca cai aqui.

export type RoutingKind = "operacional" | "departamento_pessoal" | "candidato";

export interface RoutingMatch {
  kind: RoutingKind;
  setor: LeadSetor;
  reason: string;
  handoffMsg: string;
}

// Colaborador JÁ ALOCADO no cliente / assunto operacional em campo.
const OPERACIONAL_PATTERNS: RegExp[] = [
  /\b(colaborador|funcion[áa]ri[oa]|porteir[oa]|faxineir[oa]|zelador|vigia|recepcionist[ao]|jardineir[oa]|profissional)\b[^.]{0,40}\b(de voc[êe]s|que voc[êe]s|daqui|no meu pr[ée]dio|no local|em campo|alocad[oa]|escalad[oa]|est[áa] aqui|est[áa] a[íi])/i,
  /\b(de voc[êe]s|que voc[êe]s)\b[^.]{0,25}\b(colaborador|funcion[áa]ri[oa]|porteir[oa]|faxineir[oa]|zelador|vigia|profissional)/i,
  /(mudar|alterar|trocar|ajustar)[^.]{0,25}\b(escala|hor[áa]rio|turno)\b[^.]{0,25}\b(dele|dela|do colaborador|do funcion|do porteir|do profissional)/i,
  /(substituir|trocar|remover|tirar|repor)[^.]{0,20}\b(o|a|meu|nosso|esse|esta?)?\s*(porteir[oa]|faxineir[oa]|colaborador|zelador|vigia|profissional|funcion[áa]ri[oa])\b/i,
  /\b(colaborador|profissional|porteir[oa]|faxineir[oa]|funcion[áa]ri[oa])\b[^.]{0,25}\b(faltou|n[ãa]o apareceu|n[ãa]o veio|atrasou|sumiu)\b/i,
  /\breclama[çc][ãa]o\b[^.]{0,30}\b(colaborador|profissional|porteir[oa]|funcion[áa]ri[oa]|atendente)\b/i,
  /informe?m?[^.]{0,30}(oficialmente\s+)?(o\s+)?colaborador\s+de\s+voc[êe]s/i,
];

// Funcionário INTERNO com folha/pagamento/benefício ("meu salário não caiu").
const DP_PATTERNS: RegExp[] = [
  /\bmeu\s+sal[áa]rio\b/i,
  /\bminha\s+folha\b/i,
  /\bmeu\s+(pagamento|contracheque|holerite|hollerith)\b/i,
  /\bmeu\s+v[ao]le\b/i,
  /\bminhas?\s+f[ée]rias\b/i,
  /\bmeu\s+(13|d[ée]cimo\s+terceiro)\b/i,
  /\bn[ãa]o\s+(caiu|recebi|veio)\b[^.]{0,20}\b(sal[áa]rio|pagamento|folha)\b/i,
];

// Candidato a vaga (não é cliente nem funcionário).
const CANDIDATO_PATTERNS: RegExp[] = [
  /\b(quero|tenho interesse em|gostaria de|queria)\s+trabalhar\b/i,
  /\b(mandar|enviar|deixar|encaminhar)\s+(o\s+|meu\s+)?curr[íi]culo\b/i,
  /\bcurr[íi]culo\b/i,
  /\b(tem|t[êe]m|h[áa]|abriu|abriram|dispon[íi]ve[li]s?)\s+vagas?\b/i,
  /\b(vaga|emprego)\b[^.]{0,20}\b(voc[êe]s|a[íi]|dispon)/i,
  /\b(procurando|em busca de|atr[áa]s de)\s+(emprego|vaga|trabalho|coloca[çc][ãa]o)\b/i,
  /\bme\s+candidatar\b/i,
];

function matchAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

export function classifyRouting(text: string): RoutingMatch | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  // Ordem: operacional e DP têm prioridade sobre candidato (mais específicos).
  if (matchAny(OPERACIONAL_PATTERNS, t)) {
    return {
      kind: "operacional",
      setor: "operacional",
      reason: "Solicitação operacional sobre colaborador já alocado no cliente.",
      handoffMsg:
        "Entendi! Já registrei e passei pro nosso time operacional cuidar disso. 😊 Fico por aqui com você — se precisar de mais alguma coisa ou lembrar de algum detalhe, é só me falar.",
    };
  }
  if (matchAny(DP_PATTERNS, t)) {
    return {
      kind: "departamento_pessoal",
      setor: "departamento_pessoal",
      reason: "Assunto de folha/pagamento/benefício de colaborador interno.",
      handoffMsg:
        "Entendi! Isso é com o nosso Departamento Pessoal — já passei pra eles. 😊 Continuo aqui com você: se lembrar de algum detalhe ou quiser saber como está, é só me chamar.",
    };
  }
  if (matchAny(CANDIDATO_PATTERNS, t)) {
    return {
      kind: "candidato",
      setor: "rh",
      reason: "Candidato a vaga.",
      handoffMsg:
        // A Shayene NÃO despacha candidato com o e-mail do RH: ela faz a triagem
        // (nome, função, região, experiência) antes de pedir o currículo. Esta mensagem
        // é só o fallback de último caso — o atendimento de verdade é conduzido por ela.
        "Que bom o seu interesse em fazer parte do time 😊 Como é o seu nome completo?",
    };
  }
  return null;
}
