# Imigrar Brasil — o projeto inteiro

Documento de contexto. Serve para quem chega agora (ou para nós daqui a três meses)
entender **o que é isto, por que foi feito assim, o que já está pronto e o que falta** —
sem precisar reconstituir conversa de WhatsApp.

Última atualização: **27/08/2026**.

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
  → grava a mensagem (SEMPRE, antes de qualquer decisão)
  → decidirAtendimento (os três níveis de ativação — ver §8)
  → respondToConversation → runAgent (DeepSeek conduz, chamando as tools)
  → resposta pela Z-API, pela MESMA instância por onde a mensagem entrou
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

**A entrevista v3** (`knowledge.ts` + `lead-capture.ts` + `transfer-gate.ts`): uma conversa
real foi transferida em dez mensagens com a ficha quase vazia — sem o nome da pessoa, sem
saber quando começavam as aulas dela, e com uma orientação de visto consular que
contradizia o que a própria Ana tinha dito duas mensagens antes. As correções:

- **Ordem obrigatória de abertura**: nome, nacionalidade e localização antes de mencionar
  qualquer via. Perguntar "você tem CRNM?" a quem está na Bolívia é pergunta sem sentido.
- **Entrevista por ramo** (A a F, na seção `qualificacao` da base): quem está no exterior,
  quem está aqui com documento, quem está sem, refúgio, reunião familiar e naturalização
  têm conjuntos de perguntas diferentes. Não existe lista única.
- **Mercosul**: nacionais de Argentina, Bolívia, Chile, Colômbia, Equador, Paraguai, Peru e
  Uruguai NUNCA são mandados a consulado por presunção. Sem material oficial, encaminha.
- **O relógio do caso** (`relogio_do_caso`): todo caso tem algo correndo — aulas, contrato,
  passaporte, CRNM. É campo próprio, de texto, e de propósito NÃO liga
  `tem_prazo_correndo`: aquele é prazo processual e joga o caso no topo da fila.
- **Teste de intenção** (`intencao`): a pergunta que separa quem quer contratar de quem só
  quer saber. "Posso pedir para o time te orientar?" não separa nada.
- **Ficha mínima**: nome, nacionalidade, localização, objetivo, relógio e intenção. Sem
  eles não há transferência — **exceto** em caso urgente, que vai na hora com o que tiver.
  A trava é determinística, no `transfer-gate`, porque o prompt sozinho não segura.

**O que a auditoria por palavra-chave errou.** A primeira leitura do acervo foi feita com
busca léxica (BM25) e deu como lacuna a residência de pessoas venezuelanas. Estava errado:
o chunk existe, é bom, e cita Venezuela, Suriname, Guiana e Guiana Francesa junto com a
Portaria 19/2021 e o aviso de que pedir essa residência implica renunciar ao refúgio. Ele
não apareceu porque a cartilha nunca escreve "venezuelano" — chama de "política migratória
nacional". **Nenhum gentílico existe em nenhum lugar do acervo**, e é por isso que a busca
precisa ser vetorial: quem escreve no WhatsApp diz "sou boliviano", nunca "sou nacional da
Bolívia".

**Antiban do WhatsApp**: a Ana é reativa (nunca dispara para lista), tem opt-out
determinístico, janela de envio 8h–20h em dia útil para mensagens iniciadas pelo sistema,
sem rajada nos crons, e ritmo humano no envio.

---

## 8. Ligar e desligar a Ana

Até 27/08 isto não era uma pergunta que o sistema soubesse responder. Havia **uma**
credencial Z-API no banco, e a única forma de calar o agente era apagá-la — o que derruba
junto a **entrada** das mensagens. Desligar significava ficar cego, e por isso ninguém
desligava. Não dá para soltar um agente em cima de gente de verdade assim.

Não é um booleano. São **três níveis independentes**, e a independência é o ponto.

| nível | o quê | onde |
|---|---|---|
| 1 | **chave geral** — vale para tudo | topo de todas as telas, `agent_config['chave_geral']` |
| 2 | **instância** — ambiente e ativação próprios por número | Integrações, tabela `zapi_instancias` |
| 3 | **conversa** — um humano assumiu | dentro da conversa, `conversations.assumed_by` |

A regra sai de **um** lugar: `decidirAtendimento` em `lib/agent/ativacao.ts` — puro, sem
banco, com teste. O webhook não decide nada sozinho; pergunta e obedece.

### Nível 1 — a chave geral

Botão sempre visível, ligado ou desligado (botão que só aparece quando algo está errado é
botão que ninguém sabe que existe). Desligar **exige motivo**, validado no servidor e não
só no formulário — e o motivo aparece na faixa vermelha do topo, na mesma faixa do
"WhatsApp desconectado": *"Agente desligado por {quem} desde {quando} — {motivo}"*. Quem
chega às 9h não tem como não ver.

Sem registro no banco a chave nasce **ligada**: o dia em que a linha de config sumir não
pode ser o dia em que o WhatsApp da empresa emudece.

### Nível 2 — por instância

Cada instância da Z-API é uma linha com ambiente (`teste` | `producao`) e ativação
próprios. **As travas não são de interface** — a interface é onde as regras vazam:

- um **trigger** reescreve `ambiente='teste'` e `ativo=false` em *todo* INSERT, então
  instância nasce em teste e desligada mesmo por payload forjado ou formulário mal montado;
- um **CHECK** proíbe silêncio total em produção;
- `atualizarInstancia` **não aceita** `ativo` — ligar tem rota própria, com confirmação
  explícita e separada da chave geral. Ligar o número que fala com gente de verdade não
  pode ser efeito colateral de salvar um formulário;
- ligar é um UPDATE por `id`. Não existe caminho no código que leia o estado de uma
  instância para decidir o de outra: **ligar a de teste não tem como ligar a de produção**.

A conversa grava em que ambiente aconteceu, na primeira mensagem, e isso **nunca é
reescrito**: promover a instância a produção amanhã não transforma os ensaios de hoje em
atendimento real. **Conversa de teste não entra nas métricas nem na fila de trabalho** —
filtrada na entrada de `calcularMetricas` e de `montarFila`, e não em cada cálculo, que é
como o filtro seria esquecido no próximo número que alguém acrescentar.

### Nível 3 — por conversa

Já existia (`assumed_by`), mas com duas pontas soltas, agora fechadas: assumir o caso na
fila **cala o agente naquela conversa** (antes eram dois gestos, e o segundo era esquecido
justamente quando o caso era urgente o bastante para alguém correr), e a troca
assumir/devolver virou linha de auditoria.

### O comportamento com o agente desligado — mais importante que o botão

**Desligado nunca significa ignorar.** A mensagem chega, o anexo é lido, o áudio é
transcrito, tudo é gravado e aparece no painel **antes** de qualquer decisão de ativação.
O que muda é só o que volta:

| modo | o que a pessoa recebe |
|---|---|
| `silencio` | nada. **Só existe em instância de teste** |
| `resposta_fixa` | avisa que um humano responde, e **quando** — o horário sai de `proximoAtendimento`, nunca "em instantes" às 21h de sábado |
| `sombra` | nada é enviado, e a resposta que a Ana daria fica gravada para revisão |

Em produção, toda conversa recebida com o agente desligado abre o **relógio da primeira
resposta humana** e entra na fila. O relógio conta **minutos de expediente**, não tempo
corrido: uma mensagem de sexta às 17h55 com SLA de 30min vence às 8h30 de segunda, não às
18h25 de sexta. Um SLA que nasce vermelho é um SLA que ninguém olha. Estourado, o caso
sobe ao **topo do bloco 3** — acima até de um caso judicial, porque a promessa do modo
desligado ("alguém responde") já foi quebrada ali.

O relógio fecha quando um **humano** responde, assume, ou decide um rascunho de sombra —
e **não** quando o agente é religado: religar não desfaz o fato de que ninguém do time
olhou para aquela conversa.

### Modo sombra

Na fase de testes vale mais que o liga/desliga. A Ana lê mensagem real, monta a resposta,
e ela para no painel — na linha do tempo da conversa, exatamente onde teria ido, e numa
fila própria em `/dashboard/sombra`. Três saídas: **enviar como está**, **editar antes de
enviar**, **descartar com motivo**.

Duas decisões que sustentam isso:

- a resposta **não entra no histórico da conversa**. Uma mensagem `assistant` gravada sem
  ter sido enviada faz o turno seguinte acreditar que a pessoa leu aquilo, e a partir daí a
  conversa inteira se apoia numa coisa que não aconteceu;
- o texto da Ana e o texto que a pessoa mandou ficam em **colunas separadas**. É o par que
  ensina — só o texto final não ensina nada, e o descarte com motivo ensina mais ainda. É
  daqui que sai a matéria-prima da fila de revisão (§11).

### Auditoria

Mudança de estado em qualquer um dos três níveis vira linha em `access_log`, com autor,
timestamp, estado anterior, estado novo e motivo quando houver. Ações: `agente.chave_geral`,
`agente.instancia.ativacao`, `agente.instancia.ambiente`, `agente.instancia.modo_desligado`,
`agente.conversa`, `agente.rascunho`.

**Código:** `lib/agent/ativacao.ts` (regra pura) · `lib/agent/estado.ts` (leitura, escrita e
resolução de instância) · `app/api/agente/*` · `components/agente/*` ·
`supabase/migrations/023_ativacao_do_agente.sql`. Testes: `tests/ativacao*.test.ts`.

---

## 9. Stack e estrutura

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

## 10. Estado da infraestrutura (26/08/2026)

**Supabase** — projeto `myfmqkgpnpmvlmvaewiq`. Estava **completamente vazio** até 26/08;
nenhuma migration tinha rodado ali. Foram aplicadas 12:

`004` (setup consolidado) · `005` users · `006` funcionarios · `007` hardening ·
`008` conversation_status · `009` atendimento humano e mídia · `010` users_setor ·
`014` leads setor+stage · `016` opt-out · `017` rag_chunks · `018` idioma · `019` fila de prazos

**Pendentes de aplicar** (escritas depois daquela rodada): `020` saúde da operação ·
`021` ficha mínima · `022` relógio (data) · `023` ativação do agente.

> ⚠️ **A `023` precisa rodar antes do próximo deploy fazer sentido.** Sem ela o webhook cai
> numa instância sintética e o comportamento continua o de hoje (produção respondendo
> normalmente, nada quebra), mas o painel de instâncias fica vazio e o **modo sombra não
> grava nada**. A migration também converte a credencial que já está em
> `agent_config['zapi']` numa instância de **produção ligada** — de propósito: aplicar a
> regra "nasce desligada" retroativamente faria o WhatsApp da empresa emudecer no instante
> do deploy, sem ninguém ter pedido isso.

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

**Git** — `main` é a linha do Victor. O trabalho do painel seguiu para
**`v3-ficha-minima-e-recall`**, onde estão a entrevista v3, a suíte de recuperação do RAG e
a ativação do agente (`06416f4`).

---

## 11. O que falta

**Bloqueado esperando terceiros**

- [x] **A base vetorial está carregada** — 1.723 chunks indexados (cartilha 312,
      legislação 844, doutrina 567), embeddings de 1.024 dimensões, custo US$ 0,08.
      `npm run test:rag` passa 25/25: as dez consultas da auditoria recuperam o trecho
      certo dentro do top-6 e sobrevivem ao corte de relevância.
- [ ] `OPENAI_API_KEY` nas variáveis da Vercel — sem ela, em produção continuam
      desligados a busca no material oficial E a transcrição de áudio.
- [ ] número pessoal do Walter → `TEAM_WHATSAPP` → aviso ativo do bloco 1
- [ ] chaves: DeepSeek, OpenAI, Z-API (a instância do 4664)
- [ ] `AUTH_SECRET` e as demais variáveis na Vercel

**Feito depois da v1 (26/08, noite)**

- [x] **Saúde da operação** — faixa vermelha quando a captação para, indicador permanente
      na sidebar, e tela dos áudios que não foram transcritos
- [x] **Meus atendimentos** — com a separação de quem está com a bola
- [x] **Lembretes, SLA de primeiro contato e linha do tempo do caso**
- [x] **Busca global** no lugar do motivo decorativo no topo

**Feito em 27/08**

- [x] **Entrevista v3** — ordem de abertura, ramos, ficha mínima e o relógio do caso
- [x] **Suíte de recuperação do RAG**, separada da suíte de prompt
- [x] **Ativação do agente em três níveis** (§8) — chave geral, por instância e por
      conversa, com o comportamento de desligado explícito e auditado
- [x] **Modo sombra** — a Ana responde contra conversa real sem enviar nada, e cada
      descarte ou edição vira dado

**Segurando de propósito até as primeiras cem conversas**

O painel ainda não recebeu conversa real. Fila de revisão, versionamento de prompt,
filtros salvos, mapa de origem e as métricas novas dependem de saber COMO o agente erra —
e isso não se adivinha. Construir doze telas antes do primeiro lead é o jeito mais rápido
de descobrir, em três semanas, que metade não era necessária.

- [ ] **Fila de revisão** do agente, com marcação do tipo de erro — a matéria-prima já
      existe: cada rascunho de sombra descartado ou editado grava o par (o que ela
      escreveu, o que a pessoa mandou) e o motivo. Falta a tela que lê isso por tipo de erro
- [ ] **Lacunas de conhecimento** (o que perguntaram e a base não cobre)
- [ ] **Versionamento de prompt** + bateria de casos de teste no simulador
- [ ] **Filtros salvos, mapa de origem, métricas por versão de prompt**
- [ ] **Trocar senha pelo painel** — hoje só dá para mexer direto no banco
- [ ] **Dashboard e CRM por pessoa** — escopo a fechar
- [ ] **Treinar o agente** — as 7 abas ainda são da base comercial
- [ ] **Integrações** — DeepSeek de verdade; Brevo fora do caminho. *(A Z-API virou o
      painel de instâncias — feito.)*

**Fica registrado para não se perder**

- a Ana **não** cota, não fala honorários, não pede documento;
- a heurística **nunca** rebaixa uma classificação;
- data de prazo **só** por humano, com nome — e a data do relógio do caso
  (`relogio_data`) também: o agente escreve o texto, nunca a data;
- relógio apertado sobe o lead na fila NORMAL e nada mais — não vira prazo processual;
- exportação **sempre** com escopo e sempre logada;
- **desligado nunca é ignorado** — a mensagem sempre chega, é gravada e aparece no painel;
- **instância nasce em teste e desligada**, e a trava é um trigger no banco, não convenção;
- **silêncio total só em teste** — em produção, do outro lado tem alguém que escreveu
  pedindo ajuda;
- **conversa de teste não conta** em métrica nenhuma nem na fila de trabalho;
- resposta de sombra **não entra no histórico** enquanto não for enviada de verdade.

---

## 12. Rodar

```bash
npm run setup     # instala em imigrar-agent/
npm run dev       # http://localhost:3000
npm test          # 561 testes
npm run typecheck
```

Primeiro acesso: `/setup` cria o primeiro admin e se tranca depois. Sem
`SUPABASE_SERVICE_ROLE_KEY` no `.env.local`, o app roda em memória e some no reinício.
