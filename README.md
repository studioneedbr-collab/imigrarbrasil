# Imigrar Brasil — agente de IA

Agente de WhatsApp para assessoria jurídica em imigração. Duplicação da base da
Shine Rio, com duas diferenças estruturais: atendimento multi-idioma e base de
conhecimento jurídica própria (RAG sobre as cartilhas oficiais).

```
imigrar-agent/   aplicação Next.js 14 (painel, webhook, orquestração, transbordo)
  IDENTIDADE.md    paleta, tipografia e a faixa MRZ — leia antes de mexer em tela
  public/marca/    logotipos do cliente e o símbolo recortado
ingestao/        pipeline que transforma as cartilhas em PDF na base vetorial
prompt/          system prompt do agente
*.pdf            as 7 cartilhas e a legislação, material do cliente
```

## Rodar localmente

```bash
cd imigrar-agent
npm install
npm run dev          # http://localhost:3000
```

Sobe **sem credencial nenhuma**. O `.env.local` está com as integrações vazias de
propósito e o app degrada sozinho: sem Supabase usa repositório em memória, sem
DeepSeek roda o engine determinístico. Confirme em <http://localhost:3000/api/health>:

```json
{"ok":true,"repo":"memory","persistent":false,"agent":"engine",
 "integrations":{"supabase":false,"zapi":false,"deepseek":false}}
```

**Primeiro acesso:** abra <http://localhost:3000/setup> e crie o administrador
(senha de no mínimo 12 caracteres). A tela se tranca sozinha depois do primeiro
usuário — daí em diante, novos usuários saem de `/dashboard/users`.

**`repo: memory` significa que o admin some quando você reinicia o `npm run dev`.**
Os dados vivem no processo. É aceitável para navegar no painel e mexer em tela;
para ter persistência de verdade, configure o Supabase no `.env.local` e aplique
as migrations de `imigrar-agent/supabase/migrations/`.

### Testes

`npm test` — 507 testes, 52 arquivos, todos passando. Cobrem webhook, sessão, transbordo,
anti-loop e máquina de estados (reaproveitados), a precificação e a CCT (que continuam no
sistema), o atendimento do domínio novo (gatilhos de transbordo jurídico, "não inventar
informação migratória", "não falar de honorários") e, desde que o RAG foi ligado, a
recuperação do material oficial e a detecção de idioma.

## Estado por fase

| fase | estado |
|---|---|
| 1 — duplicação e setup | código pronto; falta **criar as contas**: instância Z-API dedicada, projeto Supabase, chave DeepSeek, deploy e domínio → [docs/COLOCAR-NO-AR.md](imigrar-agent/docs/COLOCAR-NO-AR.md) |
| 2 — base de conhecimento | pipeline pronto e **busca ligada ao agente** (`lib/agent/rag.ts`); falta rodar `embed_upsert.py` contra o Supabase real |
| 3 — camada multi-idioma | **aplicada** — regra de idioma no prompt, detecção persistida no contato (`conversations.idioma`) e transcrição de áudio (`lib/agent/audio.ts`) |
| 4 — prompt e calibragem | **aplicado** — persona, escopo, limite jurídico, gatilhos de transbordo e guardrails no código (`lib/agent/knowledge.ts` e `training.ts`) |
| 5 — transbordo e integração comercial | **parcial** — o encaminhamento aponta para o time jurídico; falta definir horário real, destinatário do aviso e mensagem de fila |
| 6 — homologação e piloto | não iniciada — o roteiro está no passo 8 de [COLOCAR-NO-AR.md](imigrar-agent/docs/COLOCAR-NO-AR.md) |

**Tudo que falta agora depende de conta externa, não de código.** O passo a passo, na
ordem em que um depende do outro, está em
[imigrar-agent/docs/COLOCAR-NO-AR.md](imigrar-agent/docs/COLOCAR-NO-AR.md).

### O que muda quando a base sobe

`/api/health` mostra `rag: true/false`. Enquanto for `false`, a Ana **não responde nada
sobre imigração**: o prompt manda responder só com base no material oficial, então sem
material ela diz que não tem a informação e encaminha todos os casos. É o comportamento
seguro e correto — não é o produto. É o passo 2 do runbook que muda isso.

### O que a Fase 4 mudou, e o que ela NÃO mudou

Mudou a **cabeça** do agente: base de conhecimento, raciocínio, regras de transbordo,
guardrails, blocos que o orquestrador injeta a cada turno, descrições das tools e as
mensagens prontas (follow-up, opt-out, impasse). O agente agora é a Ana, da Imigrar Brasil
— acolhe, informa o que é informação geral e leva o caso concreto ao time jurídico.

Não mudou **nada da maquinaria**: motor de precificação, CCT, proposta em PDF, planilha,
rotas e telas do painel continuam no lugar e testados (471 testes passam). As tools
comerciais seguem existindo, mas a descrição delas manda o agente não usá-las.

Duas coisas a saber antes de testar:

1. **Sem `DEEPSEEK_API_KEY`, o app cai no motor determinístico** (`lib/agent/flow/`), que é
   um menu — e o menu ainda é o comercial herdado, com a porta de entrada rebrandada. Para
   ver a personalidade nova de verdade, configure a chave.
2. **O RAG está ligado no código, mas a base precisa estar carregada.** `lib/agent/rag.ts`
   recupera o material oficial a cada turno e injeta no prompt; sem Supabase, sem
   `OPENAI_API_KEY` ou com a tabela `rag_chunks` vazia, ele devolve vazio em silêncio e o
   agente volta a dizer que não tem a informação. Confira em `/api/health` → `rag`.

## Identidade visual

Aplicada. Paleta tirada pixel a pixel do logotipo, tipografia própria (Archivo /
Public Sans / IBM Plex Mono) e a faixa MRZ como elemento de assinatura. O detalhe
das decisões está em [imigrar-agent/IDENTIDADE.md](imigrar-agent/IDENTIDADE.md).

O atendimento já é o da Imigrar Brasil. O que segue com cara de Shine Rio é a maquinaria
comercial herdada — precificação, CCT, proposta em PDF e as rotas
Propostas/Preços/Orçamento/Funcionários, que saíram do menu mas continuam no disco e nos
testes. Está desligada do agente, e retirá-la do repositório é uma decisão à parte.

## O que NÃO fazer

Não reaproveite as credenciais da Shine Rio no `.env.local` daqui. A instância
Z-API é dedicada por cliente — herdar aquela faz este agente responder pelo
WhatsApp da Shine Rio.
