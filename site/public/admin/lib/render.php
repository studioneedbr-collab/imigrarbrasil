<?php
// AS PÁGINAS DO BLOG, MONTADAS EM PHP.
//
// Espelho de src/pages/[slug].astro, src/pages/blog-imigracao-brasil/*.astro,
// src/components/{PostCard,CabecaPagina,ServicoItem}.astro e src/lib/blog.ts.
// Mudou o HTML de um deles? Mude aqui também — e rode `npm run conferir-admin`, que gera
// as páginas pelos dois caminhos e compara.
declare(strict_types=1);

// ── texto ───────────────────────────────────────────────────────────────────────
function sem_acento(string $s): string
{
    if (class_exists('Normalizer')) return preg_replace('/\p{Mn}+/u', '', Normalizer::normalize($s, Normalizer::FORM_D));
    return strtr($s, ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','ó'=>'o','ò'=>'o','õ'=>'o','ô'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
        'Á'=>'A','À'=>'A','Ã'=>'A','Â'=>'A','Ä'=>'A','É'=>'E','È'=>'E','Ê'=>'E','Ë'=>'E','Í'=>'I','Ì'=>'I','Î'=>'I','Ï'=>'I','Ó'=>'O','Ò'=>'O','Õ'=>'O','Ô'=>'O','Ö'=>'O','Ú'=>'U','Ù'=>'U','Û'=>'U','Ü'=>'U','Ç'=>'C','Ñ'=>'N']);
}
function norm(string $s): string { return mb_strtolower(sem_acento($s), 'UTF-8'); }

function texto_puro(string $html): string
{
    return trim(preg_replace(['/<[^>]+>/', '/&[a-z]+;/', '/\s+/u'], [' ', ' ', ' '], $html));
}

function slugify(string $t): string
{
    return trim(preg_replace('/[^a-z0-9]+/', '-', norm($t)), '-');
}

/** "21 de julho de 2026, 20h15", no horário de Brasília. */
function data_hora(?string $iso): string
{
    if (!$iso) return '';
    static $meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    $d = (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone(FUSO));
    return $d->format('j') . ' de ' . $meses[(int) $d->format('n') - 1] . ' de ' . $d->format('Y') . ', ' . $d->format('H\hi');
}

// ── regras do blog (src/lib/blog.ts, via admin/base/regras.json) ─────────────────
function regras(): array { return base('regras'); }
function re(string $fonte): string { return '~' . str_replace('~', '\~', $fonte) . '~u'; }

function texto_do_post(array $p): string
{
    return norm($p['title'] . ' ' . implode(' ', $p['keywords']) . ' ' . ($p['description'] ?? ''));
}

/** Temas do post; o que aparece no título vem primeiro. */
function temas_do_post(array $p): array
{
    $titulo = norm($p['title']);
    $texto = texto_do_post($p);
    $casam = array_values(array_filter(regras()['temas'], fn($t) => preg_match(re($t['casa']), $texto)));
    // Ordenação estável, como Array.sort do JS.
    $i = 0;
    $chave = array_map(fn($t) => [(int) !preg_match(re($t['casa']), $titulo), $i++, $t], $casam);
    usort($chave, fn($a, $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);
    return array_column($chave, 2);
}

function posts_do_tema(array $t, array $posts): array
{
    return array_values(array_filter($posts, fn($p) => preg_match(re($t['casa']), texto_do_post($p))));
}

function temas_ativos(array $posts): array
{
    return array_values(array_filter(regras()['temas'], fn($t) => count(posts_do_tema($t, $posts)) >= 3));
}

function url_do_tema(array $t): string { return "/blog-imigracao-brasil/tema/{$t['slug']}/"; }

/** O título pesa 3, as palavras-chave 1. Empate fica com a regra que vem antes. */
function servicos_relacionados(array $p, int $quantos = 2): array
{
    $titulo = norm($p['title']);
    $chaves = norm(implode(' | ', $p['keywords']));
    $porSlug = array_column(base('servicos'), null, 'slug');
    $notas = [];
    foreach (regras()['regras'] as $ordem => [$fonte, $slug]) {
        $n = (preg_match(re($fonte), $titulo) ? 3 : 0) + (preg_match(re($fonte), $chaves) ? 1 : 0);
        if ($n > 0) $notas[] = ['slug' => $slug, 'ordem' => $ordem, 'n' => $n];
    }
    usort($notas, fn($a, $b) => $b['n'] <=> $a['n'] ?: $a['ordem'] <=> $b['ordem']);
    $out = [];
    foreach ($notas as $x) {
        $s = $porSlug[$x['slug']] ?? null;
        if ($s && !isset($out[$s['slug']])) $out[$s['slug']] = $s;
    }
    return array_slice(array_values($out), 0, $quantos);
}

/** Cada <h2> que termina em "?" vira pergunta do FAQPage; os parágrafos até o próximo, a resposta. */
function perguntas_do_post(string $html): array
{
    preg_match_all('/<h2[^>]*>(.*?)<\/h2>(.*?)(?=<h2|\z)/s', $html, $ms, PREG_SET_ORDER);
    $out = [];
    foreach ($ms as $m) {
        $pergunta = texto_puro($m[1]);
        if (!str_ends_with($pergunta, '?')) continue;
        $resposta = texto_puro($m[2]);
        if (mb_strlen($resposta) < 40) continue;
        if (mb_strlen($resposta) > 600) {
            $corte = mb_strrpos(mb_substr($resposta, 0, 591), ' ');
            $resposta = mb_substr($resposta, 0, $corte === false ? 0 : $corte) . '…';
        }
        $out[] = ['pergunta' => $pergunta, 'resposta' => $resposta];
    }
    return $out;
}

function resumo_servico(?string $d): string
{
    $r = preg_replace('/^[^:]{0,140}:\s*/u', '', (string) $d);
    return mb_strtoupper(mb_substr($r, 0, 1)) . mb_substr($r, 1);
}

function titulo_curto(string $t): string { return trim(preg_replace('/\s*\([^)]*\)\s*$/', '', $t)); }

function autor_do_post(array $p): array
{
    $eq = base('equipe');
    foreach ($eq as $a) if ($a['nome'] === $p['author']) return $a;
    foreach ($eq as $a) if ($a['slug'] === 'walter-gama') return $a;
    return $eq[0];
}

// ── componentes ─────────────────────────────────────────────────────────────────
/** src/components/Img.astro */
function img(?string $src, array $a): string
{
    if (!$src) return '';
    $h = '<img src="' . ea($src) . '" alt="' . ea($a['alt'] ?? '') . '"';
    foreach (['width', 'height', 'class', 'style'] as $k) if (isset($a[$k])) $h .= " $k=\"" . ea((string) $a[$k]) . '"';
    $h .= ' loading="' . ($a['loading'] ?? 'lazy') . '" decoding="async"';
    if (isset($a['fetchpriority'])) $h .= ' fetchpriority="' . $a['fetchpriority'] . '"';
    return $h . '>';
}

/** src/components/PostCard.astro */
function card(array $p, string $carregar = 'lazy', bool $resumo = false): string
{
    return '<article class="card" data-revelar> <div class="card-img">' . img($p['image'], ['alt' => $p['imageAlt'] ?: $p['title'], 'width' => 960, 'height' => 540, 'loading' => $carregar]) . '</div> '
        . '<div class="card-corpo"> <div class="card-meta"><span class="notranslate" translate="no">' . e($p['author'] ?? 'Walter Gama') . '</span><span aria-hidden="true">·</span><time datetime="' . ea($p['published']) . '">' . e(data_hora($p['published'])) . '</time></div> '
        . '<h3><a class="card-link" href="/' . ea($p['slug']) . '/">' . e($p['title']) . '</a></h3> '
        . ($resumo && !empty($p['description']) ? '<p>' . e($p['description']) . '</p>' : '')
        . ' <span class="card-meta" style="margin-top:auto;justify-content:space-between;align-items:center;padding-top:6px"><span class="link-seta" style="color:var(--mar)" aria-hidden="true">Ler artigo</span><span>' . e((string) $p['readingMinutes']) . ' min</span></span> </div> </article>';
}

/** src/components/ServicoItem.astro */
function servico_item(array $s): string
{
    return '<a class="servico-item" href="/servico/' . ea($s['slug']) . '/"> <span class="ico">' . regras()['icones']['documento'] . '</span> <span style="display:block"><strong>' . e(titulo_curto($s['title'])) . '</strong><span>' . e(resumo_servico($s['description'])) . '</span></span> </a>';
}

/** src/components/CabecaPagina.astro. $migalhas: [[href|null, rótulo], …] sem a Home. */
function cabeca_pagina(string $titulo, ?string $sobretitulo, ?string $texto, array $migalhas, string $dentro = ''): string
{
    $lista = array_merge([['/', 'Home']], $migalhas);
    $schema = ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => []];
    $lis = '';
    foreach ($lista as $i => [$href, $rotulo]) {
        $item = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $rotulo];
        if ($href) $item['item'] = URL_SITE . $href;
        $schema['itemListElement'][] = $item;
        $lis .= '<li>' . ($href ? '<a href="' . ea($href) . '">' . e($rotulo) . '</a>' : '<span aria-current="page">' . e($rotulo) . '</span>') . '</li>';
    }
    return '<section class="cabeca-pagina"> <div class="container"> <nav aria-label="Você está em"> <ol class="migalhas"> ' . $lis . ' </ol> </nav> '
        . ($sobretitulo ? '<span class="sobretitulo">' . e($sobretitulo) . '</span>' : '')
        . ' <h1>' . e($titulo) . '</h1> ' . ($texto ? '<p>' . e($texto) . '</p>' : '') . ' ' . $dentro . ' </div> <script type="application/ld+json">' . js($schema) . '</script> </section>';
}

// ── moldes ──────────────────────────────────────────────────────────────────────
function molde(string $nome): array
{
    static $cache = [];
    if (isset($cache[$nome])) return $cache[$nome];
    $html = file_get_contents(MOLDES . "/$nome/index.html");
    if ($html === false) throw new RuntimeException("Falta o molde $nome. Suba o zip do site de novo.");
    $pecas = [];
    $html = preg_replace_callback('/<template data-peca="([a-z-]+)">(.*?)<\/template>\s*/s', function ($m) use (&$pecas) { $pecas[$m[1]] = $m[2]; return ''; }, $html);
    return $cache[$nome] = ['html' => $html, 'pecas' => $pecas];
}

/**
 * Preenche um molde. $c: titulo, descricao, imagem, canonical (caminho), schema (lista),
 * head (HTML extra no fim do <head>), corpo, e para artigo: publicado, modificado, keywords.
 */
function preencher(string $nome, array $c): string
{
    $h = molde($nome)['html'];
    $caminhoMolde = "/admin/moldes/$nome/";
    $troca = [
        '<title>@@TITULO@@ | Imigrar Brasil</title>' => '<title>' . e($c['titulo']) . ' | Imigrar Brasil</title>',
        'content="@@TITULO@@"' => 'content="' . ea($c['titulo']) . '"',
        'content="@@DESCRICAO@@"' => 'content="' . ea($c['descricao'] ?: regras()['site']['descricao']) . '"',
        'href="' . URL_SITE . $caminhoMolde . '"' => 'href="' . ea(URL_SITE . $c['canonical']) . '"',
        'content="' . URL_SITE . $caminhoMolde . '"' => 'content="' . ea(URL_SITE . $c['canonical']) . '"',
        'content="' . URL_SITE . '/@@IMAGEM@@"' => 'content="' . ea(url_absoluta($c['imagem'] ?? null)) . '"',
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"@@SCHEMA@@"}</script>' =>
            implode('', array_map(fn($s) => '<script type="application/ld+json">' . js(['@context' => 'https://schema.org'] + $s) . '</script>', $c['schema'] ?? [])),
        '<meta name="@@HEAD@@">' => $c['head'] ?? '',
        '<i hidden data-molde="corpo"></i>' => $c['corpo'],
    ];
    if (array_key_exists('publicado', $c)) {
        $troca['<meta property="article:published_time" content="@@PUBLICADO@@">'] = $c['publicado'] ? '<meta property="article:published_time" content="' . ea($c['publicado']) . '">' : '';
        $troca['<meta property="article:modified_time" content="@@MODIFICADO@@">'] = $c['modificado'] ? '<meta property="article:modified_time" content="' . ea($c['modificado']) . '">' : '';
        $troca['<meta name="keywords" content="@@KEYWORDS@@">'] = $c['keywords'] ? '<meta name="keywords" content="' . ea(implode(', ', $c['keywords'])) . '">' : '';
    }
    foreach ($troca as $de => $para) {
        if (!str_contains($h, $de)) throw new RuntimeException("O molde $nome mudou e não tem mais: $de");
        $h = str_replace($de, $para, $h);
    }
    // O menu marca a seção atual pelo caminho; o molde mora em /admin/, então não marcou.
    if (str_starts_with($c['canonical'], '/blog-imigracao-brasil/')) {
        $h = preg_replace('~<li><a href="/blog-imigracao-brasil/">Blog</a></li>~', '<li><a href="/blog-imigracao-brasil/" aria-current="page">Blog</a></li>', $h, 1);
    }
    if (str_contains($h, '@@')) throw new RuntimeException("Sobrou marca no molde $nome.");
    return $h;
}

function url_absoluta(?string $img): string
{
    if (!$img) return URL_SITE . '/og-imigrar-brasil.png';
    if (preg_match('~^https?://~', $img)) return $img;
    return URL_SITE . '/' . ltrim($img, '/');
}

// ── o artigo ────────────────────────────────────────────────────────────────────
function pagina_artigo(array $p, array $posts): string
{
    $R = regras();
    $ic = $R['icones'];

    // Âncoras nos h2 para o índice lateral.
    $indice = [];
    $usados = [];
    $html = preg_replace_callback('/<h2>(.*?)<\/h2>/s', function ($m) use (&$indice, &$usados) {
        $texto = texto_puro($m[1]);
        $id = substr(slugify($texto), 0, 60) ?: 'secao';
        while (isset($usados[$id])) $id .= '-2';
        $usados[$id] = true;
        $indice[] = ['id' => $id, 'texto' => $texto];
        return '<h2 id="' . $id . '">' . $m[1] . '</h2>';
    }, $p['html']);

    // Relacionados: mais palavras-chave em comum; empate, o mais recente.
    $minhas = array_flip(array_map(fn($k) => mb_strtolower($k), $p['keywords']));
    $outros = [];
    foreach ($posts as $i => $x) {
        if ($x['slug'] === $p['slug']) continue;
        $n = count(array_filter($x['keywords'], fn($k) => isset($minhas[mb_strtolower($k)]) && mb_strtolower($k) !== 'imigrar brasil'));
        $outros[] = ['x' => $x, 'n' => $n, 'i' => $i];
    }
    usort($outros, fn($a, $b) => $b['n'] <=> $a['n'] ?: strcmp((string) $b['x']['published'], (string) $a['x']['published']) ?: $a['i'] <=> $b['i']);
    $relacionados = array_column(array_slice($outros, 0, 3), 'x');

    $i = array_search($p['slug'], array_column($posts, 'slug'), true);
    $anterior = $i === false ? null : ($posts[$i + 1] ?? null);
    $proximo = $i === false || $i === 0 ? null : ($posts[$i - 1] ?? null);
    $autor = autor_do_post($p);
    $url = URL_SITE . "/{$p['slug']}/";
    $temasTodos = temas_do_post($p);
    $ativos = array_column(temas_ativos($posts), 'slug');
    $temas = array_values(array_filter($temasTodos, fn($t) => in_array($t['slug'], $ativos, true)));
    [$servico, $servico2] = array_pad(servicos_relacionados($p, 2), 2, null);
    $perguntas = perguntas_do_post($p['html']);
    $secao = $temasTodos[0]['nome'] ?? 'Imigração';

    $artigo = ['@type' => 'BlogPosting', '@id' => "$url#artigo", 'headline' => $p['title'], 'description' => $p['description']];
    if ($p['image']) $artigo['image'] = ['@type' => 'ImageObject', 'url' => URL_SITE . $p['image'], 'width' => 960, 'height' => 540];
    $artigo += [
        'articleSection' => $secao,
        'about' => array_map(fn($t) => ['@type' => 'Thing', 'name' => $t['nome']], $temasTodos),
        'isPartOf' => ['@type' => 'Blog', 'name' => 'Blog Imigrar Brasil', 'url' => URL_SITE . '/blog-imigracao-brasil/'],
        'datePublished' => $p['published'],
        'dateModified' => $p['modified'] ?? $p['published'],
        'inLanguage' => 'pt-BR',
        'keywords' => implode(', ', $p['keywords']),
        'wordCount' => count(explode(' ', texto_puro($p['html']))),
        'mainEntityOfPage' => $url,
        'author' => array_filter(['@type' => 'Person', 'name' => $autor['nome'], 'url' => URL_SITE . "/equipe/{$autor['slug']}/", 'jobTitle' => $autor['cargo']], fn($v) => $v !== null),
        'publisher' => ['@id' => URL_SITE . '/#organizacao'],
    ];
    $schema = [
        $artigo,
        ['@type' => 'BreadcrumbList', 'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => URL_SITE . '/'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Blog', 'item' => URL_SITE . '/blog-imigracao-brasil/'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => $p['title']],
        ]],
    ];
    if (count($perguntas) >= 2) $schema[] = ['@type' => 'FAQPage', 'mainEntity' => array_map(fn($q) => ['@type' => 'Question', 'name' => $q['pergunta'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q['resposta']]], $perguntas)];

    $palavras = [];
    foreach ($p['keywords'] as $k) {
        $k = trim($k);
        if ($k !== '' && !preg_match('/^(imigrar brasil|brasil|20\d\d)$/i', $k) && !in_array($k, $palavras, true)) $palavras[] = $k;
    }
    $head = '<meta property="article:author" content="' . ea($autor['nome']) . '"><meta property="article:section" content="' . ea($secao) . '">'
        . implode('', array_map(fn($k) => '<meta property="article:tag" content="' . ea($k) . '">', array_slice($palavras, 0, 10)));

    $compartilhar = enc_uri("{$p['title']} $url");
    $pecas = molde('artigo')['pecas'];
    $c = '<div class="progresso" aria-hidden="true"></div> <article data-artigo> <header class="cabeca-pagina" style="padding-bottom:clamp(120px,14vw,180px)"> <div class="container estreito" style="max-width:860px"> <nav aria-label="Você está em"> <ol class="migalhas"><li><a href="/">Home</a></li><li><a href="/blog-imigracao-brasil/">Blog</a></li>'
        . ($temas ? '<li><a href="' . ea(url_do_tema($temas[0])) . '">' . e($temas[0]['nome']) . '</a></li>' : '') . '</ol> </nav> '
        . '<h1 style="max-width:none;font-size:clamp(1.9rem,4vw,3rem)">' . e($p['title']) . '</h1> <p style="margin-bottom:22px">' . e($p['description']) . '</p> '
        . '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;font-size:.95rem"> <img src="' . ea($autor['foto']) . '" alt="" width="44" height="44" style="width:44px;height:44px;border-radius:50%;object-fit:cover"> '
        . '<span>Por <a href="/equipe/' . ea($autor['slug']) . '/" style="color:#fff;font-weight:600">' . e($autor['nome']) . '</a></span> <span aria-hidden="true">·</span> '
        . '<time datetime="' . ea($p['published']) . '">' . e(data_hora($p['published'])) . '</time> <span aria-hidden="true">·</span> <span>' . e((string) $p['readingMinutes']) . ' min de leitura</span> </div> </div> </header> '
        . '<div class="container" style="max-width:1100px;margin-top:clamp(-150px,-12vw,-100px);position:relative"> '
        . img($p['image'], ['alt' => $p['imageAlt'] ?: $p['title'], 'width' => 960, 'height' => 540, 'style' => 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--raio-g);box-shadow:var(--sombra-g)', 'loading' => 'eager', 'fetchpriority' => 'high'])
        . ' </div> <div class="secao" style="padding-top:56px"> <div class="container com-lateral" style="max-width:1160px"> <div style="min-width:0"> <div class="prosa">' . $html . '</div> ';
    if ($p['modified'] && substr($p['modified'], 0, 10) !== substr((string) $p['published'], 0, 10)) {
        $c .= '<p style="color:var(--slate);font-size:.9rem;margin-top:32px">Atualizado em <time datetime="' . ea($p['modified']) . '">' . e(data_hora($p['modified'])) . '</time>.</p>';
    }
    $c .= ' ';
    if ($servico) {
        $c .= '<aside class="servico-destaque" aria-label="Serviço relacionado"> <span class="sobretitulo" style="margin-bottom:6px">Como a Imigrar Brasil ajuda</span> <h2><a href="/servico/' . ea($servico['slug']) . '/">' . e($servico['title']) . '</a></h2> <p>' . e(resumo_servico($servico['description'])) . '</p> '
            . '<div style="display:flex;flex-wrap:wrap;gap:10px"> <a class="btn btn-primario" href="/servico/' . ea($servico['slug']) . '/">Conhecer o serviço ' . $ic['seta'] . '</a> '
            . '<a class="btn btn-zap" href="' . ea($R['site']['whatsappLink']) . '" target="_blank" rel="noopener" data-abrir-lead>' . $ic['whatsapp'] . ' Falar com especialista</a> </div> '
            . ($servico2 ? '<p style="margin:14px 0 0;font-size:.92rem">Veja também: <a href="/servico/' . ea($servico2['slug']) . '/">' . e($servico2['title']) . '</a></p>' : '') . ' </aside>';
    }
    $c .= ' ';
    if ($temas) {
        $c .= '<nav aria-label="Temas deste artigo" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:32px"> <strong style="font-family:var(--f-titulo);color:var(--casa);margin-right:4px">Temas:</strong> '
            . implode('', array_map(fn($t) => '<a class="chip chip-link" href="' . ea(url_do_tema($t)) . '">' . e($t['nome']) . '</a>', $temas)) . ' </nav>';
    }
    $bc = 'class="btn btn-contorno" style="min-height:40px;padding:8px 16px;font-size:.9rem"';
    $c .= ' <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:32px 0 40px;padding:20px 0;border-block:1px solid var(--line)"> <strong style="font-family:var(--f-titulo);color:var(--casa);margin-right:6px">Compartilhe:</strong> '
        . "<a $bc href=\"https://wa.me/?text=" . ea($compartilhar) . '" target="_blank" rel="noopener">WhatsApp</a> '
        . "<a $bc href=\"https://www.linkedin.com/sharing/share-offsite/?url=" . ea(enc_uri($url)) . '" target="_blank" rel="noopener">LinkedIn</a> '
        . "<a $bc href=\"https://www.facebook.com/sharer/sharer.php?u=" . ea(enc_uri($url)) . '" target="_blank" rel="noopener">Facebook</a> </div> '
        . '<aside class="caixa" style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap" aria-label="Sobre o autor"> <img src="' . ea($autor['foto']) . '" alt="" width="88" height="88" loading="lazy" style="width:88px;height:88px;border-radius:50%;object-fit:cover"> '
        . '<div style="flex:1;min-width:220px"> <span class="sobretitulo" style="margin-bottom:4px">Quem escreveu</span> <h2 style="font-size:1.25rem;margin-bottom:4px"><a href="/equipe/' . ea($autor['slug']) . '/" style="text-decoration:none">' . e($autor['nome']) . '</a></h2> '
        . '<p style="color:var(--slate);font-size:.95rem;margin:0">' . e($autor['description']) . '</p> </div> </aside> '
        . '<nav aria-label="Outros artigos" class="grade grade-2" style="margin-top:32px;gap:14px"> '
        . ($anterior ? '<a class="servico-item" href="/' . ea($anterior['slug']) . '/" rel="prev"><span style="display:block"><span>← Anterior</span><strong>' . e($anterior['title']) . '</strong></span></a>' : '<span></span>') . ' '
        . ($proximo ? '<a class="servico-item" href="/' . ea($proximo['slug']) . '/" rel="next" style="text-align:right;justify-content:flex-end"><span style="display:block"><span>Próximo →</span><strong>' . e($proximo['title']) . '</strong></span></a>' : '')
        . ' </nav> </div> <aside class="lateral"> ';
    if (count($indice) > 2) {
        $c .= '<nav class="caixa indice" aria-label="Neste artigo"> <h2 style="font-size:1rem;margin-bottom:10px">Neste artigo</h2> <ol>'
            . implode('', array_map(fn($h) => '<li><a href="#' . ea($h['id']) . '">' . e($h['texto']) . '</a></li>', $indice)) . '</ol> </nav>';
    }
    $c .= ' <div class="caixa caixa-cta"> <h2>Precisa de ajuda com o seu caso?</h2> <p style="font-size:.95rem">Fale com a equipe do ' . e(explode(' ', $autor['nome'])[0]) . ' pelo WhatsApp.</p> '
        . $pecas['lead'] . ' </div> </aside> </div> </div> </article> '
        . '<section class="secao secao-papel"> <div class="container"> <div class="cabeca-secao"><span class="sobretitulo">Continue lendo</span><h2>Artigos relacionados</h2></div> <div class="grade grade-3">'
        . implode('', array_map(fn($r) => card($r), $relacionados)) . '</div> </div> </section> '
        . '<section class="secao"><div class="container">' . $pecas['chamada'] . '</div></section>';

    return preencher('artigo', [
        'titulo' => $p['seoTitle'] ?: $p['title'], 'descricao' => $p['description'] ?: null, 'imagem' => $p['image'], 'canonical' => "/{$p['slug']}/",
        'schema' => $schema, 'head' => $head, 'corpo' => $c,
        'publicado' => $p['published'], 'modificado' => $p['modified'], 'keywords' => $palavras,
    ]);
}

// ── a lista do blog ─────────────────────────────────────────────────────────────
const POR_PAGINA = 12;
const DESC_BLOG = 'Blog da Imigrar Brasil: conteúdos claros e atualizados sobre vistos, residência, naturalização e direitos de estrangeiros. Entenda as regras oficiais, evite erros e planeje sua imigração ao Brasil com segurança jurídica.';

function link_pagina(int $n): string { return $n === 1 ? '/blog-imigracao-brasil/' : "/blog-imigracao-brasil/page/$n/"; }

function pagina_blog(int $n, array $posts): string
{
    $total = (int) ceil(count($posts) / POR_PAGINA);
    $lista = array_slice($posts, ($n - 1) * POR_PAGINA, POR_PAGINA);
    $destaque = $n === 1 ? array_shift($lista) : null;
    $ativos = temas_ativos($posts);
    $ic = regras()['icones'];
    $indice = array_map(fn($p) => ['s' => $p['slug'], 't' => $p['title'], 'd' => $p['description'] ?? '', 'k' => implode(' ', $p['keywords'])], $posts);
    $schema = ['@type' => 'Blog', 'name' => 'Blog Imigrar Brasil', 'url' => 'https://imigrarbrasil.com/blog-imigracao-brasil/', 'inLanguage' => 'pt-BR',
        'blogPost' => array_map(fn($p) => ['@type' => 'BlogPosting', 'headline' => $p['title'], 'url' => "https://imigrarbrasil.com/{$p['slug']}/", 'datePublished' => $p['published']], array_slice($posts, ($n - 1) * POR_PAGINA, POR_PAGINA))];

    $busca = '<div style="margin-top:28px;max-width:560px;position:relative"> <label class="sr-only" for="busca-blog">Buscar no blog</label> <input id="busca-blog" type="search" placeholder="Buscar: naturalização, CRNM, Mercosul…" autocomplete="off" style="width:100%;min-height:56px;padding:14px 18px 14px 50px;border-radius:999px;border:0;font:1.02rem var(--f-texto);box-shadow:var(--sombra-g)"> <span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--slate)">' . $ic['busca'] . '</span> </div>';
    $c = cabeca_pagina('Blog de imigração no Brasil', count($posts) . ' artigos', 'Leis, prazos e documentos explicados sem juridiquês, com base nas fontes oficiais — para quem quer viver, estudar, trabalhar ou investir no Brasil.',
        $n === 1 ? [[null, 'Blog']] : [['/blog-imigracao-brasil/', 'Blog'], [null, "Página $n"]], $busca);
    $c .= ' <section class="secao" style="padding-top:56px"> <div class="container"> <div id="resultados" hidden> <p id="resultados-n" style="color:var(--slate);margin-bottom:20px"></p> <ul id="resultados-lista" class="grade grade-2" style="list-style:none;padding:0;gap:14px"></ul> </div> '
        . '<nav aria-label="Temas do blog" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px"> <a class="chip chip-link" href="/blog-imigracao-brasil/"' . ($n === 1 ? ' aria-current="page"' : '') . '>Todos · ' . count($posts) . '</a> '
        . implode('', array_map(fn($t) => '<a class="chip chip-link" href="' . ea(url_do_tema($t)) . '">' . e($t['nome']) . ' · ' . count(posts_do_tema($t, $posts)) . '</a>', $ativos)) . ' </nav> <div id="listagem"> ';
    if ($destaque) {
        $c .= '<article class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));margin-bottom:32px"> <div class="card-img" style="aspect-ratio:auto;min-height:280px">'
            . img($destaque['image'], ['alt' => $destaque['imageAlt'] ?: $destaque['title'], 'width' => 960, 'height' => 540, 'loading' => 'eager', 'fetchpriority' => 'high']) . '</div> '
            . '<div class="card-corpo" style="padding:clamp(24px,4vw,44px);justify-content:center;gap:14px"> <span class="chip" style="align-self:flex-start">Mais recente · ' . e(data_hora($destaque['published'])) . '</span> '
            . '<h2 style="font-size:clamp(1.4rem,2.6vw,2rem);margin:0"><a class="card-link" href="/' . ea($destaque['slug']) . '/">' . e($destaque['title']) . '</a></h2> <p style="font-size:1.05rem">' . e($destaque['description']) . '</p> <span class="link-seta" aria-hidden="true">Ler artigo</span> </div> </article>';
    }
    $c .= ' <div class="grade grade-3"> ' . implode('', array_map(fn($p, $i) => card($p, $i < 3 ? 'eager' : 'lazy'), $lista, array_keys($lista))) . ' </div> ';
    if ($total > 1) {
        $c .= '<nav aria-label="Páginas do blog" style="display:flex;justify-content:center;gap:8px;margin-top:56px;flex-wrap:wrap"> '
            . ($n > 1 ? '<a class="btn btn-contorno" href="' . link_pagina($n - 1) . '" rel="prev">← Anteriores</a>' : '') . ' ';
        for ($k = 1; $k <= $total; $k++) {
            $c .= '<a class="btn ' . ($k === $n ? 'btn-primario' : 'btn-contorno') . '" style="min-width:48px;padding:12px 16px" href="' . link_pagina($k) . '"' . ($k === $n ? ' aria-current="page"' : '') . '>' . $k . '</a>';
        }
        $c .= ' ' . ($n < $total ? '<a class="btn btn-contorno" href="' . link_pagina($n + 1) . '" rel="next">Próximos →</a>' : '') . ' </nav>';
    }
    $c .= ' </div> <div style="margin-top:80px">' . molde('blog')['pecas']['chamada'] . '</div> </div> </section> <script type="application/json" id="indice-blog">' . js($indice) . '</script>';

    $head = ($n > 1 ? '<link rel="prev" href="' . link_pagina($n - 1) . '">' : '') . ($n < $total ? '<link rel="next" href="' . link_pagina($n + 1) . '">' : '');
    return preencher('blog', [
        'titulo' => $n === 1 ? 'Blog de Imigração no Brasil' : "Blog de Imigração no Brasil — página $n",
        'descricao' => DESC_BLOG, 'imagem' => null, 'canonical' => link_pagina($n), 'schema' => [$schema], 'head' => $head, 'corpo' => $c,
    ]);
}

// ── página de tema ──────────────────────────────────────────────────────────────
function pagina_tema(array $t, array $posts): string
{
    $lista = posts_do_tema($t, $posts);
    $ativos = temas_ativos($posts);
    $contagem = [];
    foreach ($lista as $p) foreach (servicos_relacionados($p, 2) as $s) {
        $contagem[$s['slug']] ??= ['s' => $s, 'n' => 0, 'ordem' => count($contagem)];
        $contagem[$s['slug']]['n']++;
    }
    $contagem = array_values($contagem);
    usort($contagem, fn($a, $b) => $b['n'] <=> $a['n'] ?: $a['ordem'] <=> $b['ordem']);
    $servicos = array_column(array_slice($contagem, 0, 4), 's');
    $outros = array_values(array_filter($ativos, fn($x) => $x['slug'] !== $t['slug']));
    $schema = ['@type' => 'CollectionPage', 'name' => "{$t['nome']} — Blog Imigrar Brasil", 'description' => $t['intro'], 'url' => URL_SITE . url_do_tema($t), 'inLanguage' => 'pt-BR',
        'isPartOf' => ['@type' => 'Blog', 'name' => 'Blog Imigrar Brasil', 'url' => URL_SITE . '/blog-imigracao-brasil/'],
        'mainEntity' => ['@type' => 'ItemList', 'itemListElement' => array_map(fn($p, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'url' => URL_SITE . "/{$p['slug']}/", 'name' => $p['title']], $lista, array_keys($lista))]];

    $c = cabeca_pagina($t['nome'], count($lista) . ' artigos', $t['intro'], [['/blog-imigracao-brasil/', 'Blog'], [null, $t['nome']]]);
    $c .= ' <section class="secao" style="padding-top:48px"> <div class="container"> <nav aria-label="Temas do blog" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:40px"> <a class="chip chip-link" href="/blog-imigracao-brasil/">Todos</a> '
        . implode('', array_map(fn($x) => '<a class="chip chip-link" href="' . ea(url_do_tema($x)) . '"' . ($x['slug'] === $t['slug'] ? ' aria-current="page"' : '') . '>' . e($x['nome']) . '</a>', $ativos))
        . ' </nav> <div class="grade grade-3"> ' . implode('', array_map(fn($p, $i) => card($p, $i < 3 ? 'eager' : 'lazy'), $lista, array_keys($lista))) . ' </div> </div> </section> ';
    if ($servicos) {
        $c .= '<section class="secao secao-papel"> <div class="container"> <div class="cabeca-secao" data-revelar> <span class="sobretitulo">Serviços</span> <h2>Precisa resolver isso na prática?</h2> <p>Os serviços da Imigrar Brasil ligados a ' . e(mb_strtolower($t['nome'])) . '.</p> </div> <div class="grade grade-2" style="gap:14px">'
            . implode('', array_map('servico_item', $servicos)) . '</div> </div> </section>';
    }
    $c .= ' <section class="secao"> <div class="container"> <h2 style="font-size:1.4rem">Outros temas</h2> <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:64px"> '
        . implode('', array_map(fn($x) => '<a class="chip chip-link" href="' . ea(url_do_tema($x)) . '">' . e($x['nome']) . ' · ' . count(posts_do_tema($x, $posts)) . '</a>', $outros))
        . ' </div> ' . molde('blog')['pecas']['chamada'] . ' </div> </section>';

    return preencher('blog', [
        'titulo' => "{$t['nome']}: guia e artigos",
        'descricao' => mb_substr("{$t['intro']} " . count($lista) . ' artigos escritos por advogados especialistas em direito migratório.', 0, 300),
        'imagem' => $lista[0]['image'] ?? null, 'canonical' => url_do_tema($t), 'schema' => [$schema], 'head' => '', 'corpo' => $c,
    ]);
}
