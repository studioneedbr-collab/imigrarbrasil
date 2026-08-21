import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createServerClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // O Next.js (App Router) cacheia toda chamada `fetch()` por padrão — e o
      // supabase-js usa fetch por baixo. Sem isto, as LEITURAS (SELECT) voltavam
      // um snapshot ANTIGO: o usuário salvava um dado, dava refresh e ele "sumia"
      // (na verdade estava no banco, mas a leitura vinha do cache do Next). Forçar
      // `cache: "no-store"` em toda query garante leitura sempre fresca do banco.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
