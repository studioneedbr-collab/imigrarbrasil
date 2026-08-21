# Shine Rio — Agente Comercial (Shayene)

Agente de atendimento no WhatsApp da **Shine Rio** (terceirização de mão de obra, 13 anos, 378 colaboradores, 32 clientes · CNPJ 18.623.185/0001-56). A **Shayene** é o primeiro atendimento de **todos os públicos** no WhatsApp — cliente, funcionário, candidato e operacional — e conduz a venda do orçamento à proposta de forma autônoma.

- **Produção:** `agente.shinerio.com` (painel) · bot real via webhook em `shine-rio-agent.vercel.app`
- **Stack:** Next.js 14 (App Router, TS, Tailwind) · Supabase (Postgres) · Vitest
- **LLM:** DeepSeek (`deepseek-chat`, OpenAI-compatible) · **WhatsApp:** Z-API · **E-mail:** Brevo

---

## Como funciona

**Fluxo:** WhatsApp do cliente → Z-API → `POST /api/webhook/whatsapp` → `respondToConversation` → `runAgent` (DeepSeek conduz, chamando as tools) → resposta enviada pela Z-API.

**Tools do agente:** `calcular_preco_servico`, `gerar_proposta_pdf`, `registrar_dados_lead`, `transferir_para_humano`, `agendar_followup`, `registrar_funcionario`, `enviar_opcoes`.

**Cérebro (`lib/agent/knowledge.ts`):** bloco `AGENT_REASONING` — a Shayene **pensa como atendente** (quem é / o que quer / o que já sei / próximo passo / como falar), **não segue script rígido**. `deepseek.ts` injeta uma REGRA ABSOLUTA no topo do prompt que impede o vazamento de raciocínio interno na resposta.

**Preço (`lib/agent/pricing.ts`):** composição de custos por **CCT do sindicato + lei** (piso → encargos → 13º/férias → provisões → benefícios → tributos/margem/BDI). Só funções com piso cadastrado (`Preços`) cotam valor real; o resto fica "sob consulta". O custo/margem **nunca** vai pro contexto do LLM.

**Persistência:** Repository pattern (`MemoryRepository` / `SupabaseRepository`). Em produção **exige Supabase** — sem ele roda em memória (some no cold start).

---

## Segurança

- Login com rate-limit (IP + e-mail), hash dummy anti-enumeração, cookie `httpOnly`/`secure`/`sameSite=strict`; JWT HS256 com algoritmo travado; `AUTH_SECRET` fail-closed em produção.
- Middleware fail-closed em todo `/api/*` (allowlist exata em `lib/auth/public-paths.ts`).
- **Webhook** exige token (`?token=<WEBHOOK_VERIFY_TOKEN>` na URL da Z-API, ou Client-Token).
- Cron (`/api/cron/*`) fail-closed em produção + comparação timing-safe.
- Scoping de leads por setor no servidor (usuário restrito não lê leads de outros setores).
- E-mail ao RH com HTML escapado + só anexa URL `https`.
- SQL 100% parametrizado (supabase-js), sem XSS, sem SSRF direto, headers/CSP/HSTS configurados (`next.config.mjs`).

---

## Changelog (rodada atual)

### Agente / comportamento
- **`AGENT_REASONING`**: substituiu o fluxo rígido (`FIXED_BEHAVIOR` + `ROTEIRO` + `CRITICAL`) por um bloco de **raciocínio** — pensa como vendedor/atendente e decide a ação.
- **Atende os 4 públicos** (cliente, funcionário, candidato, operacional), não só vende.
- **REGRA ABSOLUTA** no prompt do DeepSeek + 4 guardrails: **elimina raciocínio interno vazado** na resposta.
- **Orçamento**: com serviço + quantidade → calcula em silêncio → **apresenta o preço direto** → pede só nome da empresa + CNPJ (escala padrão, sem se reapresentar).
- Objeções sempre **avançam a venda** (validar → responder → CTA); temperature 0.4; menos robótica (sem frases prontas literais, responde qualquer pergunta, adapta ao cliente).
- **Rede de segurança de roteamento** (`lib/agent/routing-net.ts`): backstop determinístico (a partir do 2º turno) que garante encaminhar operacional/DP; candidato fica com o modelo; comercial nunca cai na rede.
- **Solicitação vs lead**: setor não-comercial aparece como "Solicitação de suporte" no dossiê, não como lead comercial com score de venda.
- **Follow-up inteligente** (`lib/agent/followup.ts`) gerado pelo DeepSeek com contexto.

### Ciclo de vida das conversas
- `ConversationStatus`: `active | waiting | negotiating | transferred | finished | inactive`, gerido automático em `index.ts`.
- **Pausa no handoff + inbox**: conversa transferida = IA pausada (webhook silencia); painel tem "responder como humano" (via Z-API) + toggle "devolver pra IA".
- Dashboard de Conversas com abas por status + tempo/alerta de espera.
- **Migration 008** (`supabase/migrations/008_conversation_status.sql`): CHECK novo + `last_message_at`/`followup_sent_at`/`reopened_at` + índice + cron `/api/cron/followup`.

### Antiban do WhatsApp
O que derruba um número não é volume, é **taxa de bloqueio e denúncia**. A maior proteção continua sendo o desenho: a Shayene é **reativa** — nunca dispara para lista, só responde quem escreveu. Em cima disso:
- **Opt-out** (`lib/agent/opt-out.ts` + **migration 016**): detecção determinística de "para de me mandar mensagem" → despedida única e silêncio permanente naquele número (`conversations.opt_out_at`). "Não tenho interesse" é um nível mais leve (`no_followup_at`): a conversa segue, o follow-up automático não. Se o próprio contato voltar a escrever, o bloqueio é liberado — quem puxou a conversa foi ele.
- **Janela de disparo** (`lib/whatsapp/janela.ts`): mensagem iniciada pela Shine só sai em **dia útil, 8h–20h (Brasília)**. Resposta a quem escreveu continua saindo na hora, inclusive de madrugada.
- **Sem rajada**: os crons mandam **uma por vez**, com intervalo variável de 4–9s, teto por rodada e orçamento de tempo abaixo do `maxDuration`. O que não couber espera a próxima rodada (campo `restantes` na resposta do cron).
- **Ritmo humano no envio**: `delayMessage` de 1–5s ("digitando…"), proporcional ao tamanho do texto (`lib/whatsapp/send.ts`).
- **Crons** (`vercel.json`): `/api/cron/followup` e `/api/cron/followups` de hora em hora, seg–sex, 11h–22h UTC (= 8h–19h no Rio), defasados em 30min para não coincidirem.

### PDF da proposta
- Redesenho **minimalista editorial** (`lib/pdf/generate.ts`): 1 página, tipografia leve, réguas finas, total como número grande com acento azul, números de credibilidade (13/378/32).

### Segurança (auditoria + correções)
- Removidos scripts de teste com `AUTH_SECRET` do git + `.gitignore` (`_*.mts`, `.env*`).
- Webhook: token obrigatório, HTML do e-mail escapado, anexo só `https`, logs de diagnóstico só fora de produção.
- Custo/margem (BDI) fora do retorno da tool pro LLM.
- Cron fail-closed + timing-safe; setup bloqueado em modo-memória-produção; scoping de leads; validação numérica; erros genéricos.

---

## ⚠️ Pendências (ações do responsável)

1. **Rotacionar `AUTH_SECRET`** na Vercel (`openssl rand -hex 32`) — a chave antiga vazou em script de teste; rotacionar invalida cookies forjados.
2. **Rodar a migration 008** no Supabase (senão status + follow-up de 24h ficam inertes).
3. **Webhook**: garantir `WEBHOOK_VERIFY_TOKEN` na Vercel **e** `?token=<valor>` na URL do webhook da Z-API (mesmo valor nos dois).
4. **Reapontar `agente.shinerio.com`** pro deploy de produção mais recente (Vercel → Settings → Domains) — o domínio fica preso em deploy antigo (outro escopo).
5. **Cadastrar os pisos** das funções mais pedidas no painel de **Preços** (senão só o ASG cota valor real).
6. **Rodar a migration 016** (`016_opt_out.sql`) no Supabase. Sem ela o pedido de "para de me mandar mensagem" é detectado e a Shayene se cala **naquela requisição**, mas não fica gravado — no próximo webhook ela volta a responder e o follow-up de 24h sai assim mesmo. O log grita `NÃO consegui registrar o opt-out (rodou a migration 016?)`.
7. **Conferir o plano da Vercel**: cron de hora em hora exige **Pro**. No Hobby o limite é 2 jobs, 1x/dia — aí o `vercel.json` roda só uma vez ao dia e a fila de follow-up escoa devagar (as travas de janela e espaçamento continuam valendo). Alternativa sem trocar de plano: cron externo chamando `/api/cron/followup?secret=<CRON_SECRET>`.

## Pendências de desenvolvimento (a fazer)
- **Entender áudio (voz)**: transcrever notas de voz (precisa de um transcritor tipo Whisper).
- **Rapidez + robustez**: "digitando" imediato + retry/backoff no DeepSeek.
- Scoping por setor também nas **conversas** (hoje só nos leads).
- PDF da proposta com **link assinado/expiração** (hoje é público via UUID).

---

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npx vitest run     # testes (120)
./node_modules/.bin/tsc --noEmit   # typecheck
```

**Deploy:** `./node_modules/.bin/vercel --prod --yes --force` (produção). Env vars (Supabase, DeepSeek, Z-API, Brevo, `AUTH_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `CRON_SECRET`) ficam na Vercel — nunca no git.
