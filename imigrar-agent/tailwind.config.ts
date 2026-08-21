import type { Config } from "tailwindcss";

/**
 * Identidade visual da Imigrar Brasil.
 *
 * Toda cor abaixo sai do logotipo (public/marca/logotipo-original.png), amostrada
 * pixel a pixel — não é uma paleta "inspirada", são os valores do arquivo:
 *   #009687  teal   54% da arte (a moldura em L e a palavra BRASIL)
 *   #005EC4  azul   a palavra IMIGRAR
 *   #235A9C  navy   o quarto de círculo
 *   #CCECFB  claro  o arco interno
 *
 * A regra que organiza o resto: TEAL É IDENTIDADE, AZUL É AÇÃO. No logotipo o teal
 * é a massa e o azul é o verbo. No painel, o teal marca o que a Imigrar Brasil é
 * (marca, item ativo, agente no ar) e o azul marca o que a pessoa pode fazer
 * (botão, link, foco). Sem essa separação todo botão vira "cor da marca" e o
 * painel perde hierarquia.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Archivo: grotesca com eixo de largura — usada apertada e larga nos títulos.
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Public Sans: tipografia de sistema de design de governo. É o registro certo
        // para um console que lida com documento, protocolo e prazo o dia inteiro.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // IBM Plex Mono: números de protocolo, datas, códigos de idioma e a faixa MRZ.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ib: {
          /** Texto. Navy do logo levado ao quase-preto para aguentar corpo de texto. */
          ink: "#0D1B2C",
          /** O navy do quarto de círculo, aprofundado: é o rail e os títulos. */
          casa: "#12335C",
          /** O navy literal do logo. Tom médio, usado em degradês e chips. */
          carimbo: "#235A9C",
          /** O azul de IMIGRAR. AÇÃO: botão primário, link, anel de foco. */
          mar: "#005EC4",
          /** O teal de BRASIL. IDENTIDADE: marca, item ativo, agente no ar. */
          selo: "#009687",
          /** O arco claro. Fundo de seleção, tinta de destaque. */
          bruma: "#CCECFB",
          /** Chão da página: branco resfriado na direção da bruma. */
          papel: "#F1F6FA",
          card: "#FFFFFF",
          line: "#DBE6F0",
          slate: "#54677E",
          /**
           * Verde deliberadamente distante do teal da marca. Se "deferido" fosse
           * #009687, todo estado de sucesso pareceria apenas "cor da Imigrar" e a
           * informação se perderia.
           */
          success: "#0F8A5F",
          warn: "#C1740E",
          danger: "#C42C2C",
          violeta: "#6D5BD0",
        },
      },
      keyframes: {
        "signal-ping": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-5px)" },
          "40%, 80%": { transform: "translateX(5px)" },
        },
        "progress-slide": {
          "0%": { transform: "translateX(-100%) scaleX(0.4)" },
          "50%": { transform: "translateX(20%) scaleX(0.7)" },
          "100%": { transform: "translateX(140%) scaleX(0.4)" },
        },
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "-460px 0" },
          "100%": { backgroundPosition: "460px 0" },
        },
        /** Leitura da faixa MRZ: a luz que atravessa o documento sendo conferido. */
        "mrz-scan": {
          "0%": { transform: "translateX(-30%)", opacity: "0" },
          "12%, 78%": { opacity: "1" },
          "100%": { transform: "translateX(130%)", opacity: "0" },
        },
      },
      animation: {
        "signal-ping": "signal-ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
        sweep: "sweep 3.2s linear infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.35s ease-out both",
        "pop-in": "pop-in 0.22s cubic-bezier(0.16,1,0.3,1) both",
        shake: "shake 0.4s cubic-bezier(0.36,0.07,0.19,0.97)",
        "progress-slide": "progress-slide 1.1s ease-in-out infinite",
        "skeleton-shimmer": "skeleton-shimmer 1.4s linear infinite",
        "mrz-scan": "mrz-scan 5.5s cubic-bezier(0.4,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
