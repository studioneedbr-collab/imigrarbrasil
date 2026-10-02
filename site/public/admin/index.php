<?php
// /admin — O BLOG DO SITE, EDITADO NO PRÓPRIO SERVIDOR.
//
// O nginx manda todo endereço /admin/… para este arquivo (deploy/vhost-cloudpanel.conf),
// menos /admin/estatico/. Salvar um artigo grava em .dados/ e gera de novo as páginas do
// blog na hora (lib/gerar.php): não há build, GitHub nem banco de dados.
declare(strict_types=1);

foreach (['nucleo', 'conteudo', 'limpar', 'render', 'gerar', 'acesso', 'imagem', 'telas'] as $l) require __DIR__ . "/lib/$l.php";
date_default_timezone_set(FUSO);
// Aviso do PHP no meio da resposta quebraria o JSON do editor: vai para o log.
ini_set('display_errors', '0');

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");

$rota = '/' . trim(substr((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), strlen('/admin')), '/');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function ir(string $para): never { header("Location: /admin$para", true, 303); exit; }
function json_resposta(array $d, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    iniciar_sessao();

    if ($rota === '/entrar') {
        $erro = null;
        if ($metodo === 'POST') {
            conferir_csrf();
            if (entrar((string) ($_POST['usuario'] ?? ''), (string) ($_POST['senha'] ?? ''))) ir('/');
            $erro = bloqueado($_SERVER['REMOTE_ADDR'] ?? '?') ? 'Muitas tentativas. Espere 15 minutos.' : 'Usuário ou senha incorretos.';
        }
        tela_entrar($erro);
        exit;
    }
    if ($rota === '/sair') { session_destroy(); ir('/entrar'); }

    $eu = usuario_atual();
    if (!$eu) { if ($metodo === 'POST') json_resposta(['erro' => 'Sua sessão expirou. Entre de novo.'], 401); ir('/entrar'); }

    // Zip novo no servidor: refaz as páginas com o que foi feito aqui.
    gerar_se_o_zip_mudou();

    switch ("$metodo $rota") {
        case 'GET /':
            tela_lista(todos_posts(true), $eu);
            break;

        case 'GET /novo':
            tela_editor(null, $eu);
            break;

        case 'GET /artigo':
            $p = achar_post((string) ($_GET['slug'] ?? ''));
            if (!$p) ir('/');
            tela_editor($p, $eu);
            break;

        case 'POST /salvar':
            conferir_csrf();
            $d = json_decode((string) file_get_contents('php://input'), true);
            if (!is_array($d)) json_resposta(['erro' => 'Dados inválidos.'], 400);
            $original = isset($d['original']) && $d['original'] !== '' ? (string) $d['original'] : null;
            try {
                $p = com_trava(function () use ($d, $original, $eu) {
                    $p = salvar_post($d['post'] ?? [], $original, $eu['usuario']);
                    gerar_tudo();
                    return $p;
                });
            } catch (InvalidArgumentException $e) {
                json_resposta(['erro' => $e->getMessage()], 422);
            }
            json_resposta(['ok' => true, 'slug' => $p['slug'], 'rascunho' => $p['rascunho'], 'url' => "/{$p['slug']}/",
                'mudouEndereco' => $original !== null && $original !== $p['slug'] ? $original : null]);

        case 'POST /excluir':
            conferir_csrf();
            $slug = (string) ($_POST['slug'] ?? '');
            if (achar_post($slug)) com_trava(function () use ($slug) { excluir_post($slug); gerar_tudo(); });
            ir('/?excluido=1');

        case 'POST /imagem':
            conferir_csrf();
            try {
                $url = receber_imagem($_FILES['arquivo'] ?? [], (string) ($_POST['nome'] ?? 'imagem'));
            } catch (InvalidArgumentException $e) {
                json_resposta(['erro' => $e->getMessage()], 422);
            }
            json_resposta(['ok' => true, 'url' => $url]);

        case 'POST /gerar':
            conferir_csrf();
            $r = com_trava('gerar_tudo');
            ir('/?gerado=' . $r['paginas']);

        case 'GET /conta':
            tela_conta($eu, usuarios(), $_GET['ok'] ?? null, null);
            break;

        case 'POST /conta':
            conferir_csrf();
            $erro = acao_conta($eu);
            if ($erro) { tela_conta($eu, usuarios(), null, $erro); break; }
            ir('/conta?ok=' . urlencode((string) ($_POST['acao'] ?? '')));

        default:
            http_response_code(404);
            tela_simples('Página não encontrada', '<p>Esse endereço não existe no admin.</p><p><a class="btn" href="/admin/">Voltar aos artigos</a></p>', $eu);
    }
} catch (Throwable $e) {
    error_log('[admin] ' . $e);
    if (str_starts_with($rota, '/salvar') || str_starts_with($rota, '/imagem')) json_resposta(['erro' => 'Erro no servidor: ' . $e->getMessage()], 500);
    http_response_code(500);
    tela_simples('Algo deu errado', '<p>' . e($e->getMessage()) . '</p><p><a class="btn" href="/admin/">Voltar</a></p>', null);
}

/** Trocar a senha, criar e remover usuário. Devolve a mensagem de erro, ou null. */
function acao_conta(array $eu): ?string
{
    $us = usuarios();
    switch ($_POST['acao'] ?? '') {
        case 'senha':
            $atual = (string) ($_POST['atual'] ?? '');
            $nova = (string) ($_POST['nova'] ?? '');
            if (!password_verify($atual, $eu['hash'])) return 'A senha atual não confere.';
            if (strlen($nova) < 10) return 'A senha nova precisa de pelo menos 10 caracteres.';
            foreach ($us as &$u) if ($u['usuario'] === $eu['usuario']) $u['hash'] = password_hash($nova, PASSWORD_DEFAULT);
            unset($u);
            salvar_usuarios($us);
            return null;
        case 'criar':
            $usuario = mb_strtolower(trim((string) ($_POST['usuario'] ?? '')));
            $nome = trim((string) ($_POST['nome'] ?? ''));
            $senha = (string) ($_POST['senha'] ?? '');
            if (!preg_match('/^[a-z0-9._@-]{3,60}$/', $usuario)) return 'Usuário: de 3 a 60 caracteres, sem espaço (pode ser o e-mail).';
            if (strlen($senha) < 10) return 'A senha precisa de pelo menos 10 caracteres.';
            foreach ($us as $u) if (mb_strtolower($u['usuario']) === $usuario) return 'Esse usuário já existe.';
            $us[] = ['usuario' => $usuario, 'nome' => $nome ?: $usuario, 'hash' => password_hash($senha, PASSWORD_DEFAULT)];
            salvar_usuarios($us);
            return null;
        case 'remover':
            $alvo = (string) ($_POST['usuario'] ?? '');
            if ($alvo === $eu['usuario']) return 'Você não pode remover o próprio acesso.';
            salvar_usuarios(array_filter($us, fn($u) => $u['usuario'] !== $alvo));
            return null;
    }
    return 'Ação desconhecida.';
}
