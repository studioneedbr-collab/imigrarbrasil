/**
 * As seis categorias de serviço do site, pelo NOME — é o nome que cada serviço guarda em
 * `categoria`, e é por ele que o build do site (scripts/puxar-conteudo.mjs) monta a lista
 * de cada categoria. Imagem, texto e endereço de cada uma ficam no site
 * (site/src/data/categorias.json): criar uma categoria nova é mudança de site, não de painel.
 */
export const CATEGORIAS_SITE = [
  "Vistos e Autorizações de Entrada",
  "Autorizações de Residência e Registro",
  "Nacionalidade e Naturalização",
  "Defesa e Regularização Migratória",
  "Consultoria Empresarial e Investimentos",
  "Serviços Documentais e Relocation",
] as const;
