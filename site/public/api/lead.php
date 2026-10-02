<?php
// Repassa o formulário do site para a captura de leads do CRM (imigrar-agent).
//
// Existe só para guardar o token fora do navegador. A configuração fica num arquivo
// FORA da pasta pública do site, para que um erro de configuração do nginx nunca sirva
// o segredo como texto:
//
//   /home/<usuario>/htdocs/imigrar-lead-config.php      ← aqui (um nível acima)
//   /home/<usuario>/htdocs/imigrarbrasil.com/api/lead.php
//
//   <?php return [
//     'url'   => 'https://painel.imigrarbrasil.com/api/captura/site',
//     'token' => 'o mesmo valor de SITE_CAPTURE_TOKEN no imigrar-agent',
//   ];
//
// Sem esse arquivo a rota responde 503 e o site segue para o WhatsApp normalmente.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('{"ok":false,"error":"metodo"}');
}

$config = null;
// A raiz do site é o plano B: o PHP do CloudPanel pode ter open_basedir limitado a ela, e o
// vhost devolve 404 para qualquer .php que não seja /api/lead.php.
foreach ([dirname(__DIR__, 2) . '/imigrar-lead-config.php', dirname(__DIR__) . '/imigrar-lead-config.php'] as $arq) {
    if (is_readable($arq)) { $config = include $arq; break; }
}
if (!is_array($config) || empty($config['url']) || empty($config['token'])) {
    http_response_code(503);
    exit('{"ok":false,"error":"nao_configurado"}');
}

$bruto = file_get_contents('php://input', false, null, 0, 20000);
$dados = json_decode($bruto ?: '', true);
if (!is_array($dados)) {
    http_response_code(400);
    exit('{"ok":false,"error":"json_invalido"}');
}

// Só os campos que a captura conhece. A validação de verdade é do lado do CRM.
$campos = ['nome', 'telefone', 'email', 'mensagem', 'origem', 'idioma', 'pagina', 'ref', 'website'];
$corpo = [];
foreach ($campos as $c) {
    if (isset($dados[$c]) && is_string($dados[$c]) && trim($dados[$c]) !== '') {
        $corpo[$c] = mb_substr(trim($dados[$c]), 0, $c === 'mensagem' ? 4000 : 300);
    }
}

$ch = curl_init($config['url']);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($corpo, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Imigrar-Token: ' . $config['token']],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 7,
    CURLOPT_CONNECTTIMEOUT => 4,
]);
$resposta = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 502;
curl_close($ch);

http_response_code($status >= 200 && $status < 300 ? 200 : 502);
echo $resposta !== false ? $resposta : '{"ok":false,"error":"crm_indisponivel"}';
