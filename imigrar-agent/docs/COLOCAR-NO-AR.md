# Colocar no ar — passo a passo

O código está pronto. O que falta é **criar contas e colar credenciais** — isso exige
acesso com cartão e senha, então é trabalho de mão humana, não de código.

A ordem abaixo importa: cada passo depende do anterior. Ao final, `/api/health` tem de
responder com tudo `true`.

---

## 1. Supabase — a persistência

Sem isto o app roda em memória. Em produção serverless, cada requisição pode cair numa
instância diferente: o admin que você criar some no refresh, e as conversas do WhatsApp
não persistem. O código grita isso no log, mas não falha — então dá para passar semanas
sem perceber.

1. Criar projeto em <https://supabase.com> (região `South America (São Paulo)`).
2. Copiar de **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
     (é a chave que ignora RLS. Nunca vai para o navegador — só para variável de servidor.)
3. **SQL Editor** → rodar os arquivos de `supabase/migrations/` **em ordem numérica**,
   do `001` ao `019`. Um por vez, conferindo que cada um termina sem erro.
   - `SETUP_COMPLETO.sql` é um consolidado antigo, da base que originou este código. Ignore: use as
     migrations numeradas.
   - A `017_rag_chunks.sql` cria a extensão `vector` e a função `buscar_chunks`. Se a
     extensão falhar, habilite `vector` em **Database → Extensions** e rode de novo.
   - A `019_fila_de_prazos.sql` é a que faz o painel virar fila de prazos: cria os campos
     de imigração, o log de acesso, a reclassificação e o CHECK que impede data de prazo
     sem o nome de quem confirmou. **Sem ela o painel abre, mas a fila vem vazia** — e
     confirmar prazo devolve erro de coluna inexistente.

**Conferir:** `select count(*) from conversations;` responde `0` sem erro.

---

## 2. Base de conhecimento — o que faz a Ana responder

**Este é o passo que muda o produto.** Sem ele o agente não responde nada sobre
imigração: o prompt manda responder só com base no material oficial, então sem material
ele diz "não tenho essa informação" e encaminha 100% dos casos. Funciona, é seguro, e
não é o que foi vendido.

Precisa de `poppler` (fornece `pdftotext`) e Python 3. No Windows, o mais simples é rodar
esta etapa no WSL ou num Mac — é uma vez só, e o resultado vai para o banco.

```bash
cd ingestao
export OPENAI_API_KEY=sk-...
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...

python3 extrair.py              # PDF  -> out/paginas/*.json
python3 chunk.py                # -> out/chunks.jsonl  (1.723 chunks)
python3 embed_upsert.py --estimativa   # confere o custo antes (~US$ 0,08)
python3 embed_upsert.py         # embeddings -> Supabase
python3 buscar.py               # bateria multilíngue de recuperação
```

**Conferir:** `select count(*) from rag_chunks where embedding is not null;` ≈ 1.723,
e `buscar.py` recuperando a fonte esperada nas consultas em PT/ES/EN/FR.

> **Não troque `EMBEDDINGS_MODEL` nem `EMBEDDINGS_DIM` depois disso** sem reindexar tudo.
> O vetor da consulta precisa sair do mesmo modelo que indexou os chunks. Divergir não dá
> erro — dá recuperação silenciosamente ruim, que é muito mais difícil de descobrir.

### Antes do piloto, uma decisão do cliente

151 chunks (9% do acervo) vêm da cartilha do Mercosul (maio/2010) e da de refugiados
(novembro/2010). **As duas são anteriores à Lei de Migração 13.445/2017** e descrevem um
regime revogado. O código trata isso: esses trechos vão marcados e a Ana é instruída a
responder com ressalva explícita. Mas o certo é pedir ao cliente as versões atuais desses
dois materiais e reindexar.

---

## 3. DeepSeek — o que faz a Ana não ser um robô

Sem `DEEPSEEK_API_KEY` o app cai no caminho determinístico (`lib/agent/fallback.ts`). Ele
não deixa ninguém sem resposta — acolhe, aplica os guardrails e encaminha ao time jurídico
assim que aparece caso concreto —, mas **não informa nada**: sem o modelo e sem o material
oficial no prompt, qualquer frase sobre procedimento seria invenção. É o comportamento
seguro, não o produto.

1. Conta em <https://platform.deepseek.com> e adicionar crédito.
2. Criar API key → `DEEPSEEK_API_KEY`.

**Conferir:** o painel em **Integrações** mostra o saldo da conta.

---

## 4. Áudio e RAG — a mesma chave OpenAI

`OPENAI_API_KEY` serve a duas coisas que o DeepSeek não faz: o embedding da consulta ao
RAG (passo 2) e a transcrição do áudio do WhatsApp.

Quem manda áudio neste atendimento é justamente quem tem mais dificuldade de escrever em
português. Sem a chave, o áudio chega, é salvo, e a Ana pede para a pessoa escrever.

---

## 5. Z-API — o WhatsApp

**Instância DEDICADA desta operação.** A instância Z-API é por cliente: reaproveitar a de
outra operação faz este agente responder pelo WhatsApp da outra empresa.

1. Criar instância em <https://z-api.io> e parear o WhatsApp da Imigrar Brasil (QR Code).
2. Copiar `Instance ID`, `Token` e o `Client-Token` da conta.
3. Colar **no painel** em `/dashboard/integracoes` (tem precedência sobre o ENV) ou nas
   variáveis `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`.
4. Configurar o webhook `on-message-received` como:

   ```
   https://SEU-DOMINIO/api/webhook/whatsapp?token=<WEBHOOK_VERIFY_TOKEN>
   ```

   O `?token=` não é opcional. Em produção, sem ele o webhook rejeita tudo — é o que
   impede que alguém que descubra a URL mande WhatsApp pela sua conta e injete conversas.

**Conferir:** o indicador de conexão no topo do painel fica verde, e uma mensagem enviada
ao número aparece em **Conversas** em poucos segundos.

---

## 6. Vercel e domínio

1. `vercel link` (ou importar o repositório pelo site), apontando a **root directory**
   para `imigrar-agent/`.
2. **Settings → Environment Variables**: colar tudo do `.env.example` preenchido, em
   Production **e** Preview.
   - `AUTH_SECRET`: gerar com `openssl rand -base64 48`. Em produção o login falha alto
     se estiver vazio — de propósito.
   - `NEXT_PUBLIC_APP_URL`: a URL final, com o domínio já apontado.
3. **Settings → Domains**: apontar o domínio e esperar o DNS.
4. Os dois crons de follow-up já estão declarados em `vercel.json` e sobem sozinhos.
   Preencher `CRON_SECRET`.
5. Redeploy (variável nova só vale no deploy seguinte).

**Conferir:** `https://SEU-DOMINIO/api/health` responde

```json
{"ok":true,"repo":"supabase","persistent":true,"agent":"deepseek",
 "integrations":{"supabase":true,"zapi":true,"deepseek":true,"rag":true,"audio":true}}
```

Qualquer `false` aí é um passo acima que não terminou.

---

## 7. Primeiro acesso

`https://SEU-DOMINIO/setup` cria o administrador (senha de no mínimo 12 caracteres). A
tela **se tranca sozinha** depois do primeiro usuário — daí em diante, novos usuários
saem de `/dashboard/users`.

---

## 8. Homologação antes de abrir o número

Antes de divulgar o WhatsApp, rodar de verdade — de um celular, não pelo simulador:

- [ ] Pergunta de imigração em **português** → a Ana responde com base na cartilha e cita
      a ressalva de confirmar com o time jurídico.
- [ ] A mesma pergunta em **espanhol** → resposta em espanhol, com o mesmo conteúdo.
- [ ] Pergunta cuja resposta **não está no material** → ela diz que não tem a informação
      e oferece o encaminhamento. **Não inventa.**
- [ ] **Áudio** → aparece transcrito em Conversas e a resposta trata do que foi dito.
- [ ] Pergunta sobre **honorários** → não dá valor, encaminha ao time jurídico.
- [ ] Caso concreto (visto vencido, prazo correndo) → encaminha e o lead entra no Kanban
      como `transferido`.
- [ ] Foto de um documento → chega no painel e fica baixável.
- [ ] "para de me mandar mensagem" → despedida única e silêncio.
- [ ] Sumir por 24h → o cron manda o follow-up **no idioma da conversa**.

O último item só funciona depois do passo 2 e do passo 4 — é o teste que fecha os quatro
entregáveis de uma vez.
