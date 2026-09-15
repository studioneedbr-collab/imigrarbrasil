/** @type {import('next').NextConfig} */

// Painel interno com PII de clientes: o navegador recebe instruções explícitas
// sobre o que pode e o que não pode fazer com estas páginas.
const securityHeaders = [
  // Nada aqui deve ser embutido em iframe de terceiros (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // O painel não usa câmera, microfone nem geolocalização.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Força HTTPS por 2 anos. Só surte efeito em resposta servida via HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline'/'unsafe-eval' são exigidos pelo runtime do Next 14 no
      // App Router; sem nonce por request ainda não dá para removê-los.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // data:/blob: são necessários para os PDFs de proposta.
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Só a própria origem: o front nunca chama Supabase nem Anthropic direto
      // do browser — tudo passa pelas rotas de API.
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  // Não anuncia o framework no header X-Powered-By.
  poweredByHeader: false,

  // OS SETE PDFs PRECISAM VIAJAR COM A FUNÇÃO DE DOWNLOAD.
  //
  // Eles ficam em material-oficial/, na raiz do repositório — um nível acima desta pasta. A
  // rota os lê por caminho montado em runtime, e o rastreamento de arquivos do Next não vê
  // caminho montado: sem esta entrada, baixar uma das sete cartilhas funciona perfeitamente
  // na máquina de quem programou e responde 404 na Vercel, que é o pior jeito de descobrir.
  //
  // O escopo é a rota, e não o app inteiro, de propósito: são ~21 MB, e não há razão para
  // carregá-los dentro de toda função serverless do painel.
  experimental: {
    outputFileTracingIncludes: {
      "/api/material-oficial/arquivo": ["../material-oficial/**/*.pdf"],
      // A sincronização lê os mesmos PDFs para empurrá-los ao Supabase. Sem esta segunda
      // entrada ela responderia "arquivo não encontrado" para os sete, justamente no
      // ambiente onde a sincronização precisa acontecer.
      "/api/material-oficial/sincronizar": ["../material-oficial/**/*.pdf"],
    },
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
