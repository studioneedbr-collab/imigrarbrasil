<?php
// AS TELAS DO /admin. HTML simples; o comportamento mora em estatico/admin.js.
declare(strict_types=1);

const VERSAO_ESTATICO = '1';

function topo(string $titulo, ?array $eu, string $classe = ''): void
{
    $v = VERSAO_ESTATICO;
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . e($titulo) . ' · Admin Imigrar Brasil</title><meta name="robots" content="noindex, nofollow">'
        . '<link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/admin/estatico/admin.css?v=' . $v . '">'
        . '<script src="/admin/estatico/admin.js?v=' . $v . '" defer></script></head><body class="' . e($classe) . '">';
    if ($eu) {
        echo '<header class="barra"><div class="barra-in"><a class="marca" href="/admin/"><img src="/marca/simbolo-256.png" alt="" width="28" height="28"><span>Blog <b>Imigrar Brasil</b></span></a>'
            . '<nav><a href="/admin/">Artigos</a><a href="/admin/novo">Novo artigo</a><a href="/" target="_blank" rel="noopener">Ver o site ↗</a></nav>'
            . '<div class="barra-eu"><a href="/admin/conta" title="Sua conta">' . e($eu['nome'] ?? $eu['usuario']) . '</a><a href="/admin/sair">Sair</a></div></div></header>';
    }
    echo '<main class="pagina">';
}

function rodape(): void
{
    echo '</main><script type="application/json" id="csrf">' . js($_SESSION['csrf'] ?? '') . '</script></body></html>';
}

function tela_simples(string $titulo, string $html, ?array $eu): void
{
    topo($titulo, $eu);
    echo '<div class="caixa estreita"><h1>' . e($titulo) . '</h1>' . $html . '</div>';
    rodape();
}

function tela_entrar(?string $erro): void
{
    topo('Entrar', null, 'tela-entrar');
    echo '<form class="caixa entrar" method="post" action="/admin/entrar">'
        . '<img src="/marca/logotipo-original-640.png" alt="Imigrar Brasil" width="200" height="56">'
        . '<h1>Admin do blog</h1>'
        . ($erro ? '<p class="aviso aviso-erro" role="alert">' . e($erro) . '</p>' : '')
        . '<label>Usuário<input name="usuario" autocomplete="username" required autofocus></label>'
        . '<label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>'
        . '<input type="hidden" name="csrf" value="' . e($_SESSION['csrf']) . '">'
        . '<button class="btn btn-primario btn-largo" type="submit">Entrar</button></form>';
    rodape();
}

function tela_lista(array $posts, array $eu): void
{
    topo('Artigos', $eu);
    $publicados = count(array_filter($posts, fn($p) => empty($p['rascunho'])));
    echo '<div class="cabeca"><div><h1>Artigos</h1><p class="sub">' . $publicados . ' publicados' . (count($posts) > $publicados ? ' · ' . (count($posts) - $publicados) . ' rascunho(s)' : '') . '</p></div>'
        . '<a class="btn btn-primario" href="/admin/novo">+ Novo artigo</a></div>';
    if (isset($_GET['excluido'])) echo '<p class="aviso aviso-ok" role="status">Artigo apagado. Ele já saiu do site.</p>';
    if (isset($_GET['gerado'])) echo '<p class="aviso aviso-ok" role="status">Blog gerado de novo: ' . (int) $_GET['gerado'] . ' páginas.</p>';
    echo '<div class="filtros"><input type="search" id="filtro" placeholder="Buscar por título ou palavra-chave…" aria-label="Buscar artigos"></div>';
    echo '<ul class="lista" id="lista">';
    foreach ($posts as $p) {
        $busca = norm($p['title'] . ' ' . implode(' ', $p['keywords']) . ' ' . $p['slug']);
        $status = !empty($p['rascunho']) ? '<span class="selo selo-rascunho">Rascunho</span>' : '<span class="selo selo-ok">Publicado</span>';
        echo '<li data-busca="' . e($busca) . '"><a class="item" href="/admin/artigo?slug=' . e(rawurlencode($p['slug'])) . '">'
            . ($p['image'] ? '<img src="' . e($p['image']) . '" alt="" loading="lazy" width="120" height="68">' : '<span class="sem-img"></span>')
            . '<span class="item-texto"><strong>' . e($p['title']) . '</strong><span class="meta">' . $status . e($p['author']) . ' · ' . e(data_hora($p['published'])) . (($p['origem'] ?? '') === 'admin' && !empty($p['editadoPor']) ? ' · editado por ' . e($p['editadoPor']) : '') . '</span></span></a>'
            . (empty($p['rascunho']) ? '<a class="ver" href="/' . e($p['slug']) . '/" target="_blank" rel="noopener" title="Ver no site">↗</a>' : '') . '</li>';
    }
    echo '</ul><p class="vazio" id="vazio" hidden>Nenhum artigo encontrado.</p>';
    echo '<form class="rodape-lista" method="post" action="/admin/gerar"><input type="hidden" name="csrf" value="' . e($_SESSION['csrf']) . '">'
        . '<span>O blog é gerado sozinho a cada artigo salvo. Se o site parecer desatualizado,</span> <button class="link" type="submit">gere tudo de novo</button>.</form>';
    rodape();
}

function tela_editor(?array $p, array $eu): void
{
    $novo = $p === null;
    $p ??= ['slug' => '', 'title' => '', 'seoTitle' => '', 'description' => '', 'image' => null, 'imageAlt' => null, 'author' => $eu['nome'] ?? 'Walter Gama',
        'keywords' => [], 'html' => '', 'published' => gmdate('Y-m-d\TH:i:s+00:00'), 'rascunho' => false];
    $autores = array_column(base('equipe'), 'nome');
    if (!in_array($p['author'], $autores, true)) array_unshift($autores, $p['author']);
    $local = (new DateTimeImmutable($p['published']))->setTimezone(new DateTimeZone(FUSO))->format('Y-m-d\TH:i');

    topo($novo ? 'Novo artigo' : $p['title'], $eu, 'tela-editor');
    echo '<form id="editor" class="editor" data-original="' . e($novo ? '' : $p['slug']) . '" autocomplete="off">';
    echo '<div class="cabeca"><div><a class="voltar" href="/admin/">← Artigos</a><h1>' . ($novo ? 'Novo artigo' : 'Editar artigo') . '</h1></div>'
        . '<div class="acoes"><label class="troca"><input type="checkbox" name="rascunho"' . (!empty($p['rascunho']) ? ' checked' : '') . '> Rascunho</label>'
        . (!$novo && empty($p['rascunho']) ? '<a class="btn" href="/' . e($p['slug']) . '/" target="_blank" rel="noopener">Ver no site ↗</a>' : '')
        . '<button class="btn btn-primario" type="submit" id="salvar">' . ($novo ? 'Publicar' : 'Salvar') . '</button></div></div>';
    if (isset($_GET['salvo'])) {
        echo '<p class="aviso aviso-ok" id="mensagem" role="status">' . (!empty($p['rascunho']) ? 'Rascunho salvo. Ele não aparece no site até você desmarcar “Rascunho” e salvar.'
            : 'Publicado. <a href="/' . e($p['slug']) . '/" target="_blank" rel="noopener">Ver no site ↗</a>' . (!empty($_GET['antigo']) ? ' O endereço antigo /' . e((string) $_GET['antigo']) . '/ agora leva para este.' : '')) . '</p>';
    } else {
        echo '<p class="aviso" id="mensagem" role="status" hidden></p>';
    }

    echo '<div class="colunas"><div class="principal">';
    echo '<label class="campo">Título<input name="title" class="titulo" required maxlength="200" value="' . e($p['title']) . '" placeholder="Ex.: Naturalização brasileira em 2026: prazos e documentos"></label>';
    echo '<label class="campo">Endereço<span class="endereco"><span>imigrarbrasil.com/</span><input name="slug" value="' . e($p['slug']) . '" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" data-manual="' . ($novo ? '0' : '1') . '"><span>/</span></span>'
        . ($novo ? '' : '<small class="alerta" id="alerta-endereco" hidden>Mudar o endereço de um artigo publicado faz o antigo redirecionar para o novo — mas o Google leva semanas para trocar.</small>') . '</label>';
    echo '<div class="campo"><span>Texto</span><div class="editor-texto">'
        . '<div class="ferramentas" role="toolbar" aria-label="Formatação">'
        . '<button type="button" data-cmd="formatBlock" data-arg="h2" title="Título de seção — vira o índice do artigo">Título</button>'
        . '<button type="button" data-cmd="formatBlock" data-arg="h3" title="Subtítulo">Subtítulo</button>'
        . '<button type="button" data-cmd="formatBlock" data-arg="p" title="Parágrafo normal">¶</button><i></i>'
        . '<button type="button" data-cmd="bold" title="Negrito"><b>N</b></button>'
        . '<button type="button" data-cmd="italic" title="Itálico"><em>I</em></button><i></i>'
        . '<button type="button" data-cmd="insertUnorderedList" title="Lista">• Lista</button>'
        . '<button type="button" data-cmd="insertOrderedList" title="Lista numerada">1. Lista</button>'
        . '<button type="button" data-cmd="formatBlock" data-arg="blockquote" title="Citação / destaque">“ ”</button><i></i>'
        . '<button type="button" data-acao="link" title="Link">Link</button>'
        . '<button type="button" data-acao="imagem" title="Imagem no texto">Imagem</button>'
        . '<button type="button" data-cmd="removeFormat" title="Limpar formatação">⌫</button>'
        . '<button type="button" data-cmd="undo" title="Desfazer">↶</button>'
        . '<span class="modo"><button type="button" data-modo="visual" class="ativo">Visual</button><button type="button" data-modo="html">HTML</button></span></div>'
        . '<div class="prosa-admin" id="texto" contenteditable="true" aria-label="Texto do artigo">' . $p['html'] . '</div>'
        . '<textarea id="texto-html" class="html" aria-label="Texto do artigo em HTML" spellcheck="false" hidden></textarea>'
        . '<input type="file" id="arquivo-texto" accept="image/jpeg,image/png,image/webp" hidden></div>'
        . '<small>Cole direto do Word ou do Google Docs: a formatação de fonte e cor some, ficam títulos, negrito, listas e links. Use <b>Título</b> para dividir o texto em seções — elas viram o índice ao lado do artigo.</small></div>';
    echo '</div><aside class="lateral">';

    echo '<section class="caixa"><h2>Como aparece no Google</h2><div class="google"><span class="g-url">imigrarbrasil.com › <span id="g-slug"></span></span><span class="g-titulo" id="g-titulo"></span><span class="g-desc" id="g-desc"></span></div></section>';
    echo '<section class="caixa"><h2>SEO do artigo <span id="seo-nota"></span></h2><div class="barra-seo"><i id="seo-barra"></i></div><ul class="seo" id="seo"></ul></section>';

    echo '<section class="caixa"><h2>Capa</h2><div class="capa" id="capa">' . ($p['image'] ? '<img src="' . e($p['image']) . '" alt="">' : '<span>Sem capa. Use uma imagem horizontal (16:9), de pelo menos 1200 px.</span>') . '</div>'
        . '<input type="hidden" name="image" value="' . e((string) $p['image']) . '">'
        . '<div class="linha"><button type="button" class="btn" data-acao="capa">' . ($p['image'] ? 'Trocar capa' : 'Enviar capa') . '</button>' . '<button type="button" class="link" data-acao="tirar-capa"' . ($p['image'] ? '' : ' hidden') . '>Tirar</button></div>'
        . '<input type="file" id="arquivo-capa" accept="image/jpeg,image/png,image/webp" hidden>'
        . '<label class="campo">Descrição da imagem<input name="imageAlt" value="' . e((string) $p['imageAlt']) . '" placeholder="Ex.: Passaporte brasileiro sobre a mesa" maxlength="200"></label></section>';

    echo '<section class="caixa"><h2>Google e redes sociais</h2>'
        . '<label class="campo">Descrição<textarea name="description" rows="4" maxlength="320" placeholder="O resumo que aparece embaixo do título no Google. Entre 120 e 160 caracteres.">' . e($p['description']) . '</textarea><small id="conta-desc"></small></label>'
        . '<label class="campo">Título para o Google <em>(opcional)</em><input name="seoTitle" value="' . e($p['seoTitle'] === $p['title'] ? '' : (string) $p['seoTitle']) . '" maxlength="120" placeholder="Se vazio, usa o título do artigo"></label>'
        . '<label class="campo">Palavras-chave <em>(separadas por vírgula; a primeira é a principal)</em><textarea name="keywords" rows="3" placeholder="naturalização, Lei de Migração, Polícia Federal">' . e(implode(', ', $p['keywords'])) . '</textarea></label></section>';

    echo '<section class="caixa"><h2>Autor e data</h2><div class="dois">'
        . '<label class="campo">Autor<select name="author">' . implode('', array_map(fn($a) => '<option' . ($a === $p['author'] ? ' selected' : '') . '>' . e($a) . '</option>', $autores)) . '</select></label>'
        . '<label class="campo">Publicado em<input type="datetime-local" name="published" value="' . e($local) . '"></label></div></section>';

    if (!$novo) {
        echo '<section class="caixa perigo"><h2>Apagar</h2><p>O artigo sai do site e o endereço passa a dar “página não encontrada”.</p>'
            . '<button class="btn btn-perigo" type="submit" form="form-excluir">Apagar este artigo</button></section>';
    }
    echo '</aside></div></form>';
    if (!$novo) {
        echo '<form id="form-excluir" method="post" action="/admin/excluir" data-confirmar="Apagar “' . e($p['title']) . '”? Ele sai do site agora.">'
            . '<input type="hidden" name="slug" value="' . e($p['slug']) . '"><input type="hidden" name="csrf" value="' . e($_SESSION['csrf']) . '"></form>';
    }
    rodape();
}

function tela_conta(array $eu, array $usuarios, ?string $ok, ?string $erro): void
{
    topo('Conta', $eu);
    $csrf = '<input type="hidden" name="csrf" value="' . e($_SESSION['csrf']) . '">';
    $msgs = ['senha' => 'Senha trocada.', 'criar' => 'Acesso criado.', 'remover' => 'Acesso removido.'];
    echo '<div class="cabeca"><h1>Conta</h1></div>';
    if ($ok && isset($msgs[$ok])) echo '<p class="aviso aviso-ok" role="status">' . $msgs[$ok] . '</p>';
    if ($erro) echo '<p class="aviso aviso-erro" role="alert">' . e($erro) . '</p>';
    echo '<div class="colunas-conta">';
    echo '<form class="caixa" method="post" action="/admin/conta">' . $csrf . '<input type="hidden" name="acao" value="senha"><h2>Trocar a sua senha</h2>'
        . '<label class="campo">Senha atual<input type="password" name="atual" autocomplete="current-password" required></label>'
        . '<label class="campo">Senha nova <em>(10 caracteres ou mais)</em><input type="password" name="nova" autocomplete="new-password" minlength="10" required></label>'
        . '<button class="btn btn-primario" type="submit">Trocar senha</button></form>';
    echo '<div class="caixa"><h2>Quem tem acesso</h2><ul class="usuarios">';
    foreach ($usuarios as $u) {
        echo '<li><span><strong>' . e($u['nome'] ?? $u['usuario']) . '</strong><small>' . e($u['usuario']) . '</small></span>'
            . ($u['usuario'] === $eu['usuario'] ? '<em>você</em>' : '<form method="post" action="/admin/conta" data-confirmar="Remover o acesso de ' . e($u['usuario']) . '?">' . $csrf . '<input type="hidden" name="acao" value="remover"><input type="hidden" name="usuario" value="' . e($u['usuario']) . '"><button class="link" type="submit">Remover</button></form>') . '</li>';
    }
    echo '</ul><form method="post" action="/admin/conta" class="novo-usuario">' . $csrf . '<input type="hidden" name="acao" value="criar"><h3>Dar acesso a outra pessoa</h3>'
        . '<label class="campo">Nome<input name="nome" placeholder="Sérgio Reis"></label>'
        . '<label class="campo">Usuário <em>(pode ser o e-mail)</em><input name="usuario" required autocapitalize="off"></label>'
        . '<label class="campo">Senha inicial <em>(10 caracteres ou mais)</em><input name="senha" type="text" minlength="10" required autocomplete="off"></label>'
        . '<button class="btn" type="submit">Criar acesso</button></form></div></div>';
    rodape();
}
