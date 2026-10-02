<?php
// O BÁSICO DO /admin: onde ficam as coisas, ler e gravar JSON, escapar HTML.
//
//   htdocs/imigrarbrasil.com/            ← RAIZ (a pasta do site, o que o zip traz)
//   htdocs/imigrarbrasil.com/admin/base/ ← o que o build sabe (posts, serviços, regras)
//   htdocs/imigrarbrasil.com/admin/moldes/ ← o layout do site com marcas, para gerar páginas
//   htdocs/imigrarbrasil.com/.dados/     ← o que foi feito NO admin (artigos, usuários)
//
// .dados/ começa com ponto: o vhost nega qualquer caminho assim, e subir o zip de novo
// não apaga a pasta (o zip não a traz). É o único lugar que o admin escreve além das
// páginas do blog.
declare(strict_types=1);

defined('RAIZ') || define('RAIZ', dirname(__DIR__, 2)); // o conferir-admin aponta para uma cópia
define('BASE', RAIZ . '/admin/base');
define('MOLDES', RAIZ . '/admin/moldes');
define('DADOS', RAIZ . '/.dados');
define('URL_SITE', 'https://imigrarbrasil.com');
define('FUSO', 'America/Sao_Paulo');

function dados_dir(string $sub = ''): string
{
    $d = DADOS . ($sub !== '' ? "/$sub" : '');
    if (!is_dir($d)) mkdir($d, 0770, true);
    return $d;
}

function ler_json(string $arq, $padrao = null)
{
    if (!is_file($arq)) return $padrao;
    $v = json_decode((string) file_get_contents($arq), true);
    return $v === null ? $padrao : $v;
}

/** Grava inteiro ou nada: escreve ao lado e troca. Uma página nunca fica pela metade. */
function gravar(string $arq, string $conteudo): void
{
    $dir = dirname($arq);
    if (!is_dir($dir)) mkdir($dir, 0770, true);
    $tmp = $dir . '/.tmp-' . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $conteudo) === false) throw new RuntimeException("Não consegui gravar $arq");
    chmod($tmp, 0660);
    rename($tmp, $arq);
}

function gravar_json(string $arq, $valor): void
{
    gravar($arq, json_encode($valor, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

/** Uma escrita por vez: dois cliques em "Publicar" não geram o site duas vezes ao mesmo tempo. */
function com_trava(callable $f)
{
    $h = fopen(dados_dir() . '/trava', 'c');
    flock($h, LOCK_EX);
    try { return $f(); } finally { flock($h, LOCK_UN); fclose($h); }
}

function apagar_pasta(string $d): void
{
    if (!is_dir($d)) return;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($d);
}

// ── escapar como o Astro escapa (para a página gerada sair igual à do build) ─────────
/** Texto: html-escaper, o que o Astro usa em {expressão}. */
function e(?string $s): string
{
    return strtr((string) $s, ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', "'" => '&#39;', '"' => '&quot;']);
}
/** Atributo: no Astro 7 é o mesmo escape do texto. Separado para deixar claro onde vai. */
function ea(?string $s): string
{
    return e($s);
}
/** encodeURIComponent do JS: rawurlencode codifica também ! ' ( ) * ~. */
function enc_uri(string $s): string
{
    return strtr(rawurlencode($s), ['%21' => '!', '%27' => "'", '%28' => '(', '%29' => ')', '%2A' => '*', '%7E' => '~']);
}
/** JSON igual ao JSON.stringify: sem escapar barra nem acento. */
function js($v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
