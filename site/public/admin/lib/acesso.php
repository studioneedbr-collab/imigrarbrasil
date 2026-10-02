<?php
// QUEM ENTRA NO /admin.
//
// O primeiro acesso vem no zip (admin/base/acesso.json, gerado pelo `npm run pacote` a
// partir de site/.acesso-admin.json, que não vai para o Git). Ao trocar a senha ou criar
// outro usuário, a lista passa a morar em .dados/usuarios.json e a do zip deixa de valer.
declare(strict_types=1);

function iniciar_sessao(): void
{
    session_save_path(dados_dir('sessoes'));
    session_name('imigrar_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/admin', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) (12 * 3600));
    session_start();
    // Sem cron no servidor: a limpeza das sessões velhas acontece aqui, de vez em quando.
    if (random_int(1, 50) === 1) {
        foreach (glob(DADOS . '/sessoes/sess_*') ?: [] as $f) if (filemtime($f) < time() - 12 * 3600) @unlink($f);
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(24));
}

function usuarios(): array
{
    return ler_json(DADOS . '/usuarios.json') ?? ler_json(BASE . '/acesso.json', []);
}

function salvar_usuarios(array $u): void { gravar_json(DADOS . '/usuarios.json', array_values($u)); }

function usuario_atual(): ?array
{
    $nome = $_SESSION['usuario'] ?? null;
    if (!$nome) return null;
    foreach (usuarios() as $u) if ($u['usuario'] === $nome) return $u;
    return null; // removido enquanto estava logado
}

/** 8 tentativas erradas por IP a cada 15 minutos. */
function bloqueado(string $ip): bool
{
    $t = array_filter(ler_json(DADOS . '/tentativas.json', [])[$ip] ?? [], fn($x) => $x > time() - 900);
    return count($t) >= 8;
}

function registrar_erro(string $ip): void
{
    $todas = ler_json(DADOS . '/tentativas.json', []);
    foreach ($todas as $k => $v) { $todas[$k] = array_values(array_filter($v, fn($x) => $x > time() - 900)); if (!$todas[$k]) unset($todas[$k]); }
    $todas[$ip][] = time();
    gravar_json(DADOS . '/tentativas.json', $todas);
}

function entrar(string $usuario, string $senha): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
    if (bloqueado($ip)) return false;
    foreach (usuarios() as $u) {
        if (hash_equals(mb_strtolower($u['usuario']), mb_strtolower(trim($usuario))) && password_verify($senha, $u['hash'])) {
            session_regenerate_id(true);
            $_SESSION['usuario'] = $u['usuario'];
            return true;
        }
    }
    registrar_erro($ip);
    return false;
}

function conferir_csrf(): void
{
    $t = $_SERVER['HTTP_X_CSRF'] ?? $_POST['csrf'] ?? '';
    if (!is_string($t) || !hash_equals($_SESSION['csrf'], $t)) {
        http_response_code(403);
        exit('Sessão expirada. Recarregue a página.');
    }
}
