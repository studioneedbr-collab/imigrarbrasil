<?php
// Gera as páginas do blog pelo PHP do /admin e compara com as do build (dist/).
// Rode com: npm run conferir-admin   (depois de npm run build)
declare(strict_types=1);
$dist = $argv[1];
define('RAIZ', $dist);
foreach (['nucleo', 'conteudo', 'limpar', 'render', 'gerar'] as $l) require __DIR__ . "/../public/admin/lib/$l.php";

// O script do molde tem outro nome de arquivo, com o mesmo conteúdo (o hash é igual).
$normal = fn(string $h) => trim(preg_replace(['/>\s+</', '/\s+/', '~/_astro/[^"]*?\.([A-Za-z0-9_-]{8})\.js~'], ['><', ' ', '/_astro/$1.js'], $h));
$posts = todos_posts();
$casos = [];
foreach ($posts as $p) $casos["/{$p['slug']}/"] = fn() => pagina_artigo($p, $posts);
$total = (int) ceil(count($posts) / POR_PAGINA);
for ($n = 1; $n <= $total; $n++) $casos[link_pagina($n)] = fn() => pagina_blog($n, $posts);
foreach (temas_ativos($posts) as $t) $casos[url_do_tema($t)] = fn() => pagina_tema($t, $posts);

$erros = 0;
foreach ($casos as $caminho => $f) {
    $esperado = $normal(file_get_contents("$dist{$caminho}index.html"));
    $gerado = $normal($f());
    // A página de tema usa o molde do blog, que traz o script da busca (inofensivo ali).
    if (str_contains($caminho, '/tema/')) $gerado = preg_replace('~<script type="module" src="/_astro/[^"]+"></script></main>~', '</main>', $gerado);
    if ($esperado === $gerado) continue;
    $erros++;
    $i = 0; $max = min(strlen($esperado), strlen($gerado));
    while ($i < $max && $esperado[$i] === $gerado[$i]) $i++;
    echo "DIFERENTE $caminho\n  build: …" . substr($esperado, max(0, $i - 80), 220) . "\n  admin: …" . substr($gerado, max(0, $i - 80), 220) . "\n\n";
}
echo count($casos) - $erros . '/' . count($casos) . " páginas iguais ao build\n";
exit($erros ? 1 : 0);
