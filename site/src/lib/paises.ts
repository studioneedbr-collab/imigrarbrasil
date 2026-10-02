// Países do seletor de telefone: DDI e máscara.
//
// O site SEMPRE envia o telefone como "+<DDI><número>". É o contrato com o CRM
// (imigrar-agent/lib/whatsapp/telefone.ts → comDdiProvavel): com "+", o número é guardado
// como veio; sem "+", o CRM supõe que é brasileiro e põe 55 na frente — e o número de um
// espanhol viraria o telefone de outra pessoa. Normalização de verdade é do CRM; aqui só
// se compõe o número com o DDI que a pessoa escolheu.
//
// Máscara: "0" é dígito. O Brasil tem a sua (fixo e celular); os demais usam um
// agrupamento legível, sem pretensão de validar plano de numeração de cada país.

export type Pais = { iso: string; nome: string; ddi: string; mascara?: string; min?: number; max?: number };

// Ordem: Brasil, depois os países de onde mais vêm os clientes, depois o resto por nome.
export const PAISES: Pais[] = [
  { iso: "BR", nome: "Brasil", ddi: "55", mascara: "(00) 00000-0000", min: 10, max: 11 },
  { iso: "VE", nome: "Venezuela", ddi: "58", mascara: "000-000-0000", min: 10, max: 10 },
  { iso: "CO", nome: "Colômbia", ddi: "57", mascara: "000 000 0000", min: 10, max: 10 },
  { iso: "AR", nome: "Argentina", ddi: "54", mascara: "00 0000-0000", min: 10, max: 11 },
  { iso: "BO", nome: "Bolívia", ddi: "591", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "PY", nome: "Paraguai", ddi: "595", mascara: "000 000 000", min: 9, max: 9 },
  { iso: "PE", nome: "Peru", ddi: "51", mascara: "000 000 000", min: 9, max: 9 },
  { iso: "HT", nome: "Haiti", ddi: "509", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "CU", nome: "Cuba", ddi: "53", mascara: "0 000 0000", min: 8, max: 8 },
  { iso: "AO", nome: "Angola", ddi: "244", mascara: "000 000 000", min: 9, max: 9 },
  { iso: "PT", nome: "Portugal", ddi: "351", mascara: "000 000 000", min: 9, max: 9 },
  { iso: "US", nome: "Estados Unidos", ddi: "1", mascara: "(000) 000-0000", min: 10, max: 10 },
  { iso: "AF", nome: "Afeganistão", ddi: "93" },
  { iso: "ZA", nome: "África do Sul", ddi: "27" },
  { iso: "DE", nome: "Alemanha", ddi: "49" },
  { iso: "SA", nome: "Arábia Saudita", ddi: "966" },
  { iso: "DZ", nome: "Argélia", ddi: "213" },
  { iso: "AU", nome: "Austrália", ddi: "61" },
  { iso: "AT", nome: "Áustria", ddi: "43" },
  { iso: "BD", nome: "Bangladesh", ddi: "880" },
  { iso: "BE", nome: "Bélgica", ddi: "32" },
  { iso: "BJ", nome: "Benin", ddi: "229" },
  { iso: "BF", nome: "Burkina Faso", ddi: "226" },
  { iso: "CV", nome: "Cabo Verde", ddi: "238", mascara: "000 00 00", min: 7, max: 7 },
  { iso: "CM", nome: "Camarões", ddi: "237" },
  { iso: "CA", nome: "Canadá", ddi: "1", mascara: "(000) 000-0000", min: 10, max: 10 },
  { iso: "CL", nome: "Chile", ddi: "56", mascara: "0 0000 0000", min: 9, max: 9 },
  { iso: "CN", nome: "China", ddi: "86" },
  { iso: "CI", nome: "Costa do Marfim", ddi: "225" },
  { iso: "KR", nome: "Coreia do Sul", ddi: "82" },
  { iso: "CR", nome: "Costa Rica", ddi: "506", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "DK", nome: "Dinamarca", ddi: "45" },
  { iso: "EG", nome: "Egito", ddi: "20" },
  { iso: "SV", nome: "El Salvador", ddi: "503", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "AE", nome: "Emirados Árabes Unidos", ddi: "971" },
  { iso: "EC", nome: "Equador", ddi: "593", mascara: "00 000 0000", min: 9, max: 9 },
  { iso: "ES", nome: "Espanha", ddi: "34", mascara: "000 00 00 00", min: 9, max: 9 },
  { iso: "PH", nome: "Filipinas", ddi: "63" },
  { iso: "FR", nome: "França", ddi: "33", mascara: "0 00 00 00 00", min: 9, max: 9 },
  { iso: "GH", nome: "Gana", ddi: "233" },
  { iso: "GR", nome: "Grécia", ddi: "30" },
  { iso: "GT", nome: "Guatemala", ddi: "502", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "GN", nome: "Guiné", ddi: "224" },
  { iso: "GW", nome: "Guiné-Bissau", ddi: "245" },
  { iso: "GY", nome: "Guiana", ddi: "592" },
  { iso: "NL", nome: "Holanda (Países Baixos)", ddi: "31" },
  { iso: "HN", nome: "Honduras", ddi: "504", mascara: "0000-0000", min: 8, max: 8 },
  { iso: "IN", nome: "Índia", ddi: "91", mascara: "00000 00000", min: 10, max: 10 },
  { iso: "ID", nome: "Indonésia", ddi: "62" },
  { iso: "IR", nome: "Irã", ddi: "98" },
  { iso: "IQ", nome: "Iraque", ddi: "964" },
  { iso: "IE", nome: "Irlanda", ddi: "353" },
  { iso: "IL", nome: "Israel", ddi: "972" },
  { iso: "IT", nome: "Itália", ddi: "39" },
  { iso: "JP", nome: "Japão", ddi: "81" },
  { iso: "JO", nome: "Jordânia", ddi: "962" },
  { iso: "LB", nome: "Líbano", ddi: "961" },
  { iso: "MA", nome: "Marrocos", ddi: "212" },
  { iso: "MX", nome: "México", ddi: "52", mascara: "00 0000 0000", min: 10, max: 10 },
  { iso: "MZ", nome: "Moçambique", ddi: "258", mascara: "00 000 0000", min: 9, max: 9 },
  { iso: "NI", nome: "Nicarágua", ddi: "505", mascara: "0000 0000", min: 8, max: 8 },
  { iso: "NG", nome: "Nigéria", ddi: "234" },
  { iso: "NO", nome: "Noruega", ddi: "47" },
  { iso: "NZ", nome: "Nova Zelândia", ddi: "64" },
  { iso: "PK", nome: "Paquistão", ddi: "92" },
  { iso: "PS", nome: "Palestina", ddi: "970" },
  { iso: "PA", nome: "Panamá", ddi: "507", mascara: "0000-0000", min: 8, max: 8 },
  { iso: "PL", nome: "Polônia", ddi: "48" },
  { iso: "KE", nome: "Quênia", ddi: "254" },
  { iso: "GB", nome: "Reino Unido", ddi: "44", mascara: "0000 000000", min: 10, max: 10 },
  { iso: "CD", nome: "República Democrática do Congo", ddi: "243" },
  { iso: "CG", nome: "República do Congo", ddi: "242" },
  { iso: "DO", nome: "República Dominicana", ddi: "1", mascara: "(000) 000-0000", min: 10, max: 10 },
  { iso: "RU", nome: "Rússia", ddi: "7" },
  { iso: "SN", nome: "Senegal", ddi: "221" },
  { iso: "SL", nome: "Serra Leoa", ddi: "232" },
  { iso: "SY", nome: "Síria", ddi: "963" },
  { iso: "SE", nome: "Suécia", ddi: "46" },
  { iso: "CH", nome: "Suíça", ddi: "41" },
  { iso: "SR", nome: "Suriname", ddi: "597" },
  { iso: "TG", nome: "Togo", ddi: "228" },
  { iso: "TN", nome: "Tunísia", ddi: "216" },
  { iso: "TR", nome: "Turquia", ddi: "90" },
  { iso: "UA", nome: "Ucrânia", ddi: "380" },
  { iso: "UY", nome: "Uruguai", ddi: "598", mascara: "00 000 000", min: 8, max: 8 },
  { iso: "VN", nome: "Vietnã", ddi: "84" },
];

/** 🇧🇷 a partir de "BR" (letras indicadoras regionais). No Windows aparece "BR", e serve. */
export const bandeira = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** Aplica a máscara aos dígitos; sem máscara, agrupa de 3 em 3. */
export function mascarar(digitos: string, p: Pais): string {
  const d = digitos.slice(0, p.max ?? 14);
  // Fixo brasileiro (10 dígitos) usa (00) 0000-0000.
  const m = p.iso === "BR" && d.length <= 10 ? "(00) 0000-0000" : p.mascara;
  if (!m) return d.replace(/(\d{3})(?=\d)/g, "$1 ");
  let out = "", i = 0;
  for (const c of m) {
    if (i >= d.length) break;
    out += c === "0" ? d[i++] : c;
  }
  return out;
}

export const telefoneValido = (digitos: string, p: Pais) =>
  digitos.length >= (p.min ?? 6) && digitos.length <= (p.max ?? 14);
