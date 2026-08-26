# Imigrar Brasil — o projeto inteiro

Documento de contexto. Serve para quem chega agora (ou para nós daqui a três meses)
entender **o que é isto, por que foi feito assim, o que já está pronto e o que falta** —
sem precisar reconstituir conversa de WhatsApp.

Última atualização: **26/08/2026**.

---

## 1. O que é

Assessoria jurídica em imigração **para o Brasil**. O produto é a **Ana**: um agente de
WhatsApp que faz o primeiro atendimento — acolhe, informa o que é informação geral com
base em material oficial, e **encaminha ao time jurídico** quando o caso exige análise.
Nessa ordem, e nunca fora dela.

Junto vem um **painel interno**, onde o time trabalha os casos que a Ana levantou.

**Quem atende do lado humano:** Walter (advogado). Ele confirmou por WhatsApp em
26/08/2026 que **é ele quem confirma os prazos**.

**O número:** `11 91985-4664`. É a linha que a Ana atende — tudo será concentrado nela.
Quando precisa, o Walter puxa o contato para o número pessoal dele de advogado.

> ⚠️ **Pendência conhecida.** O aviso de "prazo a confirmar" **não pode ir para o 4664**,
> porque esse é o número da própria Ana — seria a linha mandando mensagem para si mesma, e
> o alerta se misturaria com as conversas dos clientes. Falta o Walter mandar o número
> pessoal de advogado dele, que entra em `TEAM_WHATSAPP`. Sem isso, o bloco 1 do painel só
> é visto por quem abrir o painel.

---

## 2. De onde este código veio (e por que isso importa)

O repositório nasceu da **duplicação do agente comercial da Shine Rio**, uma empresa de
terceirização de mão de obra (limpeza, portaria, zeladoria). Quase todo comportamento
estranho que você encontrar tem essa origem.

O que **já foi removido** (branch `fila-de-prazos`, 26/08):

- telas de Propostas, Preços, Orçamento, Funcionários, Clientes e o Kanban de Leads;
- as rotas de API correspondentes;
- `lib/comercial/` (motor de preços, CCT, catálogo de funções), `lib/pdf/`,
  `lib/planilha/` e o e-mail de proposta — que **ainda saíam com o texto institucional da
  empresa de origem**;
- os campos de produto do lead: nº de postos, valor estimado, escala;
- o link público do PDF de proposta, que era a única rota que respondia sem sessão.

O que **sobrou de propósito**: as tabelas antigas continuam no banco (o app não as lê), e
alguns campos legados do lead foram **reaproveitados** com leitura deste domínio —
`client_type` guardava tipo de cliente e hoje espelha a nacionalidade, `contract_duration`
virou a situação documental. Está documentado no código onde acontece.

---

## 3. A ideia central: é uma FILA DE PRAZOS, não um funil

Esta é a decisão que organiza o produto inteiro.

O painel da Shine era um funil de vendas: ordenava por lead mais recente, media conversão,
tratava todo contato como oportunidade equivalente. **Aqui isso mata gente de fome
jurídica.** Boa parte dos casos de maior valor chega com **prazo processual correndo** —
multa migratória, indeferimento de refúgio, notificação de saída do país. Prazos curtos e
fatais. Um painel que ordena por "mais recente" é o desenho que faz alguém perder um prazo.

A tela inicial responde a **uma** pergunta: *o que vence primeiro?*

### Os três blocos

| | bloco | conteúdo | ordem |
|---|---|---|---|
| 1 | **Prazo a confirmar** | prazo sinalizado pela IA, data ainda não confirmada | mais antigo primeiro |
| 2 | **Prazos correndo** | data confirmada por humano | data limite crescente |
| 3 | **Fila normal** | o resto do trabalho | judicial → administrativo → exterior, mais parado no topo |

O bloco 1 vem **antes** do bloco 2 mesmo quando o bloco 2 tem caso vencendo amanhã: prazo
confirmado é risco medido, prazo sem data é risco de tamanho desconhecido.

Faixas do bloco 2: **crítico** (≤3 dias), **atenção** (4–7), **acompanhamento** (8+),
**vencido** (continua visível até alguém fechar). A cor mais forte da interface pertence ao
prazo e a nada mais.

O bloco 3 ordena do **mais antigo para o mais recente** — ao contrário do funil. Lead
parado é lead esfriando.

Código: `lib/fila/ordenacao.ts` (puro, com teste). A tela só desenha.

### A regra que sustenta tudo: **a IA sinaliza, o humano confirma**

A Ana marca `tem_prazo_correndo`. Ela **nunca** calcula, deduz ou grava data de notificação
ou data limite.

Não é preciosismo — é o que acontece na prática: quem recebeu o papel raramente sabe a data
de cabeça, confunde com o dia em que abriu a carta ou em que alguém traduziu, e a foto
costuma vir ilegível. Uma data errada vira **contador regressivo** na tela de quem vai
cuidar do caso, e aí o erro não parece erro: parece tranquilidade.

São **quatro camadas**, não um pedido no prompt:

1. a tool `registrar_dados_lead` não tem campo de data;
2. `upsertLead` e `updateLead` descartam datas de prazo venham de onde vierem
   (`lib/data/prazo.ts`);
3. só `confirmarPrazo` grava — e **exige o autor**;
4. o CHECK `leads_prazo_confirmado_ck` recusa, no banco, data sem quem confirmou.

*(Camada 4 testada de verdade contra o banco de produção em 26/08: recusou.)*

---

## 4. Classificação

A Ana classifica cada conversa. Quatro entram na fila, três saem dela.

| classificação | significado | vai para |
|---|---|---|
| `QUENTE_PRAZO` | prazo processual correndo | fila (bloco 1 ou 2) |
| `QUENTE_JUDICIAL` | exige ação judicial | fila (bloco 3, topo) |
| `MORNO_ADMINISTRATIVO` | caso viável, sem urgência | fila (bloco 3) |
| `EXTERIOR_VISTO` | pessoa fora do Brasil | fila (bloco 3) |
| `DPU` | perfil de gratuidade → Defensoria | **Filtradas** |
| `CURIOSO` | sem caso concreto | **Filtradas** |
| `FORA_ESCOPO` | outro país, outra área | **Filtradas** |

**A heurística determinística só esquenta, nunca esfria.** `lib/agent/classificacao.ts`
pode subir um lead para QUENTE_PRAZO ou QUENTE_JUDICIAL, mas **nunca** devolve CURIOSO, DPU
ou FORA_ESCOPO. Filtrar por regex é como se descarta em silêncio quem precisava de ajuda.
Descartar é decisão explícita do modelo, e revisável.

**Lead sem classificação não some**: fica no fim do bloco 3, à vista.

### A aba Filtradas existe para auditoria

Não é lixeira. Alguém revisa por amostragem se a Ana está descartando gente que não devia, e
**resgata** quem foi descartado por engano. Quando um humano tira um lead do descarte, isso
é gravado como resgate — e alimenta a métrica abaixo.

---

## 5. Métricas: tempo do time, não receita

Não existe gráfico de faturamento, ticket médio ou previsão. O que se mede:

- conversas atendidas no período, **por idioma**;
- quantas foram **filtradas** — *o número que justifica o projeto*;
- leads qualificados entregues, por classificação;
- **taxa de resgate** — *o número que protege o projeto*;
- taxa de reclassificação (quanto o humano discorda da IA);
- tempo até o primeiro contato humano, **separado para os casos com prazo**;
- **prazos perdidos** — precisa ser zero, e fica visível.

> **Por que a taxa de resgate é a métrica mais importante.** Um agente que filtra demais
> parece ótimo nos números: pouca conversa chegando ao time, todo mundo elogiando a
> economia. E está destruindo o negócio em silêncio, porque quem precisava de ajuda foi
> descartado sem ninguém ver. A taxa de resgate é o único jeito de perceber isso cedo.
> **Se ela sobe, a Ana está descartando demais.**

Código: `lib/metricas/`.

---

## 6. Acesso e dados sensíveis

Este painel guarda situação migratória — incluindo pessoas em situação irregular e
solicitantes de refúgio. É dado pessoal sensível sob a LGPD e, em alguns casos, informação
que **exposta causa dano real à pessoa**. Não é cadastro de cliente.

**Papéis** (`lib/auth/papeis.ts`):

| papel | pode |
|---|---|
| `advogado` | tudo: fila, detalhe, métricas, exportação |
| `atendente` | fila e detalhe. **Não exporta.** |
| `admin` | tudo isso + usuários, retenção e log de acesso |

O papel legado `user` é lido como `atendente` — o mais restrito. Nenhuma migration promove
ninguém.

**Garantias:**

- nenhuma rota responde sem sessão (allowlist exata em `lib/auth/public-paths.ts`);
- abrir um lead e exportar viram linha em `access_log`, com autor, papel, IP e data;
- **não existe exportação da base inteira** — o escopo é obrigatório;
- retenção configurável para as conversas descartadas, e **quem foi resgatado nunca é
  apagado por ela**.

---

## 7. Como o agente funciona

```
WhatsApp da pessoa → Z-API → POST /api/webhook/whatsapp
  → respondToConversation → runAgent (DeepSeek conduz, chamando as tools)
  → resposta pela Z-API
```

**Tools** (`lib/agent/tools.ts`): `registrar_dados_lead`, `transferir_para_humano`,
`buscar_material_oficial`, `agendar_followup`, `enviar_opcoes`.

**Cérebro** (`lib/agent/knowledge.ts`): a Ana **pensa como quem faz primeiro atendimento**,
não segue script. Duas regras absolutas injetadas no topo do prompt: responder no idioma da
pessoa, e nunca vazar raciocínio interno.

**De onde vem o que ela diz** (`lib/agent/rag.ts`): a cada turno o sistema recupera trechos
das cartilhas oficiais e da legislação. **Sem material, ela não responde** — diz que não tem
a informação e oferece o encaminhamento. Inventar regra migratória é o único erro grave que
existe aqui: a pessoa toma decisão de vida com o que ela disser.

**O dossiê se preenche sozinho** (`lib/agent/triagem.ts` + `lead-capture.ts`): leitura
determinística a todo turno, em português, espanhol e inglês. Existe porque o modelo esquece
de chamar a tool, e aí o painel ficava em "Coletando…" enquanto a pessoa já tinha contado
tudo.

**Idioma**: detectado e gravado no contato. Importa em dois lugares que o prompt não alcança
— o follow-up automático (que sairia sempre em português) e o atendente humano, que precisa
saber em que língua responder **antes** de abrir a conversa. Por isso o código do idioma é a
primeira coisa em cada linha da fila.

**Antiban do WhatsApp**: a Ana é reativa (nunca dispara para lista), tem opt-out
determinístico, janela de envio 8h–20h em dia útil para mensagens iniciadas pelo sistema,
sem rajada nos crons, e ritmo humano no envio.

---

## 8. Stack e estrutura

**Next.js 14** (App Router, TS, Tailwind) · **Supabase** (Postgres + pgvector) ·
**Vitest** · **DeepSeek** (LLM) · **Z-API** (WhatsApp) · **OpenAI** (embeddings do RAG e
transcrição de áudio) · deploy na **Vercel**.

```
imigrar-agent/      a aplicação (painel, webhook, agente)
  IDENTIDADE.md       paleta, tipografia e a faixa MRZ — ler antes de mexer em tela
  supabase/migrations/
ingestao/           pipeline Python que vira base vetorial (não precisa de pip)
material-oficial/   as 7 cartilhas + legislação — a fonte de tudo que a Ana afirma
marca/              logotipos originais do cliente
docs/               referência (system-prompt-v1.md — histórico, não é a fonte da verdade)
```

Os PDFs têm o nome do `id` que já têm em `ingestao/fontes.json`. Os scripts da raiz
(`npm run dev`, `build`, `test`) só encaminham para `imigrar-agent/`.

**Identidade visual:** teal `#009687` é identidade, azul `#005EC4` é ação. Amostrados do
logotipo, pixel a pixel. Densidade acima de espaço em branco — é ferramenta de uso diário.

---

## 9. Estado da infraestrutura (26/08/2026)

**Supabase** — projeto `myfmqkgpnpmvlmvaewiq`. Estava **completamente vazio** até 26/08;
nenhuma migration tinha rodado ali. Foram aplicadas 12:

`004` (setup consolidado) · `005` users · `006` funcionarios · `007` hardening ·
`008` conversation_status · `009` atendimento humano e mídia · `010` users_setor ·
`014` leads setor+stage · `016` opt-out · `017` rag_chunks · `018` idioma · `019` fila de prazos

**Puladas de propósito:**

- `001`, `002`, `003` — a própria `004` diz que as substitui e contém a união das colunas.
  Rodar a `001` antes criaria as tabelas no formato antigo e a `004` passaria batido,
  deixando `stage`, `score` e `cliente_id` de fora.
- `011`, `012`, `013`, `015` e os seeds da `004` — catálogo de funções e pisos da CCT de
  limpeza do Rio. Dado da Shine Rio, que o app não lê mais. `services_catalog` e
  `function_pricing` ficaram criadas e vazias.

**Vercel** — a conta é do cliente (`Imigrar Brasil`), não a nossa. A armadilha que custou
duas builds:

> **1. Root Directory = `imigrar-agent`.** A aplicação está numa subpasta. Com o campo
> vazio, a Vercel constrói a raiz, não acha o Next.js, e o build morre com `exit 127`. E o
> `vercel.json` (que registra os **dois crons de follow-up**) também está dentro de
> `imigrar-agent/`: com Root Directory errado, os crons nunca foram agendados.
>
> **2. O grafo do middleware não pode usar o alias `@/`.** Três deploys seguidos morreram
> com *"The Edge Function 'middleware' is referencing unsupported modules"*. O nome engana:
> não havia módulo incompatível. O middleware é empacotado para o Edge dentro de um
> namespace próprio (`__vc__ns__/0/imigrar-agent/`), o alias não resolve ali, e o que não
> resolve vira "externo" — que no Edge é reportado como "não suportado". Corrigir só o
> arquivo de entrada **empurra o erro para o import seguinte**, o que de fato aconteceu.
> Hoje o grafo é fechado e relativo, e `tests/middleware-edge.test.ts` falha se alguém
> reintroduzir um `@/` ou uma dependência de `node_modules` ali. Foi por isso também que a
> `jose` saiu: ela puxava CompressionStream para dentro do Edge.
>
> Nada disso aparece no build local, no typecheck ou no lint. E o efeito não é uma tela
> quebrada: é o deploy inteiro não acontecer.

**Variáveis** — Supabase entrou pela integração nativa (`NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` são as duas que o app usa; as outras sete sobram sem
atrapalhar). Ainda faltam: `AUTH_SECRET` (**sem ela o login falha alto em produção, de
propósito**), `NEXT_PUBLIC_APP_URL`, `DEEPSEEK_API_KEY`, `ZAPI_*`,
`WEBHOOK_VERIFY_TOKEN`, `OPENAI_API_KEY` + embeddings, `CRON_SECRET`, `TEAM_WHATSAPP`.

**Domínio** — `agente.imigrarbrasil.com.br` aponta para a Vercel (CNAME
`a2d5ad103604362a.vercel-dns-017.com`), mas responde o 404 **da plataforma**
(`Code: NOT_FOUND`), não o 404 do Next. Isso é domínio sem deploy atrás: ou não está
atribuído a este projeto, ou está preso a um branch sem build bem-sucedido. Conferir em
**Settings → Domains**.

⚠️ Se as variáveis do Supabase estiverem só em **Production**, os deploys de *preview*
rodam em memória: painel abre, fila vazia, tudo some no refresh.

**Git** — `main` é a linha do Victor. O trabalho do painel está em **`fila-de-prazos`**
(commits `ef28be6` e `a95ef58`).

---

## 10. O que falta

**Bloqueado esperando terceiros**

- [ ] número pessoal do Walter → `TEAM_WHATSAPP` → aviso ativo do bloco 1
- [ ] chaves: DeepSeek, OpenAI, Z-API (a instância do 4664)
- [ ] `AUTH_SECRET` e as demais variáveis na Vercel

**Depois, com escopo a definir**

- [ ] **Dashboard** — uma visão de operação além da fila
- [ ] **CRM** — histórico do contato por pessoa, e não por conversa
- [ ] **Treinar o agente** — hoje são 7 abas herdadas da base comercial ("Empresa e
      serviços", "Objeções") que não descrevem este trabalho
- [ ] **Integrações** — só DeepSeek e Z-API importam; Brevo é resto da proposta comercial

**Fica registrado para não se perder**

- a Ana **não** cota, não fala honorários, não pede documento;
- a heurística **nunca** rebaixa uma classificação;
- data de prazo **só** por humano, com nome;
- exportação **sempre** com escopo e sempre logada.

---

## 11. Rodar

```bash
npm run setup     # instala em imigrar-agent/
npm run dev       # http://localhost:3000
npm test          # 409 testes
npm run typecheck
```

Primeiro acesso: `/setup` cria o primeiro admin e se tranca depois. Sem
`SUPABASE_SERVICE_ROLE_KEY` no `.env.local`, o app roda em memória e some no reinício.
