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

// Candidato a vaga NA PRÓPRIA IMIGRAR BRASIL.
//
// ATENÇÃO — a armadilha deste domínio: "quero trabalhar no Brasil", "posso trabalhar com
// esse visto?" e "estou procurando emprego, preciso de documento" são atendimento de
// IMIGRAÇÃO, não candidatura. Na base original, "quero trabalhar" bastava para classificar
// alguém como candidato a vaga — aqui isso jogaria metade do público real no funil de RH.
// Por isso todo padrão exige uma âncora na EMPRESA (vocês, aí, na assessoria) ou a palavra
// currículo, e "trabalhar no Brasil" é explicitamente excluído.
const CANDIDATO_PATTERNS: RegExp[] = [
  /\b(mandar|enviar|deixar|encaminhar)\s+(o\s+|meu\s+)?curr[íi]culo\b/i,
  /\bcurr[íi]culo\b/i,
  // Sem \b no fim: a borda de palavra do JS não entende acento, e "aí" seguido de espaço
  // nunca fecharia um \b — era isso que fazia "trabalhar aí com vocês" passar batido.
  /\b(quero|tenho interesse em|gostaria de|queria)\s+trabalhar\s+(a[íi]|com voc[êe]s|na imigrar|no escrit[óo]rio)/i,
  /\b(tem|t[êe]m|h[áa]|abriu|abriram|dispon[íi]ve[li]s?)\s+vagas?\s+(a[íi]|na imigrar|no escrit[óo]rio|com voc[êe]s)/i,
  /\b(vaga|emprego)\b[^.]{0,20}\b(a[íi] na imigrar|no escrit[óo]rio de voc[êe]s)/i,
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
      reason: "Assunto sobre pessoa da equipe / atendimento em andamento.",
      handoffMsg:
        "Entendi. Já registrei e passei para o nosso time cuidar disso. Fico por aqui com você — se lembrar de algum detalhe ou precisar de mais alguma coisa, é só me falar.",
    };
  }
  if (matchAny(DP_PATTERNS, t)) {
    return {
      kind: "departamento_pessoal",
      setor: "departamento_pessoal",
      reason: "Assunto de folha/pagamento/benefício de quem trabalha na Imigrar Brasil.",
      handoffMsg:
        "Entendi. Isso é com o nosso administrativo — já passei para eles. Continuo aqui com você: se lembrar de algum detalhe ou quiser saber como está, é só me chamar.",
    };
  }
  if (matchAny(CANDIDATO_PATTERNS, t)) {
    return {
      kind: "candidato",
      setor: "rh",
      reason: "Candidato a vaga na Imigrar Brasil.",
      handoffMsg:
        // Fallback de último caso — o atendimento de verdade é conduzido pela Ana.
        "Que bom o seu interesse em fazer parte do time. Como é o seu nome, e em que área você atua?",
    };
  }
  return null;
}
