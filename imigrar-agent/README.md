# Imigrar Brasil — agente de atendimento (Ana)

Agente de WhatsApp da **Imigrar Brasil**, assessoria jurídica em imigração **para o
Brasil**. A **Ana** é o primeiro atendimento: ela **acolhe**, **informa o que é informação
geral** com base no material oficial e **encaminha ao time jurídico** quando o caso exige
análise — nessa ordem, e nunca fora dela.

- **Stack:** Next.js 14 (App Router, TS, Tailwind) · Supabase (Postgres) · Vitest
- **LLM:** DeepSeek (`deepseek-chat`, OpenAI-compatible) · **WhatsApp:** Z-API · **E-mail:** Brevo

Identidade visual, paleta e a faixa MRZ: [IDENTIDADE.md](IDENTIDADE.md). Como colocar no
ar: [docs/COLOCAR-NO-AR.md](docs/COLOCAR-NO-AR.md).

---

## Como funciona

**Fluxo:** WhatsApp da pessoa → Z-API → `POST /api/webhook/whatsapp` →
`respondToConversation` → `runAgent` (DeepSeek conduz, chamando as tools) → resposta pela
Z-API.

**Tools da Ana** (`lib/agent/tools.ts`): `registrar_dados_lead`,
`transferir_para_humano`, `buscar_material_oficial`, `agendar_followup`, `enviar_opcoes`.

**Cérebro** (`lib/agent/knowledge.ts`): o bloco `AGENT_REASONING` — ela **pensa como quem
faz primeiro atendimento numa assessoria jurídica** (em que idioma escreveram / isso é
informação geral ou é o caso dela / eu tenho isso na mão / o que já me contaram / qual o
próximo passo útil), **não segue script**. `deepseek.ts` injeta duas REGRAS ABSOLUTAS no
topo do prompt: responder no idioma da pessoa e nunca vazar raciocínio interno.

**De onde vem o que ela diz** (`lib/agent/rag.ts`): a cada turno o sistema recupera
trechos das cartilhas oficiais e da legislação e injeta no prompt. **Sem material, ela não
responde**: diz que não tem a informação e oferece o encaminhamento. Inventar regra
migratória é o único erro grave que existe aqui — a pessoa toma decisão de vida com o que
ela disser.

**Sem chave de LLM** (`lib/agent/fallback.ts`): o atendimento não fica sem resposta. O
caminho determinístico acolhe, aplica os guardrails e encaminha ao time jurídico assim que
há caso — e não informa nada sobre procedimento, porque ali não há material na mão.

**Persistência:** Repository pattern (`MemoryRepository` / `SupabaseRepository`). Em
produção **exige Supabase** — sem ele roda em memória e some no cold start.

## O limite do atendimento

Isto não é consultoria jurídica, e a fronteira está no código, não só no prompt:

- **`transfer-gate.ts`** libera o encaminhamento na hora diante de qualquer sinal de caso
  concreto (situação irregular, processo, refúgio, prazo, honorários, risco). O único
  freio é contra despachar quem acabou de mandar "oi".
- **Honorários nunca saem do agente.** Valor e contratação são sempre do time jurídico.
- **Nunca se pede documento**: número, foto, senha ou dado bancário. Isso é do time
  jurídico, depois.
- **Idioma**: a resposta sai na língua em que a pessoa escreveu e assim fica até o fim; o
  idioma é gravado no contato (`conversations.idioma`) para o follow-up automático e para
  o atendente humano do painel.

## O que veio da base comercial e onde está

Este código nasceu da duplicação de um agente comercial de terceirização de mão de obra.
O que sobrou dela **não está mais dentro do agente**:

- `lib/comercial/` — motor de precificação, CCT, catálogo de funções e dimensionamento de
  posto. Serve às telas do painel (Propostas, Preços, Orçamento, Funcionários), que saíram
  do menu mas continuam no disco. **A Ana não chama nada disso.**
- `lib/pdf/`, `lib/planilha/`, `lib/email/proposal-email.ts` — proposta em PDF, planilha de
  composição e o e-mail que a acompanha. **Ainda saem com a marca e o texto institucional
  da empresa de origem**; nada do agente os aciona, mas a tela de Orçamento sim. Se essas
  telas forem ficar, esse texto precisa ser reescrito antes de alguém enviar um deles.

---

## Segurança

- Login com rate-limit (IP + e-mail), hash dummy anti-enumeração, cookie
  `httpOnly`/`secure`/`sameSite=strict`; JWT HS256 com algoritmo travado; `AUTH_SECRET`
  fail-closed em produção.
- Middleware fail-closed em todo `/api/*` (allowlist exata em `lib/auth/public-paths.ts`).
- **Webhook** exige token (`?token=<WEBHOOK_VERIFY_TOKEN>` na URL da Z-API, ou Client-Token).
- Cron (`/api/cron/*`) fail-closed em produção + comparação timing-safe.
- Scoping por setor no servidor (usuário restrito não lê contatos de outros setores).
- SQL 100% parametrizado (supabase-js), headers/CSP/HSTS em `next.config.mjs`.
- **LGPD:** a situação migratória de alguém é dado sensível. O resumo do atendimento
  nunca vai para o log — só motivo, prioridade e setor.

## Antiban do WhatsApp

O que derruba um número não é volume, é **taxa de bloqueio e denúncia**. A maior proteção
é o desenho: a Ana é **reativa** — nunca dispara para lista, só responde quem escreveu.
Em cima disso:

- **Opt-out** (`lib/agent/opt-out.ts` + **migration 016**): detecção determinística de
  "para de me mandar mensagem" → despedida única e silêncio permanente naquele número. "Não
  tenho interesse" é um nível mais leve: a conversa segue, o follow-up automático não. Se o
  próprio contato voltar a escrever, o bloqueio é liberado.
- **Janela de disparo** (`lib/whatsapp/janela.ts`): mensagem iniciada pelo sistema só sai
  em dia útil, 8h–20h (Brasília). Resposta a quem escreveu sai na hora, inclusive de
  madrugada — e aqui isso importa: metade de quem escreve está em outro fuso.
- **Sem rajada**: os crons mandam uma por vez, com intervalo variável de 4–9s e teto por
  rodada. O que não couber espera a próxima.
- **Ritmo humano no envio**: `delayMessage` de 1–5s ("digitando…"), proporcional ao
  tamanho do texto (`lib/whatsapp/send.ts`).

---

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npx vitest run     # suíte completa
npx tsc --noEmit   # typecheck
```

Sobe **sem credencial nenhuma**: sem Supabase usa repositório em memória, sem DeepSeek roda
o caminho determinístico. Confira em `/api/health`.

**Deploy:** Vercel. Env vars (Supabase, DeepSeek, Z-API, Brevo, `AUTH_SECRET`,
`WEBHOOK_VERIFY_TOKEN`, `CRON_SECRET`) ficam na Vercel — nunca no git.
