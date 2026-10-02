<?php
// LIMPA O HTML DO ARTIGO antes de gravar.
//
// Fica só o que o CSS do site (.prosa) sabe estilizar — as mesmas tags dos 50 artigos que
// vieram do WordPress. Some: script, estilo inline, classe, fonte e cor coladas do Word,
// evento onclick, link javascript:. O editor já limpa ao colar; isto é a garantia no servidor.
declare(strict_types=1);

const TAGS_PERMITIDAS = [
    'p' => [], 'h2' => [], 'h3' => [], 'h4' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 'small' => [], 'sup' => [], 'sub' => [],
    'ul' => [], 'ol' => ['start'], 'li' => [], 'blockquote' => [], 'br' => [], 'hr' => [],
    'a' => ['href', 'target', 'rel'], 'img' => ['src', 'alt', 'width', 'height'], 'figure' => [], 'figcaption' => [],
    'table' => [], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => [], 'td' => [], 'nav' => [], 'footer' => [],
];
// Some com o conteúdo junto.
const TAGS_DESCARTADAS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript'];

function limpar_html(string $html): string
{
    $html = trim($html);
    if ($html === '') return '';
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="raiz">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    $raiz = $doc->getElementById('raiz');
    if (!$raiz) return '';
    limpar_no($raiz);
    $out = '';
    foreach ($raiz->childNodes as $f) $out .= $doc->saveHTML($f);
    // Parágrafo vazio que o editor deixa para trás.
    $out = preg_replace('~<p>(\s|&nbsp;|<br>)*</p>~u', '', $out);
    return trim(str_replace("\xC2\xA0", ' ', $out));
}

function limpar_no(DOMNode $no): void
{
    foreach (iterator_to_array($no->childNodes) as $f) {
        if ($f instanceof DOMComment) { $no->removeChild($f); continue; }
        if (!$f instanceof DOMElement) continue;
        $tag = strtolower($f->tagName);
        if (in_array($tag, TAGS_DESCARTADAS, true)) { $no->removeChild($f); continue; }
        if ($tag === 'h1') $f = renomear($f, 'h2');
        elseif ($tag === 'div' || $tag === 'section' || $tag === 'article') $f = renomear($f, 'p');
        elseif (!isset(TAGS_PERMITIDAS[$tag])) {
            // span, font…: some a tag, fica o texto.
            limpar_no($f);
            while ($f->firstChild) $no->insertBefore($f->firstChild, $f);
            $no->removeChild($f);
            continue;
        }
        $tag = strtolower($f->tagName);
        foreach (iterator_to_array($f->attributes) as $a) {
            $nome = strtolower($a->name);
            if (!in_array($nome, TAGS_PERMITIDAS[$tag], true)) { $f->removeAttribute($a->name); continue; }
            if (($nome === 'href' || $nome === 'src') && !url_segura($a->value)) $f->removeAttribute($a->name);
        }
        if ($tag === 'a' && $f->getAttribute('target') === '_blank') $f->setAttribute('rel', 'noopener');
        limpar_no($f);
    }
}

function renomear(DOMElement $el, string $nova): DOMElement
{
    $n = $el->ownerDocument->createElement($nova);
    while ($el->firstChild) $n->appendChild($el->firstChild);
    $el->parentNode->replaceChild($n, $el);
    return $n;
}

function url_segura(string $u): bool
{
    $u = trim($u);
    return (bool) preg_match('~^(https?://|/|#|mailto:|tel:)~i', $u);
}
