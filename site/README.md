# site/ — imigrarbrasil.com

O site institucional, escrito em código. Astro gera **HTML estático** em `dist/`, que sobe
para o CloudPanel como qualquer site de arquivos. Não há WordPress, banco, painel nem
plugin: todo o conteúdo mora neste repositório.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # gera dist/
```

## Onde mora cada coisa

| o quê | onde |
|---|---|
| posts do blog (50) | `src/data/posts.json` |
| serviços (30) e categorias (6) | `src/data/servicos.json`, `src/data/categorias.json` |
| equipe, depoimentos, FAQ da home, política | `src/data/*.json` |
| telefone, e-mail, endereço, números da home, menu | `src/config.ts` |
| cores e tipografia | `src/styles/global.css` (paleta de `imigrar-agent/IDENTIDADE.md`) |
| tradução e aviso por localização | `src/scripts/idioma.ts` |
| formulário → CRM | `src/scripts/lead.ts` + `public/api/lead.php` |
| redirecionamentos do WordPress | `deploy/vhost-cloudpanel.conf` |
| imagens | `public/wp-content/uploads/` — o nome da pasta é herdado de propósito: são as URLs que o Google Imagens já indexou. Só ficam as imagens que alguma página usa (~11 MB). O build gera `foto.jpg.webp` ao lado de cada uma (fora do git), e o nginx entrega o WebP no mesmo endereço. Imagem nova posta à mão: rode `node scripts/comprimir-originais.mjs` |
| temas do blog e serviço relacionado a cada artigo | `src/lib/blog.ts` (`TEMAS`, `REGRAS`) |
| países e máscaras do telefone | `src/lib/paises.ts` — o telefone sai sempre como `+DDI número`, que é o que o CRM espera |
| animações | `src/scripts/efeitos.ts` e o fim de `src/styles/global.css` |

**Post novo:** acrescente um objeto em `src/data/posts.json` (o mais novo primeiro), com a
imagem em `public/`, e rode o build. O texto do post é HTML (`<h2>`, `<p>`, `<ul>`…); os
`<h2>` viram o índice lateral sozinhos. Os textos vieram do WordPress uma única vez, na
migração; a partir daqui o site não lê nada de lá.

## Blog e SEO

- Cada artigo tem `BlogPosting`, `BreadcrumbList` e, quando escrito em perguntas, `FAQPage`
  no JSON-LD; `meta keywords` e `article:tag` vêm das palavras-chave do post.
- **Temas** (`/blog-imigracao-brasil/tema/<tema>/`) substituem as 594 tags do WordPress:
  poucos hubs com texto próprio, artigos e serviços. As tags antigas redirecionam para o
  tema correspondente (nginx).
- Cada artigo aponta para o serviço que resolve o assunto — o link que leva a autoridade do
  blog para a página que converte.
- O sitemap traz a data real de atualização de cada artigo e serviço.

## URLs

Todas as URLs indexadas do WordPress continuam iguais, com a barra no fim. As que deixaram
de existir (`/tag/…`, `/category/blog/`, `/manutencao/`, `/teste/`, sitemaps do Yoast,
`/feed/`) têm 301 em `deploy/vhost-cloudpanel.conf`.

## Idiomas

O conteúdo é escrito em português. Espanhol, inglês e francês — as línguas que a operação
atende — vêm por tradução automática no navegador, carregada **só** quando alguém escolhe
outra língua. Quem chega de fora vê um aviso na língua dele, sugerindo a tradução; o site
nunca troca sozinho. Para conferir o aviso: `/?simular-pais=ES` (ou `FR`, `US`, `CO`…).

## Editar pelo painel

O conteúdo (posts, serviços, contato, redes sociais, números e textos dos botões) é
editado no painel do imigrar-agent, em **Site imigrarbrasil.com**. O botão **Publicar**
dispara `.github/workflows/publicar-site.yml`, que:

1. busca o conteúdo em `/api/site/exportar` (`npm run puxar-conteudo`), baixando as
   imagens enviadas pelo painel para `public/uploads/painel/`;
2. gera o site (`npm run build`), já com o endereço do painel para mandar os cliques;
3. envia `dist/` ao CloudPanel por rsync.

Os JSON de `src/data/` no repositório continuam valendo como base: se o painel estiver
vazio (nada importado), o build usa o que está aqui.

### Ligar uma vez

| onde | o quê |
|---|---|
| Supabase | aplicar a migration 035 (`npm run migrar` na raiz) |
| Vercel (painel) | `SITE_EXPORT_TOKEN` (um segredo novo), `GITHUB_TOKEN` (fine-grained, só este repositório: Contents read, Actions read/write), `SITE_CAPTURE_ORIGINS=https://imigrarbrasil.com,https://www.imigrarbrasil.com` |
| GitHub → Settings → Secrets → Actions | `PAINEL_URL`, `SITE_EXPORT_TOKEN` (o mesmo), `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PATH` (e `SSH_PORT` se não for 22) |
| CloudPanel | a chave pública correspondente a `SSH_KEY` em Sites → imigrarbrasil.com → SSH/FTP |
| Painel | Site → Visão geral → **Importar do site** (uma vez) |

A Visão geral do painel lista o que ainda falta, item por item.

## Subir no CloudPanel

1. Crie o site como **PHP Site** (PHP 8.x). O HTML é servido igual; o PHP é só para
   `api/lead.php`.
2. `npm run build` e envie **o conteúdo** de `dist/` para `htdocs/imigrarbrasil.com/`
   (rsync, SFTP ou o gerenciador de arquivos).
3. Cole `deploy/vhost-cloudpanel.conf` no Vhost do site (o próprio arquivo explica onde).
4. Crie `htdocs/imigrar-lead-config.php` — **fora** da pasta pública — com a URL da captura
   do CRM e o mesmo valor de `SITE_CAPTURE_TOKEN` do imigrar-agent (modelo no topo de
   `public/api/lead.php`). Sem ele o formulário ainda abre o WhatsApp, mas o lead não entra
   no funil.
5. Emita o SSL (Let's Encrypt) no CloudPanel e aponte o DNS.
6. No Search Console, troque o sitemap cadastrado por `https://imigrarbrasil.com/sitemap-index.xml`.

```bash
rsync -avz --delete dist/ usuario@servidor:/home/usuario/htdocs/imigrarbrasil.com/
```
