/**
 * Rate limiter de janela deslizante, em memória.
 *
 * Limitação conhecida e aceita: o estado vive no processo. Em serverless, cada
 * instância tem o seu contador, então o limite efetivo é (limite × instâncias
 * ativas). Isso corta ataque de força bruta de origem única — que é o caso real
 * contra um painel interno — mas não é uma defesa distribuída. Se o painel for
 * exposto a tráfego hostil de verdade, trocar por Upstash Redis ou Vercel WAF.
 */

interface Hit {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Hit>();

// Sem TTL ativo o Map cresceria sem limite (DoS por memória): cada consulta
// aproveita para varrer e descartar janelas já expiradas.
function sweep(now: number) {
  for (const [key, hit] of Array.from(buckets.entries())) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  now: number = Date.now(),
): RateLimitResult {
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

export function resetRateLimit() {
  buckets.clear();
}

/**
 * IP do cliente. Na Vercel, x-forwarded-for é preenchido pela borda e o primeiro
 * item é o cliente real. Confiar nesse header só é seguro porque a aplicação
 * sempre roda atrás do proxy da Vercel — fora dele, seria falsificável.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "desconhecido";
}
