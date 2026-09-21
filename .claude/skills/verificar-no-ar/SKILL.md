---
name: verificar-no-ar
description: Subir a aplicação e conferir uma mudança de verdade — criar usuário, entrar, chamar as rotas e ler o HTML servido. Use SEMPRE antes de dizer que algo funciona, e sempre que mexer em rota de API, middleware, tela do painel ou qualquer coisa que dependa do banco. A suíte deste projeto roda contra o repositório em memória e NÃO pega os defeitos que mais aparecem aqui.
---

# Conferir no ar, não só no teste

`npm test` passa contra o repositório **em memória**. Ele não tem constraint, não tem
middleware e não tem Supabase. Os quatro defeitos mais caros deste projeto passaram por
uma suíte verde:

| defeito | o que a suíte via | o que o app fazia |
|---|---|---|
| `proposta_enviada` fora do check do banco | tudo verde | mover card para a coluna dava erro em produção |
| `/api/captura/site` fora da allowlist | tudo verde | a rota devolvia 401 e nunca funcionou |
| o mesmo status fora do enum do zod | tudo verde | o seletor oferecia a opção e salvar dava 400 |
| telefone sem DDI | tudo verde | lead do site nunca casaria com a conversa de WhatsApp |

Nenhum apareceu em teste. Todos apareceram ao rodar.

## O roteiro

```bash
cd imigrar-agent
pkill -f "next dev" 2>/dev/null; sleep 1
(npm run dev > /tmp/dev.log 2>&1 &)
for i in $(seq 1 45); do curl -s -o /dev/null http://localhost:3000/api/health && break; sleep 1; done
curl -s http://localhost:3000/api/health
```

`repo: memory` é o normal em desenvolvimento. Se precisar do banco de verdade, o
`.env.local` precisa da `SUPABASE_SERVICE_ROLE_KEY` — a `DATABASE_URL` sozinha serve para
`npm run migrar` e para os scripts, **não** para o app.

Entrar (a tela de setup se tranca depois do primeiro usuário, então use um e-mail novo a
cada banco em memória):

```bash
curl -s -c /tmp/ck.txt -X POST localhost:3000/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"t@local.dev","password":"senhadeteste123","name":"T"}'
curl -s -c /tmp/ck.txt -b /tmp/ck.txt -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"t@local.dev","password":"senhadeteste123"}'
```

Daí em diante, `-b /tmp/ck.txt` em tudo.

## Ler a tela

Boa parte das telas busca no servidor, e o HTML entregue já traz o conteúdo:

```bash
curl -s -b /tmp/ck.txt localhost:3000/dashboard/crm > /tmp/t.html
python3 -c "
import io,re,html
s=io.open('/tmp/t.html',encoding='utf-8').read()
print(' '.join(re.sub(r'<[^>]+>',' ',html.unescape(s)).split())[:400])
"
```

**Mas nem todas, e isso já me enganou.** `"use client"` não é o critério (componente de
cliente também é renderizado no servidor). O que decide é **quando o dado é buscado**: a
tela que chama `fetch` dentro de `useEffect` entrega HTML de esqueleto, e conferir o
conteúdo nele dá sempre "não encontrei".

Quem faz isso hoje: `acesso`, `documentos`, `sombra`, `users`, `integracoes`, `treinar`,
`leads/[id]`, e `conversations` — esta última porque o `fetch` mora no componente
(`components/conversas/lista.tsx`), e não na página. Para conferir a lista hoje:

```bash
grep -rl "useEffect" app/dashboard components | xargs grep -l "fetch("
```

`importar` NÃO está na lista: ela só busca quando alguém clica, então o HTML inicial dela
é conferível por inteiro.

Nessas, confira a **API que a tela chama** — `/api/leads/<id>`, `/api/conversations`,
`/api/documentos` — em vez de ler a página. O HTML dessas telas ainda serve para conferir
o que é estático: título, abas, rótulos de botão, ordem dos blocos.

## As três armadilhas

**1. 307 sob `/dashboard` não prova que a rota existe.** O middleware redireciona tudo que
casa com o matcher antes de o Next poder dar 404. `/dashboard/rota-que-nao-existe-123`
também responde 307. Para provar que um código novo está no ar, use uma rota de API com
resposta própria e reconhecível.

**2. O servidor de dev serve código velho.** Já aconteceu de uma mudança em
`lib/` não ser recarregada. Se o comportamento não bate com o código, confirme a lógica
com um teste unitário primeiro; se o teste passa e a rota não, reinicie o `npm run dev`.

**3. O funil do quadro esconde caso.** `montarQuadro` descarta ensaio
(`ambiente: "teste"`, telefone `sim:*`) e conversa filtrada (CURIOSO, DPU, FORA_ESCOPO).
Um lead de teste com texto genérico ("preciso de ajuda") é classificado como CURIOSO e
**não aparece no quadro**. Para criar caso visível, use texto com sinal de caso concreto:
`"sou venezuelana, moro em Boa Vista e recebi uma multa migratoria"`.

## Criar dados sem banco

A rota de captação é a maneira mais rápida de pôr casos no painel em desenvolvimento (o
token cai no default de desenvolvimento):

```bash
curl -s -X POST localhost:3000/api/captura/site \
  -H 'Content-Type: application/json' -H 'X-Imigrar-Token: imigrar_site_dev' \
  -d '{"nome":"Teste","telefone":"(11) 98888-7777","mensagem":"sou venezuelana e recebi uma multa"}'
```

## Antes de encerrar

```bash
pkill -f "next dev"
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

E diga o que **não** foi verificado. Aparência não se confere por HTML: estrutura, ordem
dos blocos e classes, sim; "ficou bonito", não.
