# Imigrar Brasil — o projeto inteiro

Documento de contexto. Serve para quem chega agora (ou para nós daqui a três meses)
entender **o que é isto, por que foi feito assim, o que já está pronto e o que falta** —
sem precisar reconstituir conversa de WhatsApp.

Última atualização: **28/08/2026** (a etapa comercial no CRM e o follow-up por motivo de espera — seções 9 e 10; o modo sombra sem efeito no mundo e o webhook fechado — seções 7 e 8; a Z-API no ar e o primeiro WhatsApp real atendido — seção 13).

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
Ainda **não é o que está no ar**: em 28/08 a instância Z-API estava pareada num número
pessoal. Ver a pendência viva na seção 13.
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
virou a situação documental, e `setor: "comercial"` (a chave gravada em todo lead) é o
destino do **time jurídico** — a tela lê "Jurídico". Está documentado no código onde
acontece.

**A segunda limpeza (27/08, noite)** pegou o que tinha sobrado na INTERFACE, que é onde
custa caro: quem está aprendendo a operar o painel aprende errado. Saíram o simulador que
imitava o WhatsApp com um botão "Abrir proposta em PDF ↗" (ferramenta que só existia no
produto de portaria), os cenários de teste "quero 2 porteiros na Barra" e "sou da
distribuidora G7", os setores de transferência RH / Departamento Pessoal / Suporte (times
que não existem neste escritório — transferir para setor inexistente é transferir para
lugar nenhum) e o "score 43" do funil comercial no dossiê da conversa.

> **O que ainda é da base antiga, e fica registrado:** as chaves de `setor`
> (`comercial`, `operacional`, `rh`, `departamento_pessoal`) continuam no banco e na API;
> só o rótulo mudou. `LeadStage` (`novo`, `qualificado`, `orcado`, `ganho`…) segue existindo
> e **não é o que o CRM usa** — o CRM anda pelo `atendimento_status` (§9). Trocar essas
> chaves exige migration e backfill; até lá, quem ler o banco cru precisa saber disso.

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

Não existe gráfico de faturamento, ticket médio ou previsão. Sete abas — visão geral, quem
procura, desfecho, prazos, agente, custo e **follow-up** —, filtro de período (7/30/90 dias
e *tudo*) e filtro por **nacionalidade**, que o custo também respeita. O que se mede:

- conversas atendidas no período, **por idioma**;
- quantas foram **filtradas** — *o número que justifica o projeto*;
- leads qualificados entregues, por classificação;
- **taxa de resgate** — *o número que protege o projeto*;
- taxa de reclassificação (quanto o humano discorda da IA);
- tempo até o primeiro contato humano, **separado para os casos com prazo**;
- **prazos perdidos** — precisa ser zero, e fica visível em todas as abas;
- de onde vem a gente (nacionalidade), onde ela está, e a modalidade provável;
- desfecho: fechados, perdidos, em aberto, taxa de fechamento e **por que os casos foram
  perdidos** (a soma dos motivos que o CRM exige na hora de mover o card);
- prazos: sinalizados, confirmados e a **taxa de confirmação** — sinalizado sem confirmar é
  caso sem contador, e ninguém sabe quantos dias sobram;
- follow-up: enviados por motivo e por idioma, taxa de resposta, casos **recuperados**
  (voltaram a responder), casos perdidos por **esgotamento da sequência** e tempo médio de
  espera por motivo. Rascunho não enviado e tarefa não tratada **não contam como mensagem**
  — contam como fila; incluí-los derrubaria a taxa por causa de trabalho que nunca chegou a
  ninguém.

> **O filtro de período parecia quebrado e não estava.** 7, 30 e 90 dias mostravam a mesma
> coisa porque a operação é nova: todo caso do banco cabe dentro de sete dias. Só que filtro
> que não muda nada é indistinguível de filtro que não funciona, e a diferença não pode
> depender de o usuário adivinhar. Por isso a faixa de cima **declara o recorte**: quantos
> casos existem ao todo, quantos entraram no período, de que data a que data — e diz, com
> todas as letras, quando o painel inteiro cabe no período escolhido.

> **A taxa de resposta por idioma é o alarme da promessa central.** O projeto inteiro se
> apoia em atender em qualquer língua, e se essa promessa se quebrar ela se quebra em
> silêncio: os modelos em português continuam funcionando, quem fala crioulo simplesmente
> para de responder, e nada na tela indica nada. Um idioma abaixo da metade da média fica
> vermelho, porque quase sempre é tradução ruim ou tom errado — e isso se corrige numa
> tarde, se alguém souber.

> **Por que a taxa de resgate é a métrica mais importante.** Um agente que filtra demais
> parece ótimo nos números: pouca conversa chegando ao time, todo mundo elogiando a
> economia. E está destruindo o negócio em silêncio, porque quem precisava de ajuda foi
> descartado sem ninguém ver. A taxa de resgate é o único jeito de perceber isso cedo.
> **Se ela sobe, a Ana está descartando demais.**

Código: `lib/metricas/` · `lib/followup/metricas.ts`.

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

**A conta dona do painel** (migration `030`). Todo admin já tem acesso total; o que não
existia era a garantia de que **sempre reste alguém** com esse acesso. O primeiro admin — o
do `/setup` — é marcado como dono e **não pode ser apagado, desativado nem rebaixado**. Ele
aparece com a etiqueta "dona do painel" na lista de usuários e na barra lateral.

A garantia é um **trigger no banco**, não uma conferência em rota, e a razão é concreta: a
tela de usuários só cria e lista, então toda edição de conta neste projeto foi feita à mão no
SQL Editor do Supabase — foi assim que a senha de 27/08 foi redefinida. Guarda em rota
protege quem passa pela rota, e o SQL Editor não passa. Um `active = false` na linha errada
deixaria o painel sem ninguém que administre, e a saída seria outro UPDATE no banco: o mesmo
gesto que causou o problema. É a escolha da `023`, onde "instância nasce desligada" é
trigger e não convenção.

Proteger **não é congelar**: nome, senha, e-mail e setor mudam normalmente, e passar a
titularidade é permitido e deliberado (desmarcar a antiga, marcar outra conta admin). O
mesmo texto de recusa existe em TypeScript (`porqueNaoPodeMexer`), para que a tela explique
o motivo em vez de vazar um erro de trigger em inglês.

**Você sempre sabe em que conta está.** A barra lateral mostra nome, e-mail e papel logo
acima de "Sair", e a faixa vermelha do agente desligado passou a dizer "desligado por
**você** (fulano@)" quando a conta nomeada é a sua. Antes o painel dizia "agente desligado
por studioneedbr@gmail.com" para alguém que não tinha, em tela nenhuma, como saber se aquele
e-mail era o dele — e a pergunta que isso levanta ("fui eu que desliguei?") é a que decide
se a pessoa religa agora ou vai procurar quem desligou.

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

**O que ela NUNCA esquece** (`lib/agent/material-oficial.ts`): o RAG é **condicional** — só
injeta trecho quando a mensagem pede pesquisa. Saudação, "e aí, dá pra fazer?" e pergunta
sobre honorário não disparam busca nenhuma, e é exatamente aí que ela escorregava: numa
conversa real afirmou, em espanhol, que o passaporte carimbado em Pacaraima da pessoa
*"significa que tu entrada quedó registrada de forma regular"* — parecer sobre o caso
concreto, dito por um escritório de advocacia a alguém que vai decidir a vida em cima.

Então seis regras invioláveis e a lista do acervo entram em **todo** prompt, por último,
inclusive por cima de um `system_prompt` cru gravado à mão e depois de a equipe reescrever a
persona inteira: sem parecer sobre o caso concreto · sem inventar fonte · prazo se confirma
com documento · sem honorário nem promessa de resultado · gratuidade (DPU) existe e se diz ·
documento da pessoa é dado sensível. **Não são editáveis na tela** — mudam com uma versão
nova, e a aba "Material oficial" do treinar mostra o texto exato para quem for conferir.
Este bloco é a prevenção; o verificador de saída (`verificador-de-saida.ts`) é a rede que
corta a frase depois de escrita.

**O dossiê se preenche sozinho** (`lib/agent/triagem.ts` + `lead-capture.ts`): leitura
determinística a todo turno, em português, espanhol e inglês. Existe porque o modelo esquece
de chamar a tool, e aí o painel ficava em "Coletando…" enquanto a pessoa já tinha contado
tudo. O **objetivo** também é deduzido — "recebi uma multa" não é o objetivo; o objetivo é
resolver a multa, e é isso que o advogado precisa ler. Derivado do sinal de prazo ou do
caminho migratório reconhecido, nunca chutado: sem nenhum dos dois, o campo continua vazio.

**E ela para de reperguntar** (`buildDadosConhecidosBlock`): o bloco de dados conhecidos
listava os seis campos herdados da base comercial. Nacionalidade própria, localização,
objetivo, intenção declarada, vínculo familiar e a **data limite JÁ confirmada por um
humano** não chegavam até ele — o atendente ligava, confirmava a data da multa, gravava na
ficha, e na mensagem seguinte a Ana perguntava de novo se havia algum prazo. Quem chega com
medo e repete a mesma resposta pela terceira vez desiste do atendimento. Número de documento
continua fora: os campos já são gravados sem ele.

**O tamanho da mensagem** (`knowledge.ts` + `training.ts`): **2 a 3 frases por mensagem**, e
a instrução diz *corte, não resuma* — o que sobrar se diz na próxima mensagem, se ainda
fizer falta (quase nunca faz). Junto veio a proibição de abrir repetindo o que a pessoa
acabou de dizer: "entendi, você entrou por Corumbá com o passaporte carimbado e guardou ele"
é a mensagem dela de volta, ocupando o lugar da resposta.

> **Duas definições da mesma regra não viram média — vence a mais permissiva.** O bloco de
> conhecimento dizia "2 a 4 parágrafos no máximo" e o de identidade dizia "2 a 3 frases", as
> duas com o mesmo rótulo ("mensagens curtas") **no mesmo prompt**. O resultado eram
> respostas de cinco e seis linhas para quem lê no celular, com medo, muitas vezes em
> segunda língua. Se um dia mudar o número num arquivo, mude no outro.
> Testes: `tests/tamanho-da-mensagem.test.ts`.

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
sem rajada nos crons, e ritmo humano no envio. **Grupo, lista de transmissão, status e canal
não viram atendimento** — o corte é no webhook, antes de qualquer escrita (§9). A régua de
follow-up e o resto das travas estão na §10.

> ⚠️ **O webhook ficava ABERTO quando não havia segredo nenhum configurado** (corrigido em
> 28/08). Com `WEBHOOK_VERIFY_TOKEN` ausente **e** nenhum Client-Token, as duas guardas eram
> puladas e a requisição seguia. Não é hipótese: foi o estado do projeto até a Z-API entrar,
> e nele qualquer um que soubesse a URL injetava conversa e lead na fila — inclusive com
> prazo correndo, que é o topo do bloco 1 — e queimava o saldo do modelo. Com a Z-API ligada
> seria pior: a resposta sai para o `phone` que veio no corpo, ou seja, **envio para número
> arbitrário pelo WhatsApp da empresa**, que é o caminho mais curto para o bloqueio que o
> antiban existe para evitar.
>
> Agora sem segredo a rota recusa com **503 e não 401**, de propósito: isto não é requisição
> forjada, é instalação pela metade, e quem lê o log precisa saber qual dos dois é. E header
> ausente com Client-Token configurado deixou de passar batido — antes `incomingToken &&`
> curto-circuitava a comparação, então **quem mandava prova errada era barrado e quem não
> mandava prova nenhuma entrava**. Testes: `tests/webhook-auth.test.ts`.

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
  daqui que sai a matéria-prima da fila de revisão (§12).

> ⚠️ **O modo sombra prometia que nada era enviado — e não cumpria** (corrigido em 28/08).
> `respondToConversation` protegia três coisas (não gravava a resposta, não mudava o status,
> não mexia no relógio) e **as tools rodavam normalmente**, porque o flag `sombra` nunca
> chegava até `executeTool`. Duas delas falam para fora: `transferir_para_humano` manda
> WhatsApp para o advogado (`TEAM_WHATSAPP`) e `agendar_followup` marca uma mensagem que o
> cron entrega **à pessoa** horas depois. Ou seja: um ensaio acordava o time e mandava
> mensagem para o cliente — e o follow-up é o mais traiçoeiro dos dois, porque chega quando
> ninguém mais liga aquela mensagem ao ensaio de ontem.
>
> Pior: **há um caminho que cai em sombra sem ninguém escolher** — instância não reconhecida
> (ver `decidirAtendimento`) —, então um webhook apontado para o lugar errado passava a
> falar com gente por um canal que o painel nem sabia qual era.
>
> O flag agora desce por `runner` → `deepseek`/`fallback` → `executeTool`, inclusive no
> terceiro caminho até a tool (o anti-loop, que não passa pelo runner e é o mais fácil de
> esquecer). **O que continua rodando em sombra, de propósito:** a leitura do material
> oficial, a gravação da ficha e a AVALIAÇÃO do portão de encaminhamento. Nenhuma sai do
> sistema, e todas mudam o que a Ana escreveria — se o portão recusasse só em produção, o
> rascunho deixaria de ser ensaio fiel e viraria ficção. A tool devolve `ok: true` pelo
> mesmo motivo. Testes: `tests/sombra-sem-efeito.test.ts`.

### Auditoria

Mudança de estado em qualquer um dos três níveis vira linha em `access_log`, com autor,
timestamp, estado anterior, estado novo e motivo quando houver. Ações: `agente.chave_geral`,
`agente.instancia.ativacao`, `agente.instancia.ambiente`, `agente.instancia.modo_desligado`,
`agente.conversa`, `agente.rascunho`.

**Código:** `lib/agent/ativacao.ts` (regra pura) · `lib/agent/estado.ts` (leitura, escrita e
resolução de instância) · `app/api/agente/*` · `components/agente/*` ·
`supabase/migrations/023_ativacao_do_agente.sql`. Testes: `tests/ativacao*.test.ts`.

---

## 9. O CRM — funis e etapas que o escritório desenha

Até 27/08 isto era "o Quadro": cinco colunas fixas, escritas em código (novo, em
atendimento, agendado, fechado, perdido). Elas descrevem o que o SISTEMA sabe de um caso —
e não descrevem o trabalho. Entre "em atendimento" e "fechado" cabem semanas de "esperando
a certidão consular", "protocolo enviado", "exigência a cumprir", e tudo isso ficava
empilhado numa coluna só, indistinguível.

**A regra que sustenta o CRM inteiro: ETAPA É NOME, STATUS É DOMÍNIO.**

O escritório cria quantas etapas quiser, com o vocabulário dele, e cada etapa aponta para
um dos cinco `atendimento_status`. É essa amarração que faz uma coluna nova continuar
valendo para a fila de prazos, para o encerramento e para o "perdido exige motivo". Se a
etapa fosse um estado paralelo, o primeiro efeito seria silencioso e grave: um caso
"fechado" parado numa etapa de espera, fora da fila, invisível.

- **Vários funis**, um por vez na tela. "Multa correndo" e "visto de trabalho de quem
  ainda está fora" não são o mesmo trabalho. Caso sem funil pertence ao **padrão** — nunca
  aparece em dois quadros, porque caso contado duas vezes é trabalho alocado duas vezes.
- **Arrastar não ganhou caminho de escrita novo**: continua virando uma ação de
  `POST /api/leads/[id]/atendimento` (motivo obrigatório em perdido, responsável gravado,
  agente calado, tudo no log de acesso). Quando a etapa de destino tem o MESMO status da
  atual, a ação é `mover` e só a etapa muda — e o servidor reconfere que a etapa
  corresponde à ação antes de gravar as duas coisas.
- **Nada some.** Apagar etapa ou funil não apaga caso: o lead volta a ser distribuído pelo
  status (`on delete set null`). Quem nunca foi movido à mão aparece na primeira etapa do
  status dele, e é por isso que um funil recém-criado abre CHEIO em vez de abrir vazio
  parecendo perda de dados.
- **Quem desenha**: advogado e administrador (a mesma régua de quem exporta). Um funil não
  é preferência pessoal — é o desenho que a equipe inteira lê.
- **O agente não mexe**: `funilId` e `etapaId` entram em `CAMPOS_SO_DE_HUMANO`. Sem isso um
  card arrastado à mão voltaria sozinho no próximo "oi" da pessoa.

### A etapa onde o dinheiro aparece (28/08)

O quadro ia de "em atendimento" direto para "reunião agendada". O fluxo real do escritório
tem um passo entre os dois: alguém assume, **envia o orçamento** e só então marca a
reunião. A etapa em que a proposta está com o cliente não existia — e é justamente a que
mais precisa de follow-up, porque é a única em que o silêncio da pessoa custa dinheiro e
tem data de validade.

```
NOVO → EM ATENDIMENTO → PROPOSTA ENVIADA → REUNIÃO AGENDADA → FECHADO
                                                              PERDIDO
```

Três coisas eram invisíveis e passaram a existir. **Proposta enviada** guarda data, valor,
serviço e prazo de validade. **Fechado** pede o valor efetivamente contratado — ou a
marcação explícita de que fechou *sem contrato*, porque um campo em branco não distingue
"não houve" de "esqueceram de preencher" e a soma do mês fica errada em silêncio.
**Perdido** ganhou categoria fechada (preço, foi para outro escritório, resolveu sozinho,
sumiu, perfil DPU, fora de escopo) **além** do texto livre: a categoria soma, a frase se lê
seis meses depois. Texto livre sozinho não respondia nenhuma pergunta no agregado — "sumiu",
"não respondeu" e "parou de responder" são a mesma coisa escrita de três jeitos.

`perfil_dpu` e `fora_de_escopo` estão na lista porque são desfechos legítimos e frequentes
neste escritório. Contá-los como perda comercial faria a conversão mentir para baixo todo mês.

Tudo isso é **só de humano** (`CAMPOS_SO_DE_HUMANO`), e este é o caso mais caro da lista:
um modelo inferindo "acho que ficou uns três mil" de uma frase do cliente estaria escrevendo
receita no painel do escritório.

### Quem cuida do caso (28/08)

`responsavel_id` sempre foi um só: quem assumiu primeiro. Na prática o caso troca de mãos
(férias, plantão, alguém que entende de refúgio entra no meio) e quase sempre tem mais de
uma pessoa dentro — quem negocia e quem protocola não são a mesma pessoa. Isso vivia em
"Observações internas", que ninguém lê antes de ligar para o cliente.

- **O dono** continua sendo um só. É o nome do card e é por ele que "Meus atendimentos"
  filtra — uma lista sem dono é uma lista em que ninguém responde pelo caso.
- **Quem mais está no caso** (`apoio_ids`) enxerga e trabalha, mas o caso não conta como
  pendência deles: uma pendência de quatro pessoas não é pendência de ninguém.
- **`assumido_em` nunca é reescrito.** Trocar o responsável amanhã não pode reiniciar o
  "tempo até o primeiro contato humano".
- **O agente segue o dono.** Transferir o caso move também o silêncio do agente para quem
  assumiu — antes a conversa ficava calada em nome de quem clicou.

Código: `lib/crm/funil.ts` · `components/crm/` · `app/api/crm/` · migrations `026`, `027`
(etapa comercial) e `028` (responsáveis).
Endereço: `/dashboard/crm` (o antigo `/dashboard/atendimentos` redireciona).

> **Grupo do WhatsApp não vira lead.** O primeiro card do quadro chegou a ser
> `12036343001452 6326-g…` — o JID de um **grupo**, o que significava que mensagem de grupo
> estava abrindo caso e a Ana estava respondendo dentro de grupos. O corte está no webhook,
> antes de qualquer escrita, e é *fail-closed*: grupo, lista de transmissão, status e canal
> não abrem conversa, não criam lead e não recebem resposta. Os que já estavam no banco
> somem da fila e do quadro pela leitura do próprio número, sem `UPDATE` em produção.
> Precisou vir antes de qualquer automação: follow-up automático disparado num grupo é o
> pior caso possível deste sistema. Ver `lib/whatsapp/remetente.ts`.

---

## 10. O follow-up — o sistema que sabe o que está esperando

### A premissa: aqui não é cadência de vendas

**Em imigração o tempo morto é do cliente, não do vendedor.** A pessoa some três semanas
porque está esperando certidão do consulado, apostilamento, tradução juramentada ou
agendamento na Polícia Federal. Nada disso depende dela e nada disso anda mais rápido
porque alguém perguntou.

É por isso que "passando para saber se ainda tem interesse" não é só inútil aqui: mandada a
quem está há duas semanas na fila do consulado, ela é a prova de que o escritório não sabe
em que pé está o caso. O follow-up tem de ser sobre **o que estamos esperando** — e para
isso o motivo precisa estar gravado.

### O motivo da espera

Quem pausa o caso escolhe o motivo, e o sistema já propõe a data do próximo toque:

| motivo | cadência sugerida |
|---|---|
| aguardando documento com o cliente | 3 dias |
| aguardando consulado | 30 dias |
| aguardando Polícia Federal | 30 dias |
| aguardando tradução ou apostilamento | 15 dias |
| aguardando decisão sobre a proposta | 2 dias |
| aguardando pagamento | 3 dias |
| cliente pediu para retomar depois | **a data que ele indicou** |

A cadência é **sugestão editável**, não regra — 30 dias é a média de um consulado, não a
promessa dele. A última linha não tem sugestão nenhuma de propósito: inventar uma cadência
por cima de "me procura em março" é desrespeitar exatamente o que a pessoa pediu, e ali a
tela exige a data.

**Caso parado sem motivo registrado não vira mensagem — vira pendência** em "Meus
atendimentos" e na faixa de risco da Operação. É a diferença que muda o que se faz em
seguida: com motivo, o silêncio é o processo funcionando e o sistema escreve sozinho; sem
motivo, ninguém escreve nada e o caso apodrece parecendo normal.

### A sequência tem fim

Follow-up sem limite gera lead zumbi e incomoda quem já decidiu não responder — e quem se
incomoda bloqueia e denuncia, que é o que derruba o número. **No máximo três toques por
motivo de espera.** Depois do terceiro sem resposta o caso vai para PERDIDO com motivo
"sumiu", e sai uma última mensagem dizendo que o escritório fica à disposição quando ela
quiser retomar.

O contador **zera quando a pessoa responde** e quando o motivo muda. As duas coisas
importam: quem escreve a cada duas semanas dizendo "ainda estou esperando o consulado"
seria encerrado como se tivesse sumido — justamente a pessoa que está fazendo tudo certo —,
e quem esperou o consulado, respondeu, e agora espera pagamento começa do zero, porque são
duas esperas diferentes.

A despedida vive em código, e não na tabela de modelos: é a mensagem que sai quando **não
há** modelo aprovado para mandar, e depender de cadastro para ela seria deixar o caso mais
delicado do fluxo sem texto nenhum. Sem idioma conhecido, o caso fecha **em silêncio** —
uma despedida na língua errada é a confirmação, na última mensagem, de que o escritório
nunca soube com quem estava falando.

### Follow-up no idioma da pessoa — o ponto que não pode falhar

O projeto inteiro existe porque o público é multilíngue. Mandar follow-up em português para
um haitiano destrói o produto, e destrói mais do que uma mensagem perdida: comunica que
ninguém do outro lado percebeu com quem está falando, para uma pessoa que já desconfia de
instituição.

**Não existe idioma de reserva.** Sem modelo na língua da pessoa, o disparo não acontece:
vira tarefa para alguém escrever à mão. Um *fallback* para português faria o defeito voltar
sem ninguém perceber, porque tudo continuaria "funcionando".

Os modelos são cadastrados por motivo e por idioma em `/dashboard/followup`, e a tela não é
uma lista de textos: é um **mapa de buracos**. Chip preenchido = envio automático · chip
claro = rascunho para aprovação · chip tracejado = sem modelo. Escrever é de advogado e
administrador — um modelo não é preferência pessoal, é a frase que sai do único número do
escritório para dezenas de pessoas, e escrever "seu processo já foi aprovado" num modelo é
diferente de escrever isso numa conversa: o erro não acontece uma vez, acontece toda vez.

### Quem envia

**Rascunho para aprovação é o padrão**, e não uma etapa de transição. A mensagem aparece na
fila do responsável com enviar, editar ou pular; follow-up aqui fala com gente em situação
delicada, e o custo de uma frase errada não é uma venda perdida, é uma pessoa que para de
pedir ajuda. **Pular não é falha, é dado**: um modelo pulado toda vez está errado, e sem
registrar o pulo ninguém descobre. **Editar grava o texto que saiu**, não o do modelo — o
par (o que o sistema escreveu, o que a pessoa mandou) é o que mostra onde o modelo erra.

**Envio automático** é escolha por modelo e nasce desligado. Ligá-lo é dizer que aquela
frase específica pode sair sem ninguém ler.

**Caso com prazo processual correndo não entra em follow-up automático em hipótese
nenhuma** — a regra vem antes de qualquer conta de janela ou de teto. Quem tem defesa a
protocolar precisa de alguém do escritório no telefone; uma mensagem programada gasta o
único contato que a pessoa vai ler naquele dia. Esses casos geram **tarefa de ligar**.

### A proteção do número

O escritório opera com **um número só**. Se ele for bloqueado a captação inteira para, e
isso é mais grave que qualquer lead perdido. Todas as travas passam por uma função pura
(`lib/followup/regras.ts`), numa ordem que não é arbitrária:

1. **o que nunca pode** — opt-out, DPU, ensaio, quem nunca respondeu, caso sem motivo de
   espera. São proibições: matam o disparo, não entram em fila;
2. **o que não é mensagem** — prazo processual: vira tarefa de ligar;
3. **o que acabou** — a sequência esgotada vira desfecho;
4. **o que ainda não** — data futura, fora da janela, fim de semana, intervalo mínimo, teto
   diário. Estes **adiam, nunca cancelam**: o toque continua devendo;
5. **o que falta** — sem modelo no idioma, vira tarefa manual.

A ordem importa porque as respostas são diferentes: "bloqueado" some da fila para sempre,
"adiado" volta amanhã, "tarefa" aparece para um humano fazer.

- **Janela de horário**, nunca fim de semana, **intervalo mínimo de 20 h** entre dois toques
  ao mesmo contato, **teto diário por instância** (por instância e não global: é a instância
  que é banida, não a conta), **variação do texto** e **nunca para quem nunca respondeu** —
  disparar para quem nunca respondeu é a assinatura mais clara de disparo em massa que
  existe, e é o padrão que os classificadores do WhatsApp procuram.
- **A variação é determinística**, não aleatória: o cron pode passar duas vezes pelo mesmo
  pendente, e a mensagem já mostrada ao responsável para aprovação não pode mudar debaixo
  dele.

> **"No fuso da pessoa" é mais do que o sistema honestamente sabe.** O cadastro tem país,
> não fuso, e um DDI não identifica fuso (os Estados Unidos têm seis). Então são duas
> janelas: **8h–20h de Brasília para quem está no Brasil**, que é o fuso dela de verdade, e
> **12h–18h para quem está no exterior** — a faixa que continua sendo horário decente em
> quase toda a extensão onde este público está. Mais estreita porque a incerteza é maior, e
> o erro que ela evita (mensagem às 4h da manhã de alguém) custa uma denúncia.

### Opt-out permanente

Quem pede para não receber mais mensagem, em qualquer idioma e de qualquer forma, **nunca
mais** recebe follow-up automático — de nenhum motivo. Vale também para quem foi encaminhado
à DPU: a pessoa já recebeu o encaminhamento certo, e ir atrás dela é ocupá-la com um serviço
que não vai contratar.

O opt-out fica registrado com data **e a mensagem que o originou** (recortada em 500
caracteres: é prova do pedido, não cópia do histórico). Sem ela, seis meses depois ninguém
consegue dizer se o contato foi silenciado porque pediu ou porque uma regex casou com uma
frase parecida — e é essa diferença que separa cumprir a LGPD de alegar que cumpriu.

### Onde ele aparece

- **"Follow-ups de hoje"**, no topo de "Meus atendimentos", antes até da faixa de números.
  É o único trabalho da tela que leva um minuto e some quando é feito; enterrado embaixo das
  listas, ele acumula — e uma fila de rascunhos acumulada faz o follow-up parar de existir
  sem ninguém ter desligado nada. As **tarefas dividem o bloco** com os rascunhos de
  propósito: "ligar, há prazo correndo" e "escrever à mão, não há modelo em crioulo" são o
  mesmo trabalho de acompanhamento por outro meio, e separá-los em duas telas é como um dos
  dois deixa de ser feito.
- **No card do quadro**, um marcador discreto com o próximo toque e o motivo. Não é
  urgência: é a informação de que o caso *não* está esquecido, que é o oposto do que um card
  parado comunica.
- **No popup do card**, a espera, o próximo toque e "agendar follow-up" sem sair do quadro.
- **Na faixa de risco da Operação**, os follow-ups escritos e não tratados.
- **Na linha do tempo do caso**, cada toque com data, canal, motivo, **idioma**, quem
  aprovou e o texto enviado. O texto vem gravado no próprio toque, e não montado a partir do
  modelo: um modelo editado no mês que vem reescreveria retroativamente o que a pessoa
  recebeu, e a linha do tempo mentiria exatamente onde alguém foi procurar a verdade.

### A varredura

Roda pendurada no cron que já existia (`/api/cron/followups`) porque **o plano Hobby da
Vercel aceita poucos cron jobs**, e um deploy recusado por causa de uma linha a mais no
`vercel.json` seria um follow-up que nunca sai. O laço vive em `lib/followup/varredura.ts` e
tem rota própria (`/api/cron/espera`) para disparar à mão.

Código: `lib/followup/` (`motivos` · `regras` · `modelos` · `varredura` · `resposta` ·
`metricas`) · `components/followup/` · `app/api/followup/` · migration `029`.
Endereço: `/dashboard/followup`.

---

## 11. O mapa do atendimento

`/dashboard/mapa`. A tela que responde a pergunta da terceira semana de uso — **"se a
pessoa disser X, o que a Ana faz?"** —, que sempre teve resposta espalhada por doze
arquivos e três mil linhas de comentário.

Treze etapas, da mensagem chegando no webhook até o caso virar trabalho na fila, cada uma
com as bifurcações à vista (`se … → então …`), o porquê de existir e o arquivo onde mora.

**O que o mapa ensina e nenhuma outra tela ensinava:** a cor separa *portão* e *rede*
(código determinístico, que decide sem perguntar ao modelo) de *modelo*. O mapa inteiro
tem **uma única caixa com um LLM escrevendo**. Quem olha um agente imagina que ele decide
tudo; é o contrário — ele escreve dentro de um corredor estreito, e o corredor é o resto do
desenho. Metade dos pedidos de "muda o prompt" vira outra conversa depois disso.

A seção "se a pessoa disser X" marca cada linha com a **origem**: `em código` (muda com uma
versão nova) ou `configurado` (muda em Treinar o agente, e as linhas configuradas são lidas
do que está gravado). Sem essa marca, alguém perde meia hora tentando editar na tela uma
decisão que está no `transfer-gate`.

> **Mapa que mente é pior do que mapa nenhum.** Um fluxograma feito à parte dura uma
> sprint: o código muda, o desenho não, e passa a existir uma fonte errada com aparência de
> oficial. Por isso o mapa é DADO (`lib/agent/mapa.ts`), cada etapa aponta o arquivo onde
> mora, e `tests/mapa.test.ts` falha se um arquivo citado sumir, se as classificações
> divergirem do domínio ou se aparecer uma segunda caixa de modelo.

---

## 12. Stack e estrutura

**Next.js 14** (App Router, TS, Tailwind) · **Supabase** (Postgres + pgvector) ·
**Vitest** · **DeepSeek** (LLM) · **Z-API** (WhatsApp) · **OpenAI** (embeddings do RAG e
transcrição de áudio) · deploy na **Vercel**.

```
imigrar-agent/      a aplicação (painel, webhook, agente)
  IDENTIDADE.md       paleta, tipografia e a faixa MRZ — ler antes de mexer em tela
  scripts/migrar.mjs  `npm run migrar`: aplica só o que falta e grava em schema_migrations
  supabase/migrations/
  lib/agent/material-oficial.ts   as regras que entram em TODO prompt (não editáveis)
  lib/agent/mapa.ts               o mapa do atendimento, como dado
  lib/crm/funil.ts                funis, etapas e a montagem do quadro
  lib/followup/regras.ts          quando o sistema pode falar primeiro (pura, testada)
  lib/whatsapp/remetente.ts       grupo/transmissão/status não viram atendimento
  components/dashboard/campos.tsx seleção e data do sistema (sem controle nativo)
  components/atendimentos/qualidade.tsx  completude + prioridade do lead
ingestao/           pipeline Python que vira base vetorial (não precisa de pip)
material-oficial/   as 7 cartilhas + legislação — a fonte de tudo que a Ana afirma
marca/              logotipos originais do cliente
docs/               referência (system-prompt-v1.md — histórico, não é a fonte da verdade)
```

Os PDFs têm o nome do `id` que já têm em `ingestao/fontes.json`. Os scripts da raiz
(`npm run dev`, `build`, `test`) só encaminham para `imigrar-agent/`.

**Identidade visual:** teal `#009687` é identidade, azul `#005EC4` é ação. Amostrados do
logotipo, pixel a pixel. Densidade acima de espaço em branco — é ferramenta de uso diário.

**`tsconfig.json` não tem `baseUrl`, e isso é de propósito.** Entrada relativa em `paths`
resolve contra a pasta do próprio arquivo desde o TS 4.4, então `baseUrl: "."` não fazia
diferença nenhuma — `"@/*": ["./*"]` aponta para o mesmo lugar com ou sem ele. O que ele
fazia era só uma coisa: ser marcado como erro no editor, porque está em rota de remoção no
TypeScript 7. O `tsc` da linha de comando ainda aceita, então o build passava e só o editor
reclamava. **Cuidado ao ler o comentário no topo de `middleware.ts`:** ele credita ao
`baseUrl` a correção da falha de deploy no Edge ("referencing unsupported modules"). Não é
ele — o que resolve aquilo é o import **relativo** em todo o grafo do middleware, e quem
garante isso é `tests/middleware-edge.test.ts`, que percorre o grafo e falha se um `@/`
reaparecer.

**Não se usa controle nativo do navegador** (`components/dashboard/campos.tsx`). `<select>` e
`<input type="date">` mudam de cara em cada máquina, e num painel onde a data é prazo
processual "onde eu clico para escolher o dia" não pode ser pergunta nova a cada computador.
Também não cabe explicação: quase toda escolha aqui precisa da linha que diz o que ela
implica ("perdido exige motivo", "isto não é prazo processual"), e `<option>` é texto puro.
`Selecao` e `CampoData` cobrem isso, com teclado inteiro; o campo de data aceita **digitar**
(quem tem a notificação na mão digita `27082026` e segue) e **data pela metade invalida o
valor guardado** — antes o campo mostrava `27/08/202` e o formulário salvava a data velha, em
silêncio. Confirmação destrutiva usa `ConfirmDialog`, nunca `window.confirm`.

---

## 13. Estado da infraestrutura (28/08/2026, madrugada)

> **O painel está NO AR e funcionando**: https://agente.imigrarbrasil.com.br
> Login: `studioneedbr@gmail.com`. A senha foi redefinida direto no banco em 27/08 —
> **peça a senha atual a quem redefiniu e troque**. Não existe tela de trocar senha
> (ver seção 14): hoje o único caminho é `update users set password_hash` com o mesmo
> formato scrypt de `lib/auth/password.ts`.

**Supabase** — projeto `myfmqkgpnpmvlmvaewiq`. Estava **completamente vazio** até 26/08.

**AS MIGRATIONS RODAM SOZINHAS AGORA.** `npm run migrar` lê `supabase/migrations`, aplica na
ordem só o que falta, grava cada arquivo em `schema_migrations` e roda cada um numa
transação. Precisa de `DATABASE_URL` (a conexão direta com o Postgres, não a
`service_role` — o PostgREST não executa DDL). Sem esse registro, "o que falta neste banco?"
só se responde conferindo tabela por tabela, que foi o que custou caro com a `024`.

**Estado do banco em 28/08, conferido em `schema_migrations` e nas colunas: as 29 migrations
aplicadas**, da `001` à `029_followup_por_motivo.sql`. Isso inclui a `023` (ativação e modo
sombra), a `024` (custo e vocabulário), a `025` (parecer barrado e telefone normalizado), a
`026` (funis, etapas e `leads.funil_id` / `leads.etapa_id`), a `027` (etapa comercial:
proposta, valor contratado e categoria da perda), a `028` (`apoio_ids`) e a `029` (motivo da
espera, `followup_modelos`, `followup_toques`, a mensagem que originou o opt-out e o teto
diário por instância).

Conferido direto no Postgres, e não só pela mensagem do runner: o funil padrão está em
`0:Novo · 1:Em atendimento · 2:Proposta enviada · 3:Reunião agendada · 4:Fechado · 5:Perdido`
— a etapa nova entrou **entre** "em atendimento" e "reunião agendada", que é onde ela
acontece no escritório. Nascida no fim do quadro, depois de "perdido", ninguém a usaria.

> Nota histórica: `001`, `002` e `003` estavam marcadas como "puladas de propósito" — a
> `004` as substitui. O runner as aplicou por serem idempotentes (`create table if not
> exists`), e o banco continua no formato consolidado da `004`. `011`, `012`, `013` e `015`
> são catálogo de funções e pisos da CCT de limpeza do Rio: dado da Shine Rio, que o app não
> lê mais; `services_catalog` e `function_pricing` seguem criadas e vazias.

**A `026` pode rodar depois do código sem estrago.** Sem ela o CRM abre com o funil padrão
que vive em código (`lib/crm/funil.ts`) e as cinco colunas de sempre; o botão de desenhar
etapas fica desligado, porque criar etapa num funil que não existe no banco daria erro a
cada clique, e arrastar continua funcionando — o que move o card é o `atendimento_status`,
que não mudou.

**Outros achados do banco em 27/08:**

- `rag_chunks` com **1.723 trechos** indexados — o acervo está carregado.
- `agent_config` tinha **uma única chave** (`chave_geral`). Ou seja: ninguém nunca
  conseguiu salvar nada em Treinar o agente, e o agente rodou o tempo todo nos padrões de
  código. A causa provável era a mensagem de erro: *"Falha ao salvar o treinamento. Confira
  os campos obrigatórios"* numa tela de sete abas com dezenas de campos. Agora o erro
  **nomeia o campo** (`objections › 3 › resposta — ...`), a gravação confere bloco a bloco
  e não promete "nada foi alterado" quando metade já foi.

### As QUATRO causas empilhadas que impediam o deploy (todas resolvidas)

Cada uma escondia a seguinte, e cada uma tinha uma mensagem de erro diferente. Se o
deploy voltar a falhar, comece por aqui.

> **1. Root Directory = `imigrar-agent`.** A aplicação está numa subpasta. Com o campo
> vazio, a Vercel constrói a raiz e o build morre com `exit 127`. O `vercel.json` (que
> registra os **dois crons de follow-up**) também está dentro de `imigrar-agent/`: com
> Root Directory errado, os crons nunca foram agendados.
>
> **2. A `jose` no Edge.** Ela puxa CompressionStream pelo barrel de JWE e o bundler do
> Edge recusa. O JWT foi reescrito com Web Crypto (HS256 é HMAC-SHA-256 com base64url em
> volta) e a dependência saiu do projeto.
>
> **3. O alias `@/` não resolve no bundle do middleware.** *"The Edge Function 'middleware'
> is referencing unsupported modules"* — o nome engana: não há módulo incompatível. O
> middleware é empacotado num namespace próprio (`__vc__ns__/0/imigrar-agent/`), o alias
> não resolve ali, e o que não resolve vira "externo", que no Edge é reportado como "não
> suportado". Corrigir só o arquivo de entrada **empurra o erro para o import seguinte** —
> foi o que aconteceu. Hoje o grafo é fechado e relativo, e `tests/middleware-edge.test.ts`
> falha se alguém reintroduzir um `@/` ou uma dependência de `node_modules` ali.
>
> **4. Framework Preset — esta foi a que derrubava tudo no fim.** O projeto estava
> configurado como site estático: a Vercel rodava o build, ignorava o resultado e publicava
> a pasta `public/`. O sintoma era desconcertante — deployment "Ready", `/login` com 404 da
> **plataforma** e `/api/*` com `MIDDLEWARE_INVOCATION_FAILED`. A pista que fechou o
> diagnóstico: `/marca/logotipo-original.png` respondia **200** enquanto
> `/_next/static/...` dava 404. Ou seja, `public/` estava sendo servida como raiz.
> Correção: **Framework Preset = Next.js**, sem override de Build Command nem de Output
> Directory.

Nada disso aparece no build local, no typecheck ou no lint. E o efeito não é uma tela
quebrada: é o deploy inteiro não acontecer.

> ⚠️ **Redeploy reconstrói o commit DAQUELE deployment, não o código atual.** Redeployar um
> build antigo o traz de volta inteiro, com o código antigo — e ele passa como "Ready".
> Para publicar o código de agora, use um deployment novo a partir da `main`.

### Variáveis (Vercel)

Já configuradas: `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (pela integração
nativa do Supabase), `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `DEEPSEEK_API_KEY`,
`DEEPSEEK_BASE_URL`.

Configuradas em 28/08: **`ZAPI_INSTANCE_ID` / `ZAPI_TOKEN` / `ZAPI_CLIENT_TOKEN`** e
**`WEBHOOK_VERIFY_TOKEN`** — é o que ligou o WhatsApp. Também entrou a `OPENAI_API_KEY`,
que acendeu o RAG e a transcrição de áudio.

Faltam: **`TEAM_WHATSAPP`** (o aviso de prazo a confirmar — depende do Walter mandar o
número pessoal de advogado) e `CRON_SECRET`.

Regra do tipo: se vaza e alguém usa contra você, é **Secret**. Nada que comece com
`NEXT_PUBLIC_` deve ser Secret — essas variáveis são embutidas no JavaScript do navegador.

⚠️ Variável de ambiente **só vale para deploy novo**. Salvar na Vercel não muda o que está
no ar.

⚠️ Se as variáveis do Supabase estiverem só em **Production**, os deploys de *preview*
rodam em memória: painel abre, fila vazia, tudo some no refresh.

### O estado do agente (28/08, madrugada)

```
supabase: true    banco no ar, persistente
deepseek: true    conta com saldo, respondendo de verdade
rag:      true    a OPENAI_API_KEY entrou — os 1.723 trechos saíram da prateleira
audio:    true    idem, pela mesma chave
zapi:     true    ← o WhatsApp está no ar (leia a seção seguinte antes de comemorar)
```

A decisão de 27/08 ("só DeepSeek, sem OpenAI") foi revista na prática: a chave entrou, e
com ela o RAG e a transcrição. O parágrafo abaixo, escrito quando `rag` era `false`,
fica como registro do raciocínio — e da conta que já estava paga.

**Decisão de 27/08: só DeepSeek por enquanto, sem OpenAI.** Consequências, para não haver
surpresa:

- **Sem RAG a Ana não afirma nada sobre imigração.** O prompt manda responder só com base
  no material oficial; sem material, ela acolhe, diz que não tem a informação e encaminha.
  Ela continua qualificando, classificando e detectando prazo — que é o que alimenta a
  fila —, mas não responde "quais documentos preciso para reunião familiar".

  ⚠️ **Atenção ao custo já pago.** A base vetorial JÁ ESTÁ CARREGADA no Supabase de
  produção: **1.723 trechos** (legislação 844, doutrina 567, cartilha 312), indexados com
  `text-embedding-3-large` em 1.024 dimensões, ao custo de US$ 0,08. O que falta é só a
  `OPENAI_API_KEY` na Vercel — ela é necessária para transformar a PERGUNTA em vetor na
  hora da consulta. Sem ela, os 1.723 trechos ficam parados sem serem usados.

  Ou seja: a decisão "só DeepSeek" não economiza a indexação, que já foi feita. Ela
  apenas deixa a base ociosa. Ligar custa centavos por mês em embedding de consulta — e
  a mesma chave liga a transcrição de áudio. Vale reconsiderar.
- **Sem transcrição, quem manda áudio recebe um pedido para escrever.** Confirmado como
  desejado em 27/08, e já é o comportamento no código. Cada áudio vira uma linha em
  `/dashboard/audios` **com o áudio original** para alguém ouvir e retomar.
- O DeepSeek não tem API de embedding, então RAG exige OpenAI (ou um TEI auto-hospedado —
  ver `EMBEDDINGS_PROVIDER=tei` no `.env.example`).

**Custo medido, não estimado:** uma conversa real de 3 turnos gastou **US$ 0,01**
(saldo 5,00 → 4,99). Cerca de US$ 0,003 por turno. O custo é pelo tamanho do prompt, então
conversa longa fica mais cara por mensagem — e vai subir quando o RAG entrar, porque ele
injeta trechos das cartilhas no prompt.

### A Z-API entrou no ar (28/08, madrugada)

Primeira mensagem de WhatsApp de verdade atendida pela Ana, ponta a ponta:

```
03:24:18  cliente   Oi
03:24:25  Ana       Boa noite! Aqui é a Ana, da Imigrar Brasil. Como posso te ajudar?
```

Sete segundos. O caminho inteiro funcionando: Z-API → webhook → banco → DeepSeek → Z-API
de volta.

**As três coisas que estavam erradas**, todas encontradas por medição e não por leitura:

1. **O Client-Token não era o que parecia.** O primeiro valor tentado foi recusado com
   `{"error":"Client-Token not allowed"}`. O que vale é o token de segurança **da conta**
   (Z-API → Segurança), e ele tem letras não-hexadecimais nas pontas que é fácil tomar por
   enfeite e cortar na hora de copiar. Sem ele, nenhuma chamada sai e nenhuma entra.
2. **O `WEBHOOK_VERIFY_TOKEN` da Vercel não batia com o `?token=` da URL na Z-API.** Todo
   POST da Z-API voltava 401 e nada chegava — sintoma: "mandei e não apareceu nada", sem
   erro em lugar nenhum. Os dois valores têm de ser idênticos, e o diagnóstico é um
   `curl -o /dev/null -w "%{http_code}"` no webhook com o token na URL.
3. **A mensagem de teste saía do próprio aparelho pareado.** Aí ela chega marcada
   `fromMe` e o webhook descarta de propósito, para a Ana não responder a si mesma. Teste
   de WhatsApp precisa de um SEGUNDO celular; não existe testar consigo mesmo.

**A ordem importa, e não é a intuitiva.** Cadastre o `WEBHOOK_VERIFY_TOKEN` na Vercel
ANTES de apontar a URL do webhook na Z-API. [route.ts](imigrar-agent/app/api/webhook/whatsapp/route.ts)
só fecha a porta quando existe `WEBHOOK_VERIFY_TOKEN` **ou** `ZAPI_CLIENT_TOKEN`; sem
nenhum dos dois ele aceita qualquer POST, e ficou assim, aberto e verificado em produção,
durante a janela entre um passo e outro.

**O webhook é por instância.** Só o campo "Ao receber" (`on-message-received`) é usado — os
outros eventos o código descarta. Não existe endpoint da Z-API para LER essa configuração
(`GET /webhooks` responde `NOT_FOUND`), então a conferência é no painel ou por teste real.
E, ao trocar de instância, ela não migra junto: tem de ser configurada de novo.

> ⚠️ **PENDÊNCIA VIVA: a Ana está no número errado.** A instância `3F736BC3…` está pareada
> em **55 33 9168-2135 (Cássio Bispo)** — um número pessoal, em uso para outras coisas —, e
> não no `11 91985-4664`. Como não existe palavra-chave de ativação, **qualquer pessoa que
> mandar mensagem para esse número é atendida pela Ana**, com o nome e a foto do Cássio.
> Enquanto o repareamento no 4664 não acontece, a saída é tirar a URL do campo "Ao receber".
>
> Quando o número definitivo entrar: mudam `ZAPI_INSTANCE_ID` e `ZAPI_TOKEN` na Vercel (o
> Client-Token é da conta e continua o mesmo) e o webhook precisa ser configurado na
> instância nova.

> **Gatilho de ativação — desenhado e adiado.** A ideia de a Ana só responder depois de uma
> palavra-chave ("Olá Ana") nasceu justamente de ela estar num número pessoal. Foi adiada em
> 28/08 por ser trabalho em cima de algo que vai mudar: no 4664 dedicado, todo mundo que
> escreve é cliente, e o gatilho deixa de ser necessário. O lugar de implementá-lo, se
> voltar a fazer falta, é [lib/agent/ativacao.ts](imigrar-agent/lib/agent/ativacao.ts), que
> já concentra a decisão de responder ou calar.

### O primeiro atendimento real (27/08, simulador em produção)

Funcionou: espanhol desde a primeira palavra, ficha completa (nome, nacionalidade,
localização, entrada pelo controle migratório, objetivo, resumo), `QUENTE_PRAZO`,
`prazo_tipo: multa` e **`prazo_data_limite: null`** — a regra central segurou.

Três achados que valem revisão:

1. **O primeiro turno abriu torto**: a resposta foi *"Espero tu confirmación para pasar el
   contacto"*, referindo-se a uma confirmação que ninguém tinha pedido.
2. **Ela afirmou coisa sobre situação migratória sem material**: *"que te hayan sellado el
   pasaporte en Pacaraima es buena señal: significa que tu entrada quedó registrada de
   forma regular"*. Provavelmente correto, mas é exatamente o freio que o RAG deveria dar
   e hoje não existe. Vale o Walter ler as primeiras conversas com esse olho.
3. **Chave presente ≠ IA funcionando.** O teste anterior pareceu um sucesso e nenhuma das
   respostas tinha saído do modelo: a conta estava com `Insufficient Balance` e tudo caiu
   no motor determinístico, sem que nada na tela mudasse. Hoje `lib/agent/saldo.ts`
   pergunta à conta se ela consegue responder, e a faixa distingue *"a captação está
   parada"* de *"o agente não está pensando"*.

### Git e deploy

`origin/main` está em **`c458ed0`** (27/08, noite), verificado antes de subir: `tsc
--noEmit` limpo, `next lint` 0 erros/0 warnings, `next build` compilando e **695 testes
passando**.

> ⚠️ **O deploy não está automatizado a partir deste repositório.** Em 27/08, a conta
> Vercel acessível pelo CLI (`cassio-bispos-projects`) NÃO tem projeto da Imigrar Brasil —
> só `vapogold`, `shine-rio-agent` (que é outro produto: "Shine Rio · Centro de Operações
> do Agente"), `sistemagestao` e `aboutique`. Também não existe `.vercel/` linkado na pasta.
> Ou o projeto vive em outra conta/time, ou o site em produção
> (`agente.imigrarbrasil.com.br`) é servido por um deploy feito de outro lugar.
> **Antes de prometer "está no ar", descubra qual é o projeto** — `vercel project ls` na
> conta certa, depois `vercel link` dentro de `imigrar-agent/`.

> ⚠️ **`git push origin main` estava respondendo "up-to-date" sem enviar nada.** Cinco
> commits ficaram presos localmente sem nenhum erro visível. O que funciona é o refspec
> explícito: `git push origin HEAD:refs/heads/main`. **Confira `git ls-remote origin main`
> depois de empurrar** — não confie na mensagem de sucesso.

> ⚠️ **Mais de uma sessão trabalhou nesta mesma pasta ao mesmo tempo.** Se duas escreverem
> no mesmo arquivo, a última a salvar apaga a outra sem aviso. Uma de cada vez, ou dividir
> por pasta. Em 27/08 havia trabalho não commitado no repositório (ativação do agente,
> quadro de atendimentos) com **erros de lint que quebram o build** — `next build` trata
> `no-unused-vars` como erro, não warning. Rode `npm run build` antes de commitar.

---

## 14. O que falta

**Bloqueado esperando terceiros**

- [x] **A base vetorial está carregada** — 1.723 chunks indexados (cartilha 312,
      legislação 844, doutrina 567), embeddings de 1.024 dimensões, custo US$ 0,08.
      `npm run test:rag` passa 25/25: as dez consultas da auditoria recuperam o trecho
      certo dentro do top-6 e sobrevivem ao corte de relevância.
- [ ] `OPENAI_API_KEY` nas variáveis da Vercel — sem ela, em produção continuam
      desligados a busca no material oficial E a transcrição de áudio.
- [x] **DeepSeek ligado e pagando** — US$ 5 de saldo, respondendo de verdade em produção
- [x] **`AUTH_SECRET` e as variáveis de base** já estão na Vercel
- [ ] **Z-API — a instância do 4664.** É o único bloqueio para virar operação de verdade:
      sem ela nenhuma pessoa real consegue escrever para a Ana
- [ ] número pessoal do Walter → `TEAM_WHATSAPP` → aviso ativo do bloco 1
- [x] **as migrations estão aplicadas em produção** — as 29, conferidas coluna a
      coluna e não só pela mensagem do runner (ver §13)

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
- [x] **Migrations automáticas** — `npm run migrar` + `schema_migrations` (§13)

**Feito em 27/08, noite (a rodada de acabamento)**

- [x] **O CRM** (§9) — funis e etapas que o escritório cria, com etapa apontando para
      status; o antigo "Quadro" virou `/dashboard/crm`
- [x] **O mapa do atendimento** (§11) — `/dashboard/mapa`
- [x] **A tela do caso parou de rolar** — cabeça fixa (prazo, cartão de qualidade, ações)
      e o resto em abas: ficha, retornos, classificação e histórico no mesmo espaço, com a
      rolagem acontecendo DENTRO do painel. Prazo confirmado encolhe para uma linha
- [x] **Seleção e data do sistema** (§12) — nada mais nativo do navegador
- [x] **Qualidade do lead** — completude (ficha mínima) e prioridade, que são eixos
      diferentes; substituiu o "score 43" herdado do funil comercial no dossiê da conversa,
      e entrou no resumo do card do CRM. Antes a conversa dizia "2/5" com uma lista escrita
      à mão enquanto a ficha do domínio tinha seis itens — duas contas da mesma coisa
- [x] **Métricas com abas e filtro de nacionalidade** (§5), com o recorte declarado
- [x] **As regras invioláveis em todo prompt** (§7) e a aba "Material oficial" no treinar
- [x] **Treinar o agente: o erro diz o campo** — e a descoberta de que `agent_config`
      tinha uma chave só, ou seja, ninguém nunca conseguiu salvar (§13)
- [x] **A ficha deduz o objetivo e a Ana para de reperguntar** (§7)
- [x] **Resto da Shine Rio removido da interface** — simulador refeito (era mock de
      WhatsApp com "Abrir proposta em PDF"), cenários de teste de portaria trocados por
      imigração, setores de transferência (RH/DP/Suporte → Jurídico, Atendimento,
      Documentação, Financeiro, Diretoria), "Comercial" agora se lê **Jurídico**, remetente
      padrão do Brevo. A aba **Ensaios foi removida**
- [x] **Meus atendimentos** — faixa de números no topo e bloco vazio virando uma linha

**Feito em 28/08 (a etapa comercial e o follow-up)**

- [x] **Grupo do WhatsApp não vira mais lead** (§9) — o primeiro card do quadro era o JID
      de um grupo, o que significa que a Ana estava respondendo dentro de grupos. Corte no
      webhook antes de qualquer escrita, e os que já estavam no banco somem da fila pela
      leitura do próprio número. Veio antes de tudo por um motivo: follow-up automático
      disparado num grupo é o pior caso possível deste sistema
- [x] **Telefone legível no lugar do nome** — `+55 33 9940-2577` com marcador "sem nome
      ainda", em vez de doze dígitos colados que se leem como código de sistema
- [x] **O quadro rola na horizontal** — a quinta coluna caía para uma segunda fileira e
      PERDIDO aparecia embaixo de NOVO, como se fosse continuação dela
- [x] **PROPOSTA ENVIADA** (§9) — a etapa onde o dinheiro aparece, com valor, serviço e
      validade; **FECHADO com valor contratado** (ou "sem contrato", explícito); **PERDIDO
      com categoria** que se soma, além da frase que se lê
- [x] **Trocar o responsável e incluir quem mais está no caso** (§9) — um dono, e o agente
      seguindo o dono quando o caso troca de mãos
- [x] **O follow-up por motivo de espera** (§10) — a régua inteira: motivo, cadência
      editável, sequência com fim, modelos multilíngues sem idioma de reserva, fila de
      rascunhos para aprovação, proteções do número e opt-out permanente com rastro
- [x] **Métricas de follow-up** (§5) — com a taxa de resposta por idioma, que é o alarme
      da promessa central do projeto
- [x] **O modo sombra parou de ter efeito no mundo** (§8) — o flag não chegava até
      `executeTool`, então o ensaio acordava o advogado no WhatsApp e agendava follow-up
      para o cliente. Havia um caminho que cai em sombra sem ninguém escolher (instância
      não reconhecida), o que tornava isso rotina e não acidente
- [x] **O webhook deixou de aceitar requisição sem prova nenhuma** (§7) — sem segredo
      configurado ele recusa com 503; e header ausente com Client-Token configurado deixou
      de passar batido
- [x] **As respostas da Ana encolheram** (§7) — 2 a 3 frases, com a duplicidade de
      definição entre `knowledge.ts` e `training.ts` desfeita: vencia a mais permissiva
- [x] **`baseUrl` fora do `tsconfig.json`** (§12) — não fazia nada além de ser erro no
      editor, e o comentário do `middleware.ts` creditava a ele uma correção que não é dele
- [x] **A conta ativa aparece no painel** (§6) — barra lateral com nome, e-mail e papel, e
      a faixa do agente desligado dizendo "por você" quando a conta nomeada é a sua. Antes
      o painel nomeava uma conta e não havia tela nenhuma que dissesse qual era a sua
- [x] **A conta dona do painel** (§6, migration `030`) — o primeiro admin não pode ser
      apagado, desativado nem rebaixado, e a trava é trigger no banco porque é no SQL
      Editor que as contas deste projeto são editadas

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
- [ ] **Trocar senha pelo painel** — a redefinição já existe pela linha de comando
      (`npm run senha -- <e-mail>`, ver §15); o que falta é dentro do painel: cada pessoa
      trocando a sua, e um admin definindo a de outra conta
- [ ] **Dashboard e CRM por pessoa** — escopo a fechar
- [x] **Treinar o agente** — as abas deixaram de ser da base comercial; falta a
      **primeira gravação de verdade** (§13: `agent_config` ainda só tem `chave_geral`).
      Enquanto ninguém salvar, o agente segue nos padrões de código — que funcionam, mas
      não são o que a equipe escreveria
- [ ] **Métricas em PDF** — pedido de 27/08, escopo a confirmar: hoje a exportação é de
      leads, em planilha, e o pedido pode ser "exportar a tela de métricas"
- [ ] **Descobrir o projeto Vercel** deste painel e linkar a pasta (§13, Git e deploy)
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
- resposta de sombra **não entra no histórico** enquanto não for enviada de verdade, e em
  sombra **nenhuma tool sai do sistema** — nem WhatsApp para o advogado, nem follow-up
  agendado para a pessoa;
- **webhook sem segredo configurado recusa** (503), e header ausente não passa;
- **2 a 3 frases por mensagem** — e a regra está escrita em dois arquivos, que têm de mudar
  juntos;
- **etapa é nome, status é domínio** — etapa de CRM nunca vira um estado paralelo, e apagar
  etapa ou funil não apaga caso nenhum;
- **grupo, transmissão, status e canal não viram atendimento** — o corte é no webhook, antes
  de qualquer escrita, e é *fail-closed*;
- **sem modelo no idioma da pessoa, nada dispara** — vira tarefa manual, e não existe idioma
  de reserva;
- **caso com prazo processual nunca entra em follow-up automático** — gera tarefa de ligar;
- **opt-out é para sempre e vale para todos os motivos**, com a data e a mensagem que o
  originou guardadas;
- **três toques por motivo de espera, e acabou** — o contador zera quando a pessoa responde
  ou quando o motivo muda;
- **fora da janela adia, não cancela** — o toque continua devendo e sai na próxima passagem;
- **valor proposto, valor contratado, validade e categoria da perda são só de humano** — é
  receita no painel do escritório;
- as **regras do material oficial entram em todo prompt** e não se editam pela tela;
- **`funilId` e `etapaId` são só de humano** — o agente não move card;
- **a conta dona do painel não se apaga, não se desativa e não se rebaixa** — e a trava é
  um trigger no banco, porque é lá que as contas deste projeto sempre foram editadas;
- **nada de `<select>`, `<input type="date">` ou `window.confirm` nativos** na interface.

---

## 15. Rodar

```bash
npm run setup     # instala em imigrar-agent/
npm run dev       # http://localhost:3000
npm test          # 807 testes
npm run typecheck
npm run migrar    # aplica no banco só as migrations que faltam (precisa de DATABASE_URL)
npm run senha -- <e-mail>   # redefine a senha de uma conta (mostra a nova UMA vez)
```

**Senha não se recupera, só se substitui.** O banco guarda um hash scrypt, que é de mão
única: nem um administrador, nem quem abre o Supabase, nem quem escreveu o sistema lê a
senha de volta. Quando alguém perde a dela, o caminho é `npm run senha -- <e-mail>`, que
grava uma nova e a mostra **uma vez** no terminal. O script existe em vez de "roda um UPDATE
no SQL Editor" porque o UPDATE à mão erra de um jeito que não avisa: o formato é
`scrypt$N$r$p$salt$hash` com N=2^17, e qualquer coisa fora disso o banco aceita e o login
recusa — a pessoa fica trancada achando que digitou errado. `tests/auth.test.ts` compara os
parâmetros do script com os de `lib/auth/password.ts` e falha se divergirem.

Primeiro acesso: `/setup` cria o primeiro admin e se tranca depois. Sem
`SUPABASE_SERVICE_ROLE_KEY` no `.env.local`, o app roda em memória e some no reinício.
