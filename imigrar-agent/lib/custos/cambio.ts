// O DÓLAR, EM UM LUGAR SÓ.
//
// A cotação vem de variável de ambiente, e não de uma API de câmbio, por um motivo
// prático: o custo médio por conversa é usado para fechar preço com cliente, e um número
// que muda entre dois carregamentos da mesma tela não serve para isso. Uma cotação fixa,
// escolhida por alguém e ESCRITA NA TELA ao lado do valor, é honesta; uma cotação viva
// sem carimbo é um número que ninguém consegue reproduzir depois.
//
// Quem quiser precisão maior troca `USD_BRL` e o painel inteiro acompanha.

const PADRAO = 5.4;

export interface Cambio {
  usdBrl: number;
  /** Verdadeiro quando alguém escolheu a cotação. Falso = está usando o padrão do código. */
  configurado: boolean;
}

export function cambio(): Cambio {
  const bruto = Number(process.env.USD_BRL);
  if (Number.isFinite(bruto) && bruto > 0) return { usdBrl: bruto, configurado: true };
  return { usdBrl: PADRAO, configurado: false };
}

export function emReais(usd: number, taxa: number = cambio().usdBrl): number {
  return usd * taxa;
}
