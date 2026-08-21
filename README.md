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

`npm test` — 476 testes, 50 arquivos. Todos passam na cópia inicial. São os testes
da Shine Rio: cobrem webhook, sessão, transbordo, anti-loop e máquina de estados
(que reaproveitamos), mas também precificação de limpeza e CCT (que não). Vão
precisar de poda quando o domínio for trocado.

## Estado por fase

| fase | estado |
|---|---|
| 1 — duplicação e setup | estrutura clonada e rodando local; identidade visual aplicada; falta instância Z-API dedicada, projeto Supabase e chave DeepSeek |
| 2 — base de conhecimento | pipeline pronto, 1.723 chunks gerados; falta subir ao Supabase e testar recuperação real |
| 3 — camada multi-idioma | não iniciada |
| 4 — prompt e calibragem | prompt v1.0 escrito, com 4 pendências apontadas |
| 5 — transbordo e integração comercial | não iniciada |
| 6 — homologação e piloto | não iniciada |

## Identidade visual

Aplicada. Paleta tirada pixel a pixel do logotipo, tipografia própria (Archivo /
Public Sans / IBM Plex Mono) e a faixa MRZ como elemento de assinatura. O detalhe
das decisões está em [imigrar-agent/IDENTIDADE.md](imigrar-agent/IDENTIDADE.md).

Segue com cara de Shine Rio: a lógica de domínio em `lib/agent/*` (precificação de
limpeza, CCT) e as rotas Propostas/Preços/Orçamento/Funcionários, que saíram do menu
mas continuam no disco. Ambas são trabalho da Fase 4.

## O que NÃO fazer

Não reaproveite as credenciais da Shine Rio no `.env.local` daqui. A instância
Z-API é dedicada por cliente — herdar aquela faz este agente responder pelo
WhatsApp da Shine Rio.
