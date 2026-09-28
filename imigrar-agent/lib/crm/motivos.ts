/**
 * A CHAVE NASCE DO RÓTULO, E NÃO É PEDIDA A NINGUÉM.
 *
 * Pedir uma "chave" a quem está criando "Preço alto demais" é pedir vocabulário de banco
 * de dados a quem está descrevendo o próprio trabalho. Pior: chave digitada à mão vira
 * "Preco 2" no dia em que alguém errar, e aí o histórico se divide sem ninguém perceber.
 *
 * O que sai daqui é o que fica gravado no lead PARA SEMPRE — por isso o rótulo continua
 * editável e a chave não (ver a migration 034).
 *
 * Mora fora da rota porque arquivo de rota do Next só pode exportar os handlers: exportar
 * uma função avulsa de lá quebra o build com um erro que não fala de nada disso.
 */
export function chaveDoRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
