import type { LeadSetor } from "@/lib/domain/types";

// Rede de segurança determinística de roteamento. Roda DEPOIS do DeepSeek e SÓ cobre o
// que ele deixar passar.
//
// O QUE SAIU DAQUI: os padrões de "colaborador de vocês alocado no meu prédio" (porteiro
// que faltou, escala a trocar, faxineira a substituir) e os de folha de pagamento de
// funcionário interno. Eram da empresa de terceirização que originou este código — numa
// assessoria de imigração não existe colaborador alocado em cliente, e a mesma frase
// ("preciso trocar meu porteiro") não aparece nunca. Sobrou o único caso que é real aqui.

export type RoutingKind = "candidato";

export interface RoutingMatch {
  kind: RoutingKind;
  setor: LeadSetor;
  reason: string;
  handoffMsg: string;
}

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
