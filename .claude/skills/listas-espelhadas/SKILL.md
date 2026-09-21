---
name: listas-espelhadas
description: A mesma lista existe em quatro camadas deste projeto (domínio, check do banco, schema zod das rotas, allowlist do middleware) e elas já saíram de sincronia quatro vezes, sempre em silêncio. Use antes de acrescentar ou mudar um status, uma classificação, um motivo de perda, uma origem de lead ou uma rota pública — e antes de escrever qualquer regra de telefone.
---

# A mesma lista, escrita em quatro lugares

Este projeto tem um modo de falhar que já aconteceu quatro vezes, sempre igual: alguém
acrescenta um valor ao domínio, a tela passa a oferecê-lo, e uma cópia da lista em outra
camada recusa. **Nada disso dá erro de compilação e nada disso quebra a suíte** — o
defeito só aparece quando uma pessoa clica.

## O que já aconteceu

`proposta_enviada` nasceu na migration 027, que anotou, errado, que a tabela `leads` não
tinha check. Tinha, desde a 019. Durante meses:

- arrastar um card para "Proposta enviada" era **recusado pelo banco**;
- criar uma etapa com esse status respondia **400 "Dados inválidos"**, porque o `z.enum`
  das rotas de etapa tinha a mesma cópia desatualizada;
- e o seletor da tela oferecia a opção alegremente, porque ele é montado a partir de
  `COLUNAS`.

`/api/captura/site` nasceu fora da allowlist de rotas públicas: o middleware devolvia 401
antes do handler existir. De fora, indistinguível de token errado.

A regra de DDI de telefone foi escrita três vezes — no importador, na rota de captação e
de novo no script de propostas — e as três versões divergiram.

## Antes de mexer, confira as quatro camadas

**1. O domínio** — `lib/domain/types.ts` (o tipo) e `lib/domain/rotulos.ts` (o rótulo de
tela). Toda lista de valor tem os dois.

**2. O check do banco** — `supabase/migrations/`. Procure assim, e não pelo nome da
migration que você acha que criou a coluna:

```bash
grep -rn "<coluna> in (" supabase/migrations/*.sql
```

A **última** definição é a que vale. Se faltar o valor novo, escreva uma migration nova
com `drop constraint if exists` + `add constraint`.

**3. Os schemas zod das rotas** — `app/api/**/route.ts`. Não escreva a lista à mão:
derive da constante do domínio.

```ts
import { COLUNAS } from "@/lib/fila/kanban";
const STATUS = z.enum(COLUNAS as [AtendimentoStatus, ...AtendimentoStatus[]]);
```

Derivar fecha a porta — acrescentar um valor passa a valer nas rotas sem ninguém precisar
lembrar do arquivo.

**4. A allowlist de rotas públicas** — `lib/auth/public-paths.ts`. **Rota de API que
responde sem sessão não funciona se não estiver aqui.** A correspondência é exata, nunca
por prefixo. Cada entrada justifica por que pode ficar aberta, e o handler tem que se
autenticar sozinho, fail-closed (recusa quando o segredo não está configurado, em vez de
ficar aberta).

## Os guardas que existem

`tests/constraints-e-dominio.test.ts` lê as migrations como texto e compara cada check com
as listas do código, nos dois sentidos — e garante que as rotas de etapa não voltem a ter
lista escrita à mão. `tests/security.test.ts` trava a allowlist: acrescentar rota pública
**tem** que quebrar um teste chamado "mantém aberta apenas a lista conhecida", e essa dor
é o ponto.

Ao acrescentar uma lista nova ao domínio, acrescente o par dela nesse teste.

## Telefone: a regra mora em um lugar

`lib/whatsapp/telefone.ts`. `normalizarTelefone` (só dígitos), `variantesDoTelefone` (o
nono dígito brasileiro) e `comDdiProvavel` (o `55` que o formulário não pede). Nunca
reescreva essa lógica em outro arquivo.

Por que importa mais do que parece: o painel guarda o número como o WhatsApp entrega, com
DDI. Um telefone gravado sem ele **nunca** vai casar com a conversa daquela pessoa — e o
resultado é a mesma pessoa em dois cards, com metade da história em cada. Foi o que
aconteceu com 52 das 76 linhas da primeira carga da planilha.

Os scripts em `scripts/*.mjs` não importam TypeScript e mantêm cópias dessa lógica. Ao
mudar a regra, procure por `comDdiProvavel` e por `55${` nos scripts também.

## A regra geral

Se você está escrevendo um valor entre aspas que já existe em outro arquivo, pare e
importe. Se não der para importar (SQL, script `.mjs`), escreva um teste que compare as
duas cópias — é exatamente o que `constraints-e-dominio` faz.
