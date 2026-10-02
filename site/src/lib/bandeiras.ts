// Bandeiras das quatro línguas do site, em SVG desenhado aqui (proporção 3:2).
//
// Não é emoji: no Windows o emoji de bandeira vira as letras "BR", "ES". E não é imagem
// externa: nada carrega de fora para mostrar o popup de idioma.

const svg = (corpo: string) =>
  `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="bandeira">${corpo}</svg>`;

export const BANDEIRA: Record<"pt" | "es" | "en" | "fr", string> = {
  // Brasil
  pt: svg(
    `<rect width="30" height="20" fill="#009c3b"/>` +
      `<path d="M15 2.4 27 10 15 17.6 3 10z" fill="#ffdf00"/>` +
      `<circle cx="15" cy="10" r="4.6" fill="#002776"/>` +
      `<path d="M10.6 9.1c2.9-.5 6.2.2 8.8 1.8" stroke="#fff" stroke-width=".7" fill="none"/>`,
  ),
  // Espanha
  es: svg(`<rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/>`),
  // Estados Unidos (simplificada: listras e cantão)
  en: svg(
    `<rect width="30" height="20" fill="#fff"/>` +
      Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 20) / 6.5}" width="30" height="${20 / 13}" fill="#b22234"/>`).join("") +
      `<rect width="13" height="${(20 / 13) * 7}" fill="#3c3b6e"/>` +
      Array.from({ length: 12 }, (_, i) => `<circle cx="${1.6 + (i % 4) * 3.2}" cy="${1.6 + Math.floor(i / 4) * 3.4}" r=".55" fill="#fff"/>`).join(""),
  ),
  // França
  fr: svg(`<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#002395"/><rect x="20" width="10" height="20" fill="#ed2939"/>`),
};
