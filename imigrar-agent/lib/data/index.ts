import type { Repository } from "@/lib/data/repository";
import { MemoryRepository } from "@/lib/data/memory-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { useSupabase } from "@/lib/env";

// Persiste o singleton no objeto global para sobreviver ao hot-reload do `next dev`.
// Cada recompilação reavalia este módulo (zerando um `let` de módulo e, com ele, os
// Maps do MemoryRepository), mas não zera `globalThis`. Mesmo padrão recomendado para
// o PrismaClient em Next.js. Mantém a seleção memory|supabase e a interface Repository.
const globalForRepo = globalThis as unknown as { __ibRepository?: Repository };

export function getRepository(): Repository {
  if (globalForRepo.__ibRepository) return globalForRepo.__ibRepository;
  const repo: Repository = useSupabase ? new SupabaseRepository() : new MemoryRepository();
  // eslint-disable-next-line no-console
  console.log(`[data] repository = ${useSupabase ? "supabase" : "memory"} (singleton global)`);
  // Modo memória em produção = perda de dados: no serverless cada requisição pode cair
  // numa instância diferente, e o que foi "salvo" some no refresh. Grita alto no log
  // para não passar despercebido (a causa é faltar NEXT_PUBLIC_SUPABASE_URL /
  // SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do deploy).
  if (!useSupabase && process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error(
      "[data] ⚠️ PRODUÇÃO SEM SUPABASE: rodando em memória — dados NÃO persistem entre " +
        "requisições. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no deploy.",
    );
  }
  globalForRepo.__ibRepository = repo;
  return repo;
}

export type { Repository };
