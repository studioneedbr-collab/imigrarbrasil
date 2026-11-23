// O QUE A AGENTE LÊ A CADA MENSAGEM — medido.
//
// O treino é montado de várias telas (identidade, empresa, objeções, regras, raciocínio,
// técnico, FAQ, briefing, material oficial) e chega ao modelo como um texto só. Ninguém
// via esse texto inteiro, e foi assim que ele cresceu para ~20 mil tokens com seções
// repetidas: "O LIMITE — ISTO NÃO É CONSULTORIA JURÍDICA" e "DE ONDE VEM O QUE VOCÊ DIZ"
// aparecem duas vezes, vindas de telas diferentes. Duas versões da mesma regra não somam:
// competem, e quando divergem o modelo escolhe uma sem avisar.

const TITULO = /^═+\s*(.+?)\s*═+$/gm;

export interface DiagnosticoDoTreino {
  caracteres: number;
  /** Estimativa grosseira (≈ 4 caracteres por token em português). Serve para ordem de grandeza. */
  tokensAprox: number;
  secoes: number;
  repetidas: { titulo: string; vezes: number }[];
}

const normalizar = (t: string) =>
  t
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*[—–-]\s*/g, " — ")
    .replace(/\s+/g, " ")
    .trim();

export function diagnosticarPrompt(texto: string): DiagnosticoDoTreino {
  const contagem = new Map<string, { titulo: string; vezes: number }>();
  let secoes = 0;
  for (const m of texto.matchAll(TITULO)) {
    secoes++;
    const chave = normalizar(m[1]);
    const atual = contagem.get(chave);
    if (atual) atual.vezes++;
    else contagem.set(chave, { titulo: m[1].trim(), vezes: 1 });
  }
  return {
    caracteres: texto.length,
    tokensAprox: Math.round(texto.length / 4),
    secoes,
    repetidas: [...contagem.values()].filter((c) => c.vezes > 1),
  };
}
