import type { Metadata } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Três papéis, três vozes — nenhuma delas a fonte padrão de dashboard.
 *
 * Archivo carrega os títulos: grotesca com eixo de largura, desenhada para manchete,
 * dá autoridade sem ficar fria. Public Sans é o corpo: é a tipografia de um sistema
 * de design de governo, e o registro combina com um console que passa o dia em
 * documento, protocolo e prazo. IBM Plex Mono é a régua: número de protocolo, data,
 * código de idioma e a faixa MRZ — tudo que precisa alinhar em coluna.
 */
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["wdth"],
  display: "swap",
});
const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Imigrar Brasil · Central de Atendimento",
  description:
    "Console do agente da Imigrar Brasil — conversas por idioma, qualificação do caso, base jurídica e encaminhamento ao time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
