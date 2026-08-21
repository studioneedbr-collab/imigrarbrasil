import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { verifyPassword, hashPassword, needsRehash, DUMMY_HASH } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const INVALID = () =>
  NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json(
    { error: "Muitas tentativas. Tente novamente em alguns minutos." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );

export async function POST(req: NextRequest) {
  // Dois limites: por IP (barra varredura de muitos e-mails de uma mesma origem)
  // e por e-mail (barra ataque distribuído contra uma conta específica).
  const byIp = rateLimit(`login:ip:${clientIp(req.headers)}`, { limit: 10, windowSeconds: 300 });
  if (!byIp.allowed) return tooMany(byIp.retryAfterSeconds);

  let email: string, password: string;
  try {
    const parsed = loginSchema.parse(await req.json());
    email = parsed.email.toLowerCase().trim();
    password = parsed.password;
  } catch {
    return INVALID();
  }

  const byEmail = rateLimit(`login:email:${email}`, { limit: 5, windowSeconds: 900 });
  if (!byEmail.allowed) return tooMany(byEmail.retryAfterSeconds);

  try {
    const repo = getRepository();
    const user = await repo.getUserByEmail(email);

    if (!user || !user.active) {
      verifyPassword(password, DUMMY_HASH); // gasta o mesmo tempo de um login real
      return INVALID();
    }
    if (!verifyPassword(password, user.passwordHash)) return INVALID();

    // Migra hashes de custo antigo de forma transparente, no único momento em
    // que a senha em claro está disponível.
    if (needsRehash(user.passwordHash)) {
      try {
        await repo.updateUserPassword(user.id, hashPassword(password));
      } catch (err) {
        console.error("[auth:login] falha ao regravar hash:", err instanceof Error ? err.message : err);
      }
    }

    const token = await createSession({ sub: user.id, email: user.email, role: user.role });
    cookies().set(SESSION_COOKIE, token, sessionCookieOptions());

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Nunca logar o payload: ele contém a senha em claro e iria para os logs da Vercel.
    console.error("[auth:login] erro inesperado:", err instanceof Error ? err.message : "desconhecido");
    return INVALID();
  }
}
