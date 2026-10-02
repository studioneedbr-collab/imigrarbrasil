import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { env } from "@/lib/env";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { TIPOS_EVENTO_SITE, DISPOSITIVOS_SITE, type TipoEventoSite, type DispositivoSite } from "@/lib/site/conteudo";

export const dynamic = "force-dynamic";

/**
 * O SITE CONTA O QUE ACONTECEU: visita, clique, formulário enviado.
 *
 * ROTA PÚBLICA, SEM TOKEN, e de propósito. Ela é chamada do navegador de quem visita o
 * site — qualquer token aqui estaria no código-fonte da página, à vista, e deixaria de ser
 * segredo. O que a protege é o que ela NÃO faz: só grava uma linha anônima numa tabela de
 * contagem (migration 035). Não cria lead, não lê nada, não devolve nada. O pior que um
 * abuso consegue é inflar um gráfico — e o limite por IP abaixo segura até isso.
 *
 * O site manda por `navigator.sendBeacon` (content-type text/plain), que não espera
 * resposta e não faz preflight. Por isso o corpo é lido como texto.
 */

const RE_ALVO = /^[a-z0-9][a-z0-9:_\-]{0,79}$/;
const evento = z.object({
  tipo: z.enum(TIPOS_EVENTO_SITE as unknown as [TipoEventoSite, ...TipoEventoSite[]]),
  alvo: z.string().trim().toLowerCase().regex(RE_ALVO).nullable().optional(),
  pagina: z.string().trim().max(300).regex(/^\//),
  idioma: z.string().trim().toLowerCase().regex(/^[a-z]{2}$/).nullable().optional(),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  dispositivo: z.enum(DISPOSITIVOS_SITE as unknown as [DispositivoSite, ...DispositivoSite[]]).nullable().optional(),
  origem: z.string().trim().toLowerCase().max(80).nullable().optional(),
});

const ROBO = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp\//i;

function cors(origin: string | null): Record<string, string> {
  if (!origin || !env.siteOrigins.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get("origin"));
  const nada = () => new NextResponse(null, { status: 204, headers });

  if (ROBO.test(req.headers.get("user-agent") ?? "")) return nada();
  // 120 eventos por minuto por IP: muito acima de uma pessoa navegando, muito abaixo de
  // um script tentando entupir a tabela.
  if (!rateLimit(`site-evento:${clientIp(req.headers)}`, { limit: 120, windowSeconds: 60 }).allowed) return nada();

  let bruto: unknown;
  try {
    bruto = JSON.parse((await req.text()).slice(0, 4000));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers });
  }
  const p = evento.safeParse(bruto);
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400, headers });

  try {
    await getRepository().registrarEventoSite({
      tipo: p.data.tipo,
      alvo: p.data.alvo ?? null,
      pagina: p.data.pagina,
      idioma: p.data.idioma ?? null,
      pais: p.data.pais ?? null,
      dispositivo: p.data.dispositivo ?? null,
      origem: p.data.origem ?? null,
    });
  } catch (err) {
    // Contagem que falhou não é motivo para o site ver erro.
    console.error("[site/evento] não gravou:", err instanceof Error ? err.message : err);
  }
  return nada();
}
