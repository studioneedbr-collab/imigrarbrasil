// Nomes dos idiomas, em português. Fica no domínio, e não em lib/agent/idioma.ts, para
// que o PAINEL possa usar: aquele módulo importa o repositório, e arrastar a camada de
// dados para dentro do bundle do cliente por causa de uma tabela de rótulos seria caro.

export const NOME_DO_IDIOMA: Record<string, string> = {
  pt: "português", es: "espanhol", en: "inglês", fr: "francês",
  ht: "crioulo haitiano", ar: "árabe", ru: "russo", uk: "ucraniano",
  zh: "chinês", hi: "híndi", bn: "bengali", it: "italiano", de: "alemão",
  nl: "holandês", ja: "japonês", ko: "coreano", tr: "turco", fa: "persa",
  ur: "urdu", wo: "wolof", ln: "lingala", sw: "suaíli", ro: "romeno",
  pl: "polonês", ca: "catalão", gl: "galego",
};

/** Rótulo legível de um código ISO-639-1, com o próprio código como último recurso. */
export function nomeDoIdioma(codigo?: string | null): string | null {
  if (!codigo) return null;
  return NOME_DO_IDIOMA[codigo] ?? codigo;
}
