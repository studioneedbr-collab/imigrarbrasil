<?php
/**
 * Plugin Name: Imigrar Brasil — lead do site no CRM
 * Description: Manda para o CRM quem preenche o formulário do site, inclusive quem não completa o passo do WhatsApp.
 * Version: 1.0.0
 *
 * ── O BURACO QUE ISTO FECHA ───────────────────────────────────────────────────────
 *
 * O formulário do site é do plugin `ibexgo-leads`. Ele pede nome e WhatsApp, guarda a
 * linha na lista dele e MANDA A PESSOA PARA O `wa.me` com uma mensagem pronta.
 *
 * Quem completa esse último passo chega ao atendimento pelo caminho normal, porque a
 * mensagem cai no webhook do WhatsApp. QUEM NÃO COMPLETA, NÃO. E é gente que digitou
 * nome e telefone: decidiu ser procurada. Ela fica só na lista do plugin, dentro do
 * WordPress, que ninguém abre como fila — a mesma caixa de e-mail que a rota de captura
 * existe para substituir. O trecho entre o "Enviar" e o WhatsApp é onde o lead some, e é
 * exatamente onde este arquivo escuta.
 *
 * ── POR QUE MU-PLUGIN, E NÃO UM SNIPPET NO TEMA ───────────────────────────────────
 *
 * Em `wp-content/mu-plugins/` o arquivo é carregado sempre: não aparece como plugin para
 * desativar por engano, não some ao trocar de tema e não é apagado por atualização. Um
 * snippet no `functions.php` do tema morre na primeira atualização do tema, e ninguém
 * relaciona "paramos de receber lead" com "o tema atualizou na terça".
 *
 * ── POR QUE NÃO MEXEMOS NO PLUGIN DO FORMULÁRIO ───────────────────────────────────
 *
 * `rest_request_after_callbacks` roda DEPOIS que o endpoint do ibexgo já respondeu, e é
 * WordPress puro. Editar o plugin resolveria hoje e seria revertido na próxima
 * atualização dele. Aqui nada do ibexgo é tocado — se um dia ele mudar de nome de campo,
 * este arquivo para de achar o que mandar e registra no log, em vez de quebrar o site.
 *
 * ── INSTALAÇÃO ────────────────────────────────────────────────────────────────────
 *
 * 1. Copie este arquivo para `wp-content/mu-plugins/imigrar-captura.php`
 *    (crie a pasta `mu-plugins` se não existir).
 * 2. No `wp-config.php`, ANTES da linha "That's all, stop editing":
 *       define('IMIGRAR_CAPTURE_TOKEN', 'o-segredo-combinado');
 *    O token NÃO fica neste arquivo: assim ele pode ser lido, copiado e versionado sem
 *    carregar segredo junto.
 */

if (!defined('ABSPATH')) { exit; }

/** A rota do formulário, como o próprio HTML da página declara em `data-rest`. */
const IMIGRAR_ROTA_DO_FORMULARIO = '/ibexgo/v1/leads/submit';

/** Para onde o lead vai. O mesmo endereço do `docs/CAPTURA-DO-SITE.md`. */
const IMIGRAR_DESTINO = 'https://agente.imigrarbrasil.com.br/api/captura/site';

/**
 * O que foi capturado nesta requisição, à espera do `shutdown`.
 *
 * O envio NÃO acontece aqui dentro do filtro de propósito: o navegador está parado
 * esperando a resposta para então redirecionar a pessoa ao WhatsApp. Somar o tempo de uma
 * chamada a outro servidor a essa espera é atrasar o passo mais importante do formulário
 * por causa de um registro que a pessoa nem vê.
 */
$GLOBALS['imigrar_lead_pendente'] = null;

add_filter('rest_request_after_callbacks', function ($response, $handler, $request) {
    // Nunca deixe este arquivo derrubar o formulário. Ele é um ouvinte; se ele falhar,
    // o site continua funcionando exatamente como funcionava sem ele.
    try {
        if (!($request instanceof WP_REST_Request)) { return $response; }
        if ($request->get_route() !== IMIGRAR_ROTA_DO_FORMULARIO) { return $response; }

        // Só o que deu certo. Formulário recusado pelo próprio plugin (validação, spam,
        // duplicado) não é lead, e mandar assim mesmo encheria a fila de lixo.
        if (is_wp_error($response)) { return $response; }
        $dados = ($response instanceof WP_REST_Response) ? $response->get_data() : $response;
        if ($response instanceof WP_REST_Response && $response->get_status() >= 300) { return $response; }
        $ok = is_array($dados) && (!empty($dados['ok']) || !empty($dados['lead_id']) || !empty($dados['id']));
        if (!$ok) { return $response; }

        $nome     = trim((string) $request->get_param('nome'));
        $telefone = trim((string) $request->get_param('whatsapp'));
        if ($telefone === '') { $telefone = trim((string) $request->get_param('telefone')); }

        // Sem nome ou sem telefone não há o que mandar — e é o sinal de que os campos do
        // formulário mudaram. Registrar é o que faz alguém descobrir isso sem esperar o
        // cliente reclamar que parou de chegar lead.
        if ($nome === '' || $telefone === '') {
            error_log('[imigrar-captura] formulário sem nome/whatsapp — os campos mudaram? ' .
                wp_json_encode(array_keys((array) $request->get_params())));
            return $response;
        }

        $GLOBALS['imigrar_lead_pendente'] = array(
            'nome'     => $nome,
            'telefone' => $telefone,
            'email'    => trim((string) $request->get_param('email')),
            'mensagem' => trim((string) $request->get_param('mensagem')),
            'origem'   => 'formulário do site',
            'pagina'   => trim((string) $request->get_param('page_url')),
            'ref'      => trim((string) ($request->get_param('afiliado_ref') ?: $request->get_param('ref'))),
            'idioma'   => imigrar_idioma_do_visitante(),
        );
    } catch (Throwable $e) {
        error_log('[imigrar-captura] falhou ao ler o formulário: ' . $e->getMessage());
    }
    return $response;
}, 10, 3);

/**
 * EM QUE IDIOMA A PESSOA ESTAVA LENDO O SITE.
 *
 * O GTranslate deste site está com `url_structure: "none"` — ele traduz no navegador e a
 * URL nunca muda. Então não há caminho (`/es/...`) para ler: o único rastro que chega ao
 * servidor é o cookie `googtrans`, no formato `/pt/es`, cujo último pedaço é a língua
 * escolhida. Sem cookie, a pessoa está lendo em português e não há nada a dizer.
 *
 * Mandamos o código cru. Quem decide se ele serve é o CRM — o GTranslate oferece alemão e
 * italiano, que o atendimento não cobre, e repetir essa lista aqui seria mantê-la em dois
 * servidores diferentes esperando que alguém lembre dos dois.
 */
function imigrar_idioma_do_visitante() {
    if (empty($_COOKIE['googtrans'])) { return ''; }
    $partes = array_values(array_filter(explode('/', urldecode((string) $_COOKIE['googtrans']))));
    return $partes ? substr((string) end($partes), 0, 8) : '';
}

/**
 * O envio, já com a resposta na mão da pessoa.
 *
 * `fastcgi_finish_request()` devolve a página e mantém o PHP vivo para terminar o
 * serviço: o redirecionamento para o WhatsApp acontece na hora, e a conversa com o CRM
 * corre depois, sem ninguém esperando por ela.
 */
add_action('shutdown', function () {
    $lead = $GLOBALS['imigrar_lead_pendente'] ?? null;
    if (!$lead) { return; }
    $GLOBALS['imigrar_lead_pendente'] = null;

    if (function_exists('fastcgi_finish_request')) { fastcgi_finish_request(); }

    if (!defined('IMIGRAR_CAPTURE_TOKEN') || !IMIGRAR_CAPTURE_TOKEN) {
        error_log('[imigrar-captura] IMIGRAR_CAPTURE_TOKEN não está definido no wp-config.php — ' .
            'o lead de "' . $lead['nome'] . '" ficou só no WordPress.');
        return;
    }

    $corpo = array_filter($lead, static function ($v) { return $v !== '' && $v !== null; });

    $resposta = wp_remote_post(IMIGRAR_DESTINO, array(
        'timeout'  => 8,
        'blocking' => true, // Precisamos LER a resposta: é ela que diz se o lead entrou.
        'headers'  => array(
            'Content-Type'    => 'application/json; charset=utf-8',
            'X-Imigrar-Token' => IMIGRAR_CAPTURE_TOKEN,
        ),
        'body' => wp_json_encode($corpo),
    ));

    // O LOG É O ÚNICO LUGAR ONDE ISTO APARECE. A pessoa já foi embora para o WhatsApp e
    // ninguém está olhando a tela. Se o token estiver errado ou a rota fora do ar, é esta
    // linha no error_log do WordPress que responde "por que o lead não chegou no CRM".
    if (is_wp_error($resposta)) {
        error_log('[imigrar-captura] não alcançou o CRM: ' . $resposta->get_error_message());
        return;
    }
    $codigo = (int) wp_remote_retrieve_response_code($resposta);
    if ($codigo < 200 || $codigo >= 300) {
        error_log('[imigrar-captura] o CRM recusou (HTTP ' . $codigo . '): ' .
            substr((string) wp_remote_retrieve_body($resposta), 0, 300));
    }
}, 1);
