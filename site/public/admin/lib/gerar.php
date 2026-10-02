<?php
// GERA O BLOG NO SERVIDOR: as páginas dos artigos, a lista (/blog-imigracao-brasil/ e
// /page/N/), os temas, os 3 cards da home, o sitemap e o RSS.
//
// Gera TUDO a cada publicação, não só o artigo mexido: um artigo novo muda o "Anterior /
// Próximo" do vizinho, a contagem dos temas, a paginação. São ~120 arquivos pequenos;
// leva menos de um segundo.
declare(strict_types=1);

function gerar_tudo(): array
{
    $posts = todos_posts();
    $feitos = 0;

    // Artigos.
    foreach ($posts as $p) { gravar(RAIZ . "/{$p['slug']}/index.html", pagina_artigo($p, $posts)); $feitos++; }

    // Artigos que saíram (apagados, rascunho, slug trocado): a página some, ou vira
    // redirecionamento para o endereço novo.
    $vivos = array_flip(array_column($posts, 'slug'));
    $red = redirecionamentos();
    $todosQueJaForam = array_unique(array_merge(array_column(base('posts'), 'slug'), array_keys(editados()), array_keys($red), excluidos()));
    foreach ($todosQueJaForam as $slug) {
        if (isset($vivos[$slug]) || slug_reservado($slug) || !preg_match('/^[a-z0-9-]+$/', $slug)) continue;
        $destino = $red[$slug] ?? null;
        while ($destino !== null && !isset($vivos[$destino]) && isset($red[$destino])) $destino = $red[$destino];
        if ($destino !== null && isset($vivos[$destino])) gravar(RAIZ . "/$slug/index.html", pagina_redirecionamento("/$destino/"));
        else apagar_pasta(RAIZ . "/$slug");
    }

    // Lista do blog.
    $total = max(1, (int) ceil(count($posts) / POR_PAGINA));
    for ($n = 1; $n <= $total; $n++) { gravar(RAIZ . link_pagina($n) . 'index.html', pagina_blog($n, $posts)); $feitos++; }
    foreach (glob(RAIZ . '/blog-imigracao-brasil/page/*', GLOB_ONLYDIR) ?: [] as $d) {
        if ((int) basename($d) > $total) apagar_pasta($d);
    }

    // Temas: só os que têm 3 artigos ou mais viram página.
    $ativos = temas_ativos($posts);
    foreach ($ativos as $t) { gravar(RAIZ . url_do_tema($t) . 'index.html', pagina_tema($t, $posts)); $feitos++; }
    $slugsAtivos = array_column($ativos, 'slug');
    foreach (regras()['temas'] as $t) if (!in_array($t['slug'], $slugsAtivos, true)) apagar_pasta(RAIZ . url_do_tema($t));

    atualizar_home($posts);
    gravar_sitemap($posts, $ativos);
    gravar_rss($posts);

    gravar_json(DADOS . '/geracao.json', ['build' => regras()['build'], 'em' => gmdate('c'), 'paginas' => $feitos]);
    return ['paginas' => $feitos, 'artigos' => count($posts)];
}

/** O zip novo traz as páginas do build, sem o que foi feito aqui. Detecta e gera de novo. */
function gerar_se_o_zip_mudou(): bool
{
    $g = ler_json(DADOS . '/geracao.json', []);
    if (($g['build'] ?? null) === regras()['build']) return false;
    if (!editados() && !excluidos()) {
        // Nada feito no admin ainda: o build já está certo.
        gravar_json(DADOS . '/geracao.json', ['build' => regras()['build'], 'em' => gmdate('c'), 'paginas' => 0]);
        return false;
    }
    com_trava('gerar_tudo');
    return true;
}

function pagina_redirecionamento(string $para): string
{
    $url = URL_SITE . $para;
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Mudou de endereço</title><link rel="canonical" href="' . ea($url) . '"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0; url=' . ea($para) . '"></head><body><p>Este artigo mudou de endereço: <a href="' . ea($para) . '">' . e($url) . '</a></p></body></html>';
}

function atualizar_home(array $posts): void
{
    $arq = RAIZ . '/index.html';
    $h = file_get_contents($arq);
    $ini = '<i hidden data-molde="recentes-ini"></i>';
    $fim = '<i hidden data-molde="recentes-fim"></i>';
    $a = strpos($h, $ini);
    $b = strpos($h, $fim);
    if ($a === false || $b === false) return; // home de um zip antigo: fica como está
    $cards = implode('', array_map(fn($p) => card($p), array_slice($posts, 0, 3)));
    gravar($arq, substr($h, 0, $a + strlen($ini)) . $cards . substr($h, $b));
}

/** Refaz as linhas do blog no sitemap e mantém as outras como o build gerou. */
function gravar_sitemap(array $posts, array $ativos): void
{
    $arq = RAIZ . '/sitemap-0.xml';
    $xml = file_get_contents($arq);
    if ($xml === false) return;
    preg_match_all('~<url>.*?</url>~s', $xml, $m);
    $doBlog = array_flip(array_merge(array_column(base('posts'), 'slug'), array_keys(editados()), array_keys(redirecionamentos())));
    $linhas = [];
    foreach ($m[0] as $u) {
        preg_match('~<loc>(.*?)</loc>~', $u, $l);
        $caminho = substr($l[1], strlen(URL_SITE));
        if (str_starts_with($caminho, '/blog-imigracao-brasil/') || $caminho === '/') continue;
        if (preg_match('~^/([a-z0-9-]+)/$~', $caminho, $s) && isset($doBlog[$s[1]])) continue;
        $linhas[$caminho] = $u;
    }
    $datas = array_map(fn($p) => $p['modified'] ?? $p['published'], $posts);
    foreach (base('servicos') as $s) if (!empty($s['modified'])) $datas[] = $s['modified'];
    $maisRecente = max(array_map(fn($d) => strtotime($d), $datas));
    $url = fn($caminho, $data, $freq, $prio) => '<url><loc>' . URL_SITE . $caminho . '</loc><lastmod>' . gmdate('Y-m-d\TH:i:s.000\Z', $data) . "</lastmod><changefreq>$freq</changefreq><priority>$prio</priority></url>";
    $linhas['/'] = $url('/', $maisRecente, 'weekly', '1.0');
    foreach ($posts as $p) $linhas["/{$p['slug']}/"] = $url("/{$p['slug']}/", strtotime($p['modified'] ?? $p['published']), 'monthly', '0.8');
    $total = max(1, (int) ceil(count($posts) / POR_PAGINA));
    for ($n = 1; $n <= $total; $n++) $linhas[link_pagina($n)] = $url(link_pagina($n), $maisRecente, 'weekly', '0.6');
    foreach ($ativos as $t) $linhas[url_do_tema($t)] = $url(url_do_tema($t), $maisRecente, 'weekly', '0.6');
    ksort($linhas, SORT_STRING);
    $cabeca = substr($xml, 0, strpos($xml, '<url>'));
    gravar($arq, $cabeca . implode('', $linhas) . '</urlset>');
}

function gravar_rss(array $posts): void
{
    $x = fn($s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $itens = '';
    foreach ($posts as $p) {
        $u = URL_SITE . "/{$p['slug']}/";
        $itens .= '<item><title>' . $x($p['title']) . '</title><link>' . $u . '</link><guid isPermaLink="true">' . $u . '</guid><description>' . $x($p['description'] ?? '') . '</description><pubDate>' . gmdate('D, d M Y H:i:s \G\M\T', strtotime($p['published'])) . '</pubDate></item>';
    }
    gravar(RAIZ . '/rss.xml', '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog Imigrar Brasil</title><description>Vistos, residência, naturalização e a vida do imigrante no Brasil.</description><link>https://imigrarbrasil.com/</link><language>pt-br</language>' . $itens . '</channel></rss>');
}
