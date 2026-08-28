# Imigrar Brasil — agente de IA

Agente de WhatsApp para assessoria jurídica em imigração. Nasceu da duplicação de um
agente comercial de terceirização de mão de obra, com duas diferenças estruturais:
atendimento multi-idioma e base de conhecimento jurídica própria (RAG sobre as cartilhas
oficiais). A lógica comercial herdada já saiu de dentro do agente — ver
[o que sobrou da base comercial](#o-que-sobrou-da-base-comercial).

```
imigrar-agent/      aplicação Next.js 14 (painel, webhook, orquestração, transbordo)
  IDENTIDADE.md       paleta, tipografia e a faixa MRZ — leia antes de mexer em tela
  public/marca/       os logotipos já recortados e otimizados para a aplicação
ingestao/           pipeline que transforma o material oficial na base vetorial
material-oficial/   as 7 cartilhas e a legislação — a fonte de tudo que o agente afirma
marca/              os arquivos originais de marca, como o cliente entregou
docs/               documentos de referência (o system prompt da v1)
```

O nome dos PDFs em `material-oficial/` é o mesmo `id` que eles têm em
`ingestao/fontes.json`: `regularizacao-migratoria.pdf` é a fonte `regularizacao`. Trocar
um arquivo é trocar o de mesmo nome — sem espaço, sem caixa alta, sem ter que citar entre
aspas em cada comando.

## Rodar localmente

```bash
npm run setup        # instala as dependências em imigrar-agent/
npm run dev          # http://localhost:3000
```

Os scripts da raiz (`dev`, `build`, `test`, `typecheck`) só encaminham para
`imigrar-agent/` — dá na mesma rodá-los de lá. Existem porque `npm run dev` na raiz é o
reflexo de quem clona o repositório, e antes isso respondia só `ENOENT: package.json`.

**Configuração local:** copie `imigrar-agent/.env.example` para
`imigrar-agent/.env.local`. Sem nada preenchido o painel sobe assim mesmo, em memória —
o que some no reinício. Para ver os dados de verdade, a única variável indispensável é a
`SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys; é a `service_role`,
não a publishable).

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
as migrations com `npm --prefix imigrar-agent run migrar` (aplica só o que falta e grava em
`schema_migrations`; precisa da `DATABASE_URL`, que é a conexão direta com o Postgres — a
`service_role` fala com o PostgREST e não executa DDL).

### Testes

`npm test` — 695 testes, todos passando. Cobrem webhook, sessão, transbordo e
anti-loop, o atendimento do domínio (gatilhos de transbordo jurídico, "não inventar
informação migratória", "não falar de honorários", triagem de nacionalidade/onde a pessoa
está/o que ela procura), a recuperação do material oficial e a detecção de idioma, o CRM (funis e etapas) e o mapa do
atendimento — este último com um teste que falha se o mapa passar a apontar para arquivo que
não existe mais, porque mapa que mente é pior do que mapa nenhum.

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

### O que muda quando não há chave de LLM

**Sem `DEEPSEEK_API_KEY` o app cai no caminho determinístico** (`lib/agent/fallback.ts`).
Ele não é um menu: acolhe em PT/ES, aplica os guardrails (honorários nunca), encaminha ao
time jurídico assim que aparece caso concreto e **não afirma nada sobre procedimento** —
ali não há material oficial na mão, então qualquer frase de requisito ou prazo seria
invenção. Para ver a personalidade completa, configure a chave.

**O RAG está ligado no código, mas a base precisa estar carregada.** `lib/agent/rag.ts`
recupera o material oficial a cada turno e injeta no prompt; sem Supabase, sem
`OPENAI_API_KEY` ou com a tabela `rag_chunks` vazia, ele devolve vazio em silêncio e o
agente volta a dizer que não tem a informação. Confira em `/api/health` → `rag`.

## Identidade visual

Aplicada. Paleta tirada pixel a pixel do logotipo, tipografia própria (Archivo /
Public Sans / IBM Plex Mono) e a faixa MRZ como elemento de assinatura. O detalhe
das decisões está em [imigrar-agent/IDENTIDADE.md](imigrar-agent/IDENTIDADE.md).

## O que sobrou da base comercial

O **agente** está limpo: `lib/agent/` não tem mais precificação, CCT, dimensionamento de
posto, proposta em PDF nem cadastro de funcionário, e as tools correspondentes deixaram de
ser oferecidas ao modelo. A Ana não cota, não propõe e não fala de valor.

A maquinaria em si continua no repositório, **fora do agente**, servindo às telas do
painel:

| onde | o que é | quem usa |
|---|---|---|
| `imigrar-agent/lib/comercial/` | preço, CCT, catálogo de funções, dimensionamento | telas Preços e Orçamento |
| `imigrar-agent/lib/pdf/`, `lib/planilha/`, `lib/email/proposal-email.ts` | proposta em PDF, planilha de composição, e-mail de envio | tela Orçamento |
| rotas `/api/quote*`, `/api/proposal*`, `/api/pricing-params`, `/api/funcionarios` | back-end dessas telas | painel |

As telas **Propostas, Preços, Orçamento e Funcionários saíram do menu** mas seguem no
disco. **Atenção:** o PDF da proposta e o e-mail que o acompanha ainda carregam a marca e
o texto institucional da empresa de origem. Nada do agente os aciona — mas a tela de
Orçamento sim. Se essas telas forem ficar, esse texto precisa ser reescrito antes de
alguém enviar um deles; se forem sair, é uma decisão à parte.

## O que NÃO fazer

Não reaproveite as credenciais do agente que originou este código no `.env.local` daqui. A
instância Z-API é dedicada por cliente — herdar a de outra operação faz este agente
responder pelo WhatsApp dela.
