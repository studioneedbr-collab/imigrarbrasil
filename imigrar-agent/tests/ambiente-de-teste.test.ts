import { describe, it, expect } from "vitest";
import { useSupabase, useDeepseek } from "@/lib/env";
import { getRepository } from "@/lib/data";
import { MemoryRepository } from "@/lib/data/memory-repository";

// TESTE NÃO FALA COM SERVIÇO REAL.
//
// Este arquivo existe por causa de um acidente concreto: uma execução da suíte com o
// `.env.local` carregado no ambiente do shell trocou o repositório de memória pelo
// Supabase de produção e escreveu 43 leads, 83 conversas e 343 mensagens lá dentro — com
// a service role, que passa por cima de qualquer RLS. Nenhum teste percebeu, porque
// nenhum teste olhava para isso. Foram 47 falhas que pareciam bug de código e eram, na
// verdade, a suíte inteira rodando contra o mundo real.
//
// A proteção mora em `emTeste`, em lib/env.ts. A garantia mora aqui.
//
// A ÚNICA exceção é a suíte de recuperação (`npm run test:rag`), que liga
// SERVICOS_REAIS_NO_TESTE pelo próprio config porque o trabalho dela é justamente
// consultar a base indexada. Ela roda separada e não passa por este arquivo.

describe("a suíte não toca em serviço real", () => {
  it("o repositório é o de memória, mesmo com credenciais do Supabase no ambiente", () => {
    expect(useSupabase).toBe(false);
    expect(getRepository()).toBeInstanceOf(MemoryRepository);
  });

  it("o DeepSeek fica desligado — a suíte testa o motor determinístico, e chamada paga custa dinheiro", () => {
    expect(useDeepseek).toBe(false);
  });

  it("a porta de serviços reais está fechada aqui", () => {
    expect(process.env.SERVICOS_REAIS_NO_TESTE).toBeFalsy();
  });
});
