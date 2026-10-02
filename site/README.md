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

## O blog: imigrarbrasil.com/admin

Os artigos são escritos em **https://imigrarbrasil.com/admin/**, que roda no próprio
CloudPanel (PHP, em `public/admin/`). Sem banco, sem GitHub, sem build: salvar um artigo
grava em `.dados/` e gera de novo, na hora, as páginas do blog — o artigo, a lista e a
paginação, os temas, os 3 cards da home, o sitemap e o RSS.

- **O PHP gera as mesmas páginas que o Astro.** Ele parte dos moldes que o build deixa em
  `admin/moldes/` (o layout do site com marcas) e das regras de `admin/base/` (temas e
  serviço relacionado, exportados de `src/lib/blog.ts`). `npm run conferir-admin` gera as
  65 páginas do blog pelos dois caminhos e compara; o `npm run pacote` roda isso sozinho.
  Mudou o HTML de `[slug].astro`, `PostCard`, `CabecaPagina` ou da lista do blog? Mude
  `public/admin/lib/render.php` também, ou o pacote não sai.
- **O que é feito no admin fica em `htdocs/imigrarbrasil.com/.dados/`** (o vhost nega o
  acesso pelo navegador). Subir um zip novo não apaga essa pasta; no primeiro acesso ao
  admin depois do zip, as páginas são geradas de novo com o que foi feito lá.
- **Trocar o endereço de um artigo** deixa no endereço antigo uma página que redireciona
  para o novo. **Apagar** tira a página do site.
- **Imagens** vão para `/uploads/blog/AAAA/MM/`, reduzidas a 1600 px, com a versão WebP ao lado.
- **Acesso:** o primeiro usuário vem no zip, a partir de `site/.acesso-admin.json` (fora
  do Git). Para criar ou trocar: `php -r 'echo password_hash("SENHA", PASSWORD_DEFAULT);'`
  e grave `[{"usuario":"admin","nome":"…","hash":"…"}]` nesse arquivo. Depois, senha e
  outros usuários se mudam pela tela **Conta**.

Os JSON de `src/data/` continuam sendo a base: um artigo corrigido no código aparece no
próximo zip, a não ser que tenha sido editado pelo admin — aí vale a edição.

## Subir no CloudPanel

1. Site **PHP Site** (PHP 8.1 ou mais novo, com GD para as imagens do admin).
2. `npm run pacote` gera `pacote/imigrarbrasil-site-AAAA-MM-DD.zip`. No File Manager:
   `htdocs/imigrarbrasil.com` → Upload → Extract, substituindo. **Não apague a pasta antes**:
   ela guarda `.dados/` (o que foi feito no admin) e o `imigrar-lead-config.php`.
3. Cole `deploy/vhost-cloudpanel.conf` no Vhost do site (o próprio arquivo explica onde).
4. Crie `htdocs/imigrarbrasil.com/imigrar-lead-config.php` com a URL da captura do CRM e o
   mesmo valor de `SITE_CAPTURE_TOKEN` do imigrar-agent (modelo no topo de
   `public/api/lead.php`). O vhost devolve 404 para qualquer `.php` que não seja o
   formulário ou o admin, então ele não é lido pelo navegador. Sem ele o formulário ainda
   abre o WhatsApp, mas o lead não entra no funil.
5. Emita o SSL (Let's Encrypt) no CloudPanel e aponte o DNS.
6. No Search Console, troque o sitemap cadastrado por `https://imigrarbrasil.com/sitemap-index.xml`.

Por rsync, nunca apague o que o servidor gerou:

```bash
rsync -avz dist/ usuario@servidor:/home/usuario/htdocs/imigrarbrasil.com/
```
