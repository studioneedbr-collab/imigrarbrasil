# Imigrar Brasil — agente de atendimento (Ana)

Agente de WhatsApp da **Imigrar Brasil**, assessoria jurídica em imigração **para o
Brasil**. A **Ana** é o primeiro atendimento: ela **acolhe**, **informa o que é informação
geral** com base no material oficial e **encaminha ao time jurídico** quando o caso exige
análise — nessa ordem, e nunca fora dela.

- **Stack:** Next.js 14 (App Router, TS, Tailwind) · Supabase (Postgres) · Vitest
- **Painel:** uma **fila de prazos** — ver [O painel](#o-painel-uma-fila-de-prazos-não-um-funil)
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

## O painel: uma fila de prazos, não um funil

A tela inicial responde a uma pergunta — **o que vence primeiro?** — e é a diferença mais
importante entre este painel e o funil de vendas que originou o código.

Boa parte dos casos de maior valor chega com **prazo processual correndo**: multa
migratória, indeferimento de refúgio, notificação de saída do país. Esses prazos são
curtos e fatais. Ordenar por "lead mais recente", como fazia a base comercial, é o desenho
que faz alguém perder um prazo.

**Três blocos, nesta ordem** (`lib/fila/ordenacao.ts`, com teste):

1. **Prazo a confirmar** — a IA sinalizou prazo, ninguém confirmou a data ainda.
   Prioridade máxima e **sem contador**. Some quando esvazia.
2. **Prazos correndo** — data confirmada, ordenados por data limite crescente. Três
   faixas: crítico (≤3 dias), atenção (4–7), acompanhamento (8+). Vencido continua
   visível até alguém fechar.
3. **Fila normal** — judicial primeiro, depois administrativo e exterior, e **do mais
   antigo para o mais recente**: lead parado é lead esfriando.

`CURIOSO`, `DPU` e `FORA_ESCOPO` **não aparecem na fila** — vão para
**/dashboard/filtradas**, que existe para auditoria por amostragem e para resgatar quem o
agente descartou por engano.

### A regra que sustenta tudo: a IA sinaliza, o humano confirma

A Ana marca `tem_prazo_correndo`. Ela **nunca** calcula ou grava data de notificação ou
data limite — quem recebeu o papel raramente sabe a data de cabeça, confunde com o dia em
que abriu a carta e manda foto ilegível. Um contador regressivo em cima de data inferida
pelo modelo é exatamente como se perde um prazo.

A garantia não é um comentário no prompt, são quatro camadas:

- a tool `registrar_dados_lead` não tem campo de data;
- `upsertLead` e `updateLead` descartam datas de prazo venham de onde vierem
  (`lib/data/prazo.ts`);
- só `confirmarPrazo` grava, e **exige o autor**;
- o CHECK `leads_prazo_confirmado_ck` (**migration 019**) recusa, no banco, data sem quem
  confirmou.

### Métricas: tempo do time, não receita

Não há gráfico de faturamento, ticket médio ou previsão. O que **/dashboard/metricas**
mede (`lib/metricas/`):

- conversas atendidas no período, **por idioma**;
- quantas foram **filtradas** — o número que justifica o projeto;
- leads qualificados entregues, por classificação;
- **taxa de resgate** — o número que *protege* o projeto: um agente que filtra demais
  parece ótimo (pouca conversa chegando) e está destruindo o negócio em silêncio;
- taxa de reclassificação — quanto o humano discorda da IA;
- tempo até o primeiro contato humano, **separado para os casos com prazo**;
- **prazos perdidos** — precisa ser zero, e fica visível.

### Acesso

`advogado` (tudo), `atendente` (fila e detalhe, **sem exportação**) e `admin` (mais
usuários, retenção e log de acesso) — `lib/auth/papeis.ts`. Nenhuma rota responde sem
sessão. Abrir um lead e exportar viram linha em `access_log`, com autor, papel e IP; a
exportação exige escopo explícito (não existe "baixar a base"). A retenção dos descartados
é configurável em **/dashboard/acesso**, e quem foi resgatado nunca é apagado por ela.

## O que saiu da base comercial

Este código nasceu da duplicação de um agente comercial de terceirização de mão de obra.
Essa operação **foi removida**, não escondida: telas de Propostas, Preços, Orçamento,
Funcionários, Clientes e o Kanban de Leads; as rotas de API correspondentes; e
`lib/comercial/`, `lib/pdf/`, `lib/planilha/` e o e-mail de proposta — junto com o texto
institucional da empresa de origem que vinha dentro deles. Os campos de produto do lead
(nº de postos, valor estimado, escala) saíram do domínio. As tabelas antigas continuam no
banco; o app não as lê mais.

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
- **LGPD:** a situação migratória de alguém é dado sensível — em alguns casos, informação
  que exposta causa dano real à pessoa. O resumo do atendimento nunca vai para o log de
  aplicação (só motivo, prioridade e setor); leitura de detalhe e exportação ficam
  registradas em `access_log`; e há política de retenção para as conversas descartadas.

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
