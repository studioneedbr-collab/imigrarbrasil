import { NextResponse, type NextRequest } from "next/server";
// IMPORT RELATIVO, e não pelo alias `@/`, só aqui.
//
// O build de produção na Vercel morria com "The Edge Function 'middleware' is
// referencing unsupported modules: @/lib/auth/session, @/lib/auth/public-paths".
// Não era módulo incompatível: o bundler do Edge não RESOLVIA o alias. O middleware é
// empacotado dentro de um namespace próprio (`__vc__ns__/0/imigrar-agent/`), a base do
// `@/*` deixa de bater, e o que não resolve vira "externo" — ou seja, "não suportado".
//
// O `baseUrl` no tsconfig.json resolve a causa. Este import relativo é o cinto além do
// suspensório: é o único arquivo do projeto que roda no Edge, e é o arquivo cuja falha
// impede o deploy inteiro de acontecer — não vale depender de resolução de alias aqui.
import {
  verifySession,
  createSession,
  shouldRenew,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "./lib/auth/session";
import { isPublicPath } from "./lib/auth/public-paths";

// Ponto único de autenticação. O matcher abaixo cobre TODA a superfície de dados:
// páginas do painel e, principalmente, /api/* — que antes respondia a qualquer um.
// Regra fail-closed: só passa sem sessão quem está na allowlist explícita.
// Respostas de API nunca podem ser cacheadas pelo navegador: senão o usuário salva
// um dado, dá refresh e a tela reexibe a resposta ANTIGA em cache (parece que "sumiu",
// quando na verdade está no banco). Força leitura fresca em todo /api/*.
function withNoStore(res: NextResponse, pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return withNoStore(NextResponse.next(), pathname);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // API responde 401 em JSON; página redireciona para o login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = withNoStore(NextResponse.next(), pathname);

  // Janela deslizante: passada a metade da validade, regrava o cookie com prazo
  // cheio. É o que faz quem usa o painel todo dia nunca reencontrar o login.
  // Só o cookie é renovado — o conteúdo da sessão continua sendo o que foi
  // assinado no login, então isto não é caminho para elevar papel.
  if (shouldRenew(session)) {
    const renovado = await createSession({
      sub: session.sub,
      email: session.email,
      role: session.role,
    });
    res.cookies.set(SESSION_COOKIE, renovado, sessionCookieOptions());
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/simulate/:path*", "/api/:path*"],
};
