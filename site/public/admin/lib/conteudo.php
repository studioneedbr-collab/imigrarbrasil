<?php
// OS ARTIGOS: os do build (admin/base/posts.json) com o que o admin mudou por cima.
//
//   .dados/posts.json          artigos criados ou editados aqui, por slug
//   .dados/excluidos.json      slugs do build que foram apagados ou mudaram de endereço
//   .dados/redirecionamentos.json   endereço antigo → novo, quando o slug muda
//
// Por cima, e não uma cópia: quando um zip novo chega com um artigo corrigido no código,
// ele aparece — a não ser que alguém o tenha editado aqui, e aí vale a edição.
declare(strict_types=1);

function base(string $nome): array
{
    static $cache = [];
    return $cache[$nome] ??= ler_json(BASE . "/$nome.json", []);
}

function editados(): array { return ler_json(DADOS . '/posts.json', []); }
function excluidos(): array { return ler_json(DADOS . '/excluidos.json', []); }
function redirecionamentos(): array { return ler_json(DADOS . '/redirecionamentos.json', []); }

/** Todos os artigos, do mais novo ao mais velho. Rascunho só com $comRascunhos. */
function todos_posts(bool $comRascunhos = false): array
{
    $ed = editados();
    $fora = array_flip(excluidos());
    $lista = [];
    foreach (base('posts') as $p) {
        if (isset($fora[$p['slug']]) || isset($ed[$p['slug']])) continue;
        $p['origem'] = 'site';
        $lista[] = $p;
    }
    foreach ($ed as $p) {
        if (!$comRascunhos && !empty($p['rascunho'])) continue;
        $lista[] = $p;
    }
    // Estável: no empate de data, mantém a ordem do build.
    $i = 0;
    foreach ($lista as &$p) $p['_ordem'] = $i++;
    unset($p);
    usort($lista, fn($a, $b) => strcmp((string) $b['published'], (string) $a['published']) ?: $a['_ordem'] <=> $b['_ordem']);
    return array_map(function ($p) { unset($p['_ordem']); return $p; }, $lista);
}

function achar_post(string $slug): ?array
{
    foreach (todos_posts(true) as $p) if ($p['slug'] === $slug) return $p;
    return null;
}

/** Pastas da raiz que não são artigo: um slug com esse nome apagaria uma página do site. */
function slug_reservado(string $slug): bool
{
    static $fixos = ['admin', 'api', 'blog-imigracao-brasil', 'servico', 'categoria-servico', 'equipe', 'depoimento', 'landingpage', 'quem-somos',
        'nossos-servicos', 'fale-conosco', 'politica-de-privacidade', 'email-enviado-com-sucesso', 'wp-content', 'uploads', 'marca', '_astro', 'tag', 'category', 'author', 'feed'];
    return in_array($slug, $fixos, true);
}

/**
 * Salva um artigo. $original é o slug que ele tinha (null se novo).
 * Devolve o artigo salvo; lança InvalidArgumentException com a mensagem para a tela.
 */
function salvar_post(array $d, ?string $original, string $quem): array
{
    $titulo = trim((string) ($d['title'] ?? ''));
    $slug = trim((string) ($d['slug'] ?? ''));
    if ($titulo === '') throw new InvalidArgumentException('Escreva o título.');
    if (!preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $slug) || strlen($slug) > 120) throw new InvalidArgumentException('Endereço inválido: use só letras minúsculas, números e hífen.');
    if (slug_reservado($slug)) throw new InvalidArgumentException("O endereço /$slug/ é de uma página do site. Escolha outro.");
    $existente = achar_post($slug);
    if ($existente && $slug !== $original) throw new InvalidArgumentException("Já existe um artigo em /$slug/.");
    if (!$existente && is_dir(RAIZ . "/$slug") && !isset(redirecionamentos()[$slug])) throw new InvalidArgumentException("O endereço /$slug/ já está em uso no site.");

    $html = limpar_html((string) ($d['html'] ?? ''));
    $anterior = $original ? achar_post($original) : null;
    $agora = gmdate('Y-m-d\TH:i:s+00:00');
    $publicado = data_publicacao(trim((string) ($d['published'] ?? '')), $anterior['published'] ?? null, $agora);
    $palavras = array_values(array_unique(array_filter(array_map('trim', is_array($d['keywords'] ?? null) ? $d['keywords'] : explode(',', (string) ($d['keywords'] ?? ''))))));

    $p = [
        'slug' => $slug,
        'title' => $titulo,
        'seoTitle' => trim((string) ($d['seoTitle'] ?? '')) ?: $titulo,
        'description' => trim((string) ($d['description'] ?? '')),
        'image' => trim((string) ($d['image'] ?? '')) ?: null,
        'published' => $publicado,
        // "Atualizado em" só aparece se a edição for em outro dia (como no build).
        'modified' => $anterior ? $agora : null,
        'imageAlt' => trim((string) ($d['imageAlt'] ?? '')) ?: null,
        'author' => trim((string) ($d['author'] ?? '')) ?: 'Walter Gama',
        'keywords' => $palavras,
        'html' => $html,
        'readingMinutes' => minutos_de_leitura($html),
        'rascunho' => !empty($d['rascunho']),
        'origem' => 'admin',
        'editadoPor' => $quem,
        'editadoEm' => $agora,
    ];

    $ed = editados();
    $exc = excluidos();
    $red = redirecionamentos();
    if ($original && $original !== $slug) {
        unset($ed[$original]);
        // O endereço antigo está no Google: vira um redirecionamento para o novo.
        if (in_array($original, array_column(base('posts'), 'slug'), true) && !in_array($original, $exc, true)) $exc[] = $original;
        if ($anterior && empty($anterior['rascunho'])) $red[$original] = $slug;
        foreach ($red as $de => $para) if ($para === $original) $red[$de] = $slug;
    }
    unset($red[$slug]);
    $ed[$slug] = $p;
    gravar_json(DADOS . '/posts.json', $ed);
    gravar_json(DADOS . '/excluidos.json', array_values($exc));
    gravar_json(DADOS . '/redirecionamentos.json', $red);
    return $p;
}

function excluir_post(string $slug): void
{
    $ed = editados();
    unset($ed[$slug]);
    gravar_json(DADOS . '/posts.json', $ed);
    if (in_array($slug, array_column(base('posts'), 'slug'), true)) {
        $exc = excluidos();
        if (!in_array($slug, $exc, true)) $exc[] = $slug;
        gravar_json(DADOS . '/excluidos.json', $exc);
    }
}

/**
 * O campo da tela é "2026-07-21T20:15" no horário de Brasília, sem segundos. Se o minuto
 * é o mesmo que já estava, mantém a data original inteira (os segundos vieram do WordPress).
 */
function data_publicacao(string $campo, ?string $anterior, string $agora): string
{
    if ($campo === '') return $anterior ?? $agora;
    try {
        $d = new DateTimeImmutable($campo, new DateTimeZone(FUSO));
    } catch (Exception) {
        throw new InvalidArgumentException('Data de publicação inválida.');
    }
    if ($anterior && (new DateTimeImmutable($anterior))->setTimezone(new DateTimeZone(FUSO))->format('Y-m-d\TH:i') === $d->format('Y-m-d\TH:i')) return $anterior;
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s+00:00');
}

/** 200 palavras por minuto, como no build. */
function minutos_de_leitura(string $html): int
{
    $palavras = preg_split('/\s+/u', preg_replace('/<[^>]+>/', ' ', $html), -1, PREG_SPLIT_NO_EMPTY);
    return max(1, (int) round(count($palavras) / 200));
}
