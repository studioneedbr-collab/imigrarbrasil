<?php
/**
 * Plugin Name: Imigrar Brasil — lead do site no CRM
 * Description: Manda para o CRM quem preenche o formulário do site (inclusive quem não completa o passo do WhatsApp) e instala a medição do Studio Need.
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
/**
 * Devolve a página e mantém o PHP vivo para terminar o serviço.
 *
 * `fastcgi_finish_request()` é o que faz o visitante não esperar pelas nossas chamadas a
 * outro servidor. A guarda existe porque mais de um `shutdown` chama isto no mesmo pedido
 * — a segunda chamada não faria nada de útil e o PHP reclama.
 */
function imigrar_encerrar_resposta() {
    static $ja = false;
    if ($ja) { return; }
    $ja = true;
    if (function_exists('fastcgi_finish_request')) { fastcgi_finish_request(); }
}

add_action('shutdown', function () {
    $lead = $GLOBALS['imigrar_lead_pendente'] ?? null;
    if (!$lead) { return; }
    $GLOBALS['imigrar_lead_pendente'] = null;

    imigrar_encerrar_resposta();

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

/* ═══════════════════════════════════════════════════════════════════════════════════
 * MEDIÇÃO DO SITE (Studio Need)
 *
 * O `sn-track.js` conta sozinho: pageview, clique em botão e envio de formulário. Não
 * precisa de marcação para funcionar — mas NESTE site, sem marcação, ele mede quase nada
 * do que interessa. Três motivos concretos, todos verificados no HTML das páginas:
 *
 * 1. NÃO EXISTE UM ÚNICO LINK `wa.me` NO SITE. O ícone de WhatsApp é
 *    `<a class="elementor-icon elementor-social-icon-whatsapp" href="#elementor-action…">`,
 *    que abre um popup do Elementor. O tracker reconhece a INTENÇÃO pelo href (`wa.me`,
 *    `tel:`, `mailto:`) e, na falta dela, só mede o que parece botão — a regra de classe
 *    procura `btn|button|cta|acao|action`, e "elementor-icon" não tem nenhuma delas. O
 *    clique mais importante do site cairia fora da conta, e o relatório diria "zero
 *    WhatsApp" parecendo um dado em vez de um furo.
 *
 * 2. O FORMULÁRIO DO IBEXGO NÃO TEM `name` NEM `id` — é só `<form class="ibxgo-form">`.
 *    O rótulo do envio sai de `data-sn-track`, depois `name`, depois `id`; sem os três,
 *    o evento chega sem rótulo e os dois formulários do site viram a mesma linha.
 *
 * 3. O POPUP NÃO ESTÁ NO HTML DA PÁGINA. O Elementor carrega o conteúdo dele depois, por
 *    AJAX. Marcar tudo uma vez no `DOMContentLoaded` não alcançaria o que ainda não
 *    existe — por isso a marcação aqui é feita NA HORA DO EVENTO, e não na carga.
 *
 * ── POR QUE ISTO FUNCIONA SEM TOCAR NO TRACKER ──────────────────────────────────────
 *
 * O `sn-track.js` entra com `defer`: ele só executa depois que a página terminou de ser
 * lida. O trecho abaixo é inline, então roda ANTES dele e registra seus ouvintes de
 * `click` e `submit` primeiro. Ouvintes na mesma fase são chamados na ordem em que foram
 * registrados — então, quando o tracker olha o elemento, o `data-sn-track` já está lá.
 * É essa ordem que faz a marcação just-in-time funcionar; ela não é acidental.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * A chave do site. Ela é PÚBLICA por natureza — vai no código-fonte de toda página, à
 * vista de qualquer visitante. Não é segredo e não se trata como tal (diferente do
 * IMIGRAR_CAPTURE_TOKEN, esse sim fora deste arquivo). Fica como constante só para poder
 * ser trocada pelo `wp-config.php` sem reeditar o plugin.
 */
if (!defined('IMIGRAR_SN_KEY')) {
    define('IMIGRAR_SN_KEY', 'snk_otITHbs1z8VjDJ9thF5NL1Ut3gocSIKt');
}
if (!defined('IMIGRAR_SN_SRC')) {
    define('IMIGRAR_SN_SRC', 'https://app.studioneed.com.br/sn-track.js');
}

/**
 * QUEM TRABALHA AQUI NÃO É VISITA.
 *
 * Sem isto, cada vez que alguém do escritório abre o site para conferir um texto, a
 * métrica ganha um pageview e os cliques de teste entram no ranking. Num site com pouco
 * movimento — que é o caso — isso não é ruído: é a maior parte do número.
 *
 * O efeito colateral tem de ser lembrado na hora de conferir a instalação: logado, você
 * NÃO se vê na medição. Confira numa janela anônima.
 */
function imigrar_mede_este_visitante() {
    if (is_admin()) { return false; }
    if (is_user_logged_in() && current_user_can('edit_posts')) { return false; }
    return true;
}

/** A marcação, impressa ANTES do tracker — ver o bloco acima. */
add_action('wp_footer', function () {
    if (!imigrar_mede_este_visitante()) { return; }
    ?>
<script>
/* Imigrar Brasil — rótulos da medição. Roda antes do sn-track.js (que é `defer`). */
(function () {
  "use strict";
  try {
    // Seletor → rótulo. O que NÃO está aqui continua sendo medido pelas regras próprias
    // do tracker; esta lista existe só para o que ele não teria como adivinhar.
    var ALVOS = [
      // Os dois formulários do site, com nomes que se distinguem no relatório.
      ["form.ibxgo-form", "atendimento-online"],
      ["form.elementor-form[name='Contato']", "fale-conosco"],
      // O ícone que abre o popup do WhatsApp. É o clique que a pergunta "quantas pessoas
      // foram para o WhatsApp?" quer contar, e o único que o tracker não pega sozinho.
      [".elementor-social-icon-whatsapp", "whatsapp"]
    ];

    function marcar(no) {
      if (!no || no.nodeType !== 1 || !no.matches) { return; }
      if (no.getAttribute("data-sn-track")) { return; }
      for (var i = 0; i < ALVOS.length; i++) {
        try {
          if (no.matches(ALVOS[i][0])) { no.setAttribute("data-sn-track", ALVOS[i][1]); return; }
        } catch (e) {}
      }
    }

    // Subir a partir do alvo: o clique acontece no <svg> dentro do <a>, nunca no <a>.
    // O teto de 12 saltos é o mesmo do tracker, pela mesma razão.
    document.addEventListener("click", function (evento) {
      try {
        var no = evento.target, saltos = 0;
        while (no && no.nodeType === 1 && saltos++ < 12) { marcar(no); no = no.parentNode; }
      } catch (e) {}
    }, true);

    document.addEventListener("submit", function (evento) {
      try { marcar(evento.target); } catch (e) {}
    }, true);
  } catch (e) {
    // Medição nunca pode quebrar o site.
  }
})();
</script>
    <?php
}, 98);

/** O tracker. Prioridade maior que a da marcação: ele precisa vir depois. */
add_action('wp_footer', function () {
    if (!imigrar_mede_este_visitante()) { return; }
    if (!IMIGRAR_SN_KEY || !IMIGRAR_SN_SRC) { return; }
    printf(
        '<!-- Studio Need — medição do site -->' . "\n" . '<script defer src="%s" data-sn-key="%s"></script>' . "\n",
        esc_url(IMIGRAR_SN_SRC),
        esc_attr(IMIGRAR_SN_KEY)
    );
}, 99);

/* ═══════════════════════════════════════════════════════════════════════════════════
 * OS REGISTROS DO WORDPRESS, NO CRM, NA HORA
 *
 * O site guarda leads em tipos de conteúdo próprios — "Orçamentos" e o que criarem
 * depois — que só existem dentro do wp-admin. Nenhum aparece na REST pública, o que está
 * certo, e é por isso que não há como buscá-los de fora. Então o sentido se inverte: aqui
 * é o WordPress que EMPURRA cada registro assim que ele é salvo.
 *
 * ── O PLUGIN NÃO ESCOLHE NADA ─────────────────────────────────────────────────────
 *
 * Manda o dicionário CRU: todos os campos do registro, com os nomes que o ACF usa aqui.
 * Não é preguiça — é a única forma que não quebra. Se este arquivo decidisse o que é nome
 * e o que é telefone, ele precisaria conhecer a lista de campos do CRM, e seriam duas
 * listas em dois servidores divergindo em silêncio na primeira vez que uma mudasse.
 *
 * Quem interpreta é o CRM, com as mesmas regras da importação de planilha, que já estão
 * testadas. Campo novo criado no ACF passa a ser entendido sem ninguém tocar neste
 * arquivo — e é esse o ponto.
 *
 * ── POR QUE NO `shutdown`, E NÃO DENTRO DO `save_post` ────────────────────────────
 *
 * Duas razões, e a segunda é a que importa. A primeira: quem salvou está esperando a tela
 * voltar, e uma chamada a outro servidor no meio disso é o editor travado.
 *
 * A segunda: NEM TODO CAMPO JÁ FOI GRAVADO QUANDO O `save_post` DISPARA. O ACF grava os
 * campos dele durante o mesmo pedido, e um plugin que cria o registro por código costuma
 * escrever a meta DEPOIS do `wp_insert_post`. Enviar de dentro do `save_post` mandaria um
 * registro pela metade — com o telefone faltando, que é justamente o campo sem o qual o
 * caso é descartado. No `shutdown` tudo o que aquele pedido ia gravar já está gravado.
 *
 * De quebra, resolve o salvamento que dispara `save_post` várias vezes no mesmo pedido:
 * a lista é por ID, então sai um envio só.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/** Para onde vai cada registro. */
if (!defined('IMIGRAR_DESTINO_REGISTRO')) {
    define('IMIGRAR_DESTINO_REGISTRO', 'https://agente.imigrarbrasil.com.br/api/captura/registro');
}

/** Quais tipos de conteúdo sobem para o CRM. Escolhido em Ferramentas → Integração com o CRM. */
const IMIGRAR_OPCAO_TIPOS = 'imigrar_tipos_no_crm';

function imigrar_tipos_no_crm() {
    $tipos = get_option(IMIGRAR_OPCAO_TIPOS, array());
    return is_array($tipos) ? $tipos : array();
}

/**
 * TUDO O QUE O REGISTRO TEM, sem escolher.
 *
 * Chaves começadas com `_` ficam de fora: são a contabilidade interna do WordPress e do
 * ACF (cada campo tem uma gêmea `_campo` com a referência da definição), e mandá-las
 * dobraria o corpo com lixo que o outro lado ia ter que ignorar.
 */
function imigrar_campos_do_post($post) {
    $campos = array('Título' => $post->post_title, 'Data' => $post->post_date);
    foreach (get_post_meta($post->ID) as $chave => $valores) {
        if (strpos($chave, '_') === 0) { continue; }
        $v = maybe_unserialize($valores[0]);
        if (is_array($v)) { $v = implode(' | ', array_map('strval', $v)); }
        if (is_scalar($v) || $v === null) { $campos[$chave] = (string) $v; }
    }
    return $campos;
}

/**
 * Manda um registro. Devolve o `desfecho` que o CRM respondeu, ou null se não chegou lá.
 *
 * Reenviar É ESPERADO e não duplica: o CRM identifica o registro pelo par
 * (fonte, id) e atualiza. Editar um orçamento no WordPress dez vezes dá um card só.
 */
function imigrar_enviar_registro($post) {
    if (!defined('IMIGRAR_CAPTURE_TOKEN') || !IMIGRAR_CAPTURE_TOKEN) {
        error_log('[imigrar-captura] IMIGRAR_CAPTURE_TOKEN não está definido no wp-config.php — ' .
            'o registro #' . $post->ID . ' não foi ao CRM.');
        return null;
    }

    $corpo = array(
        // A FONTE PRECISA SER ESTÁVEL: junto com o id, ela É a identidade do registro.
        // Mudar esta string depois faria todos os registros daquele tipo parecerem novos.
        'fonte'     => 'wordpress:' . $post->post_type,
        'idExterno' => (string) $post->ID,
        'campos'    => imigrar_campos_do_post($post),
    );

    $resposta = wp_remote_post(IMIGRAR_DESTINO_REGISTRO, array(
        'timeout'  => 15,
        'blocking' => true, // É a resposta que diz se o registro entrou.
        'headers'  => array(
            'Content-Type'    => 'application/json; charset=utf-8',
            'X-Imigrar-Token' => IMIGRAR_CAPTURE_TOKEN,
        ),
        'body' => wp_json_encode($corpo),
    ));

    if (is_wp_error($resposta)) {
        error_log('[imigrar-captura] registro #' . $post->ID . ' não alcançou o CRM: ' .
            $resposta->get_error_message());
        return null;
    }
    $codigo = (int) wp_remote_retrieve_response_code($resposta);
    $texto  = (string) wp_remote_retrieve_body($resposta);
    if ($codigo < 200 || $codigo >= 300) {
        error_log('[imigrar-captura] o CRM recusou o registro #' . $post->ID .
            ' (HTTP ' . $codigo . '): ' . substr($texto, 0, 300));
        return null;
    }
    $json = json_decode($texto, true);
    return is_array($json) && isset($json['desfecho']) ? $json['desfecho'] : 'ok';
}

/** Marca para enviar no fim do pedido. Ver o bloco de comentário acima. */
add_action('save_post', function ($post_id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) { return; }
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) { return; }
    if (!in_array($post->post_type, imigrar_tipos_no_crm(), true)) { return; }
    // Rascunho automático e lixeira não são lead de ninguém.
    if (in_array($post->post_status, array('auto-draft', 'trash', 'inherit'), true)) { return; }

    if (!isset($GLOBALS['imigrar_registros_pendentes'])) {
        $GLOBALS['imigrar_registros_pendentes'] = array();
    }
    $GLOBALS['imigrar_registros_pendentes'][$post_id] = true;
}, 99, 2);

add_action('shutdown', function () {
    $pendentes = $GLOBALS['imigrar_registros_pendentes'] ?? array();
    if (!$pendentes) { return; }
    $GLOBALS['imigrar_registros_pendentes'] = array();

    imigrar_encerrar_resposta();

    foreach (array_keys($pendentes) as $id) {
        // Relido AGORA, não no `save_post`: é aqui que toda a meta do pedido já existe.
        $post = get_post($id);
        if ($post) { imigrar_enviar_registro($post); }
    }
}, 2);

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A TELA — ESCOLHER OS TIPOS E TRAZER O QUE JÁ EXISTE
 *
 * O gancho acima só alcança o que for salvo DAQUI PARA A FRENTE. Os orçamentos que já
 * estão no site nunca vão ser salvos de novo, e ficariam de fora para sempre — por isso o
 * botão "Enviar todos agora", que passa pelo mesmo caminho e pela mesma deduplicação.
 * Apertar duas vezes não duplica nada.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

add_action('admin_menu', function () {
    add_management_page(
        'Integração com o CRM',
        'Integração com o CRM',
        'manage_options',
        'imigrar-crm',
        'imigrar_tela_do_crm'
    );
});

function imigrar_tela_do_crm() {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }

    // Só os tipos criados por plugin/tema: post e página não são lead de ninguém.
    $tipos = get_post_types(array('_builtin' => false), 'objects');
    $ligados = imigrar_tipos_no_crm();

    echo '<div class="wrap"><h1>Integração com o CRM</h1>';

    if (!defined('IMIGRAR_CAPTURE_TOKEN') || !IMIGRAR_CAPTURE_TOKEN) {
        echo '<div class="notice notice-error"><p><strong>Falta a constante <code>IMIGRAR_CAPTURE_TOKEN</code> no <code>wp-config.php</code>.</strong> ' .
             'Sem ela nada é enviado ao CRM.</p></div>';
    }

    if (empty($tipos)) {
        echo '<p>Nenhum tipo de conteúdo personalizado neste site.</p></div>';
        return;
    }

    echo '<p>Os tipos marcados sobem para o CRM <strong>no momento em que são salvos</strong>. ' .
         'Salvar o mesmo registro de novo <strong>atualiza</strong> o caso; não cria outro.</p>';

    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="imigrar_salvar_tipos">';
    wp_nonce_field('imigrar_crm');
    echo '<table class="widefat striped" style="max-width:820px"><thead><tr>' .
         '<th>Enviar ao CRM</th><th>Tipo de conteúdo</th><th>Registros</th><th>Trazer os que já existem</th>' .
         '</tr></thead><tbody>';

    foreach ($tipos as $t) {
        $contagem = wp_count_posts($t->name);
        $qtd = (int) ($contagem->publish ?? 0) + (int) ($contagem->draft ?? 0) + (int) ($contagem->private ?? 0);
        printf(
            '<tr><td><input type="checkbox" name="tipos[]" value="%1$s" %2$s></td>' .
            '<td><strong>%3$s</strong><br><code>%1$s</code></td><td>%4$d</td>' .
            '<td><a class="button" href="%5$s">Enviar todos agora</a></td></tr>',
            esc_attr($t->name),
            checked(in_array($t->name, $ligados, true), true, false),
            esc_html($t->labels->name),
            $qtd,
            esc_url(wp_nonce_url(
                admin_url('admin-post.php?action=imigrar_enviar_tudo&tipo=' . urlencode($t->name)),
                'imigrar_crm'
            ))
        );
    }
    echo '</tbody></table>';
    submit_button('Salvar');
    echo '</form>';

    echo '<hr><h2>Exportar para conferir</h2>';
    echo '<p>Gera o mesmo conteúdo em <code>.csv</code>, para olhar os campos antes de enviar. ' .
         'Não é necessário para a integração.</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="imigrar_exportar_cpt">';
    wp_nonce_field('imigrar_exportar');
    echo '<select name="tipo">';
    foreach ($tipos as $t) {
        printf('<option value="%s">%s</option>', esc_attr($t->name), esc_html($t->labels->name));
    }
    echo '</select> ';
    submit_button('Baixar CSV', 'secondary', 'submit', false);
    echo '</form></div>';
}

add_action('admin_post_imigrar_salvar_tipos', function () {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }
    check_admin_referer('imigrar_crm');

    $escolhidos = array();
    foreach ((array) ($_POST['tipos'] ?? array()) as $t) {
        $t = sanitize_key($t);
        if ($t && post_type_exists($t)) { $escolhidos[] = $t; }
    }
    update_option(IMIGRAR_OPCAO_TIPOS, $escolhidos);
    wp_safe_redirect(add_query_arg('imigrar', 'salvo', admin_url('tools.php?page=imigrar-crm')));
    exit;
});

add_action('admin_post_imigrar_enviar_tudo', function () {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }
    check_admin_referer('imigrar_crm');

    $tipo = sanitize_key($_GET['tipo'] ?? '');
    if (!$tipo || !post_type_exists($tipo)) { wp_die('Tipo de conteúdo inválido.'); }

    $posts = get_posts(array(
        'post_type'   => $tipo,
        'post_status' => array('publish', 'draft', 'pending', 'private', 'future'),
        'numberposts' => -1,
        'orderby'     => 'date',
        'order'       => 'ASC',
    ));

    // Sem limite de tempo: são chamadas a outro servidor, uma por registro, e o padrão do
    // PHP derruba isso no meio — deixando metade enviada sem ninguém saber onde parou.
    // Reenviar é seguro (o CRM atualiza em vez de duplicar), então reapertar o botão
    // termina o serviço de onde parou.
    @set_time_limit(0);

    $contagem = array();
    foreach ($posts as $post) {
        $d = imigrar_enviar_registro($post);
        $chave = $d === null ? 'falhou' : $d;
        $contagem[$chave] = ($contagem[$chave] ?? 0) + 1;
    }

    $resumo = array();
    foreach ($contagem as $k => $v) { $resumo[] = $v . ' ' . $k; }
    wp_safe_redirect(add_query_arg(
        array('imigrar' => 'enviado', 'resumo' => rawurlencode(implode(', ', $resumo))),
        admin_url('tools.php?page=imigrar-crm')
    ));
    exit;
});

add_action('admin_notices', function () {
    if (($_GET['page'] ?? '') !== 'imigrar-crm') { return; }
    $q = $_GET['imigrar'] ?? '';
    if ($q === 'salvo') {
        echo '<div class="notice notice-success is-dismissible"><p>Tipos salvos.</p></div>';
    } elseif ($q === 'enviado') {
        printf(
            '<div class="notice notice-success is-dismissible"><p>Enviado ao CRM: %s.</p></div>',
            esc_html(rawurldecode((string) ($_GET['resumo'] ?? '')))
        );
    }
});

add_action('admin_post_imigrar_exportar_cpt', function () {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }
    check_admin_referer('imigrar_exportar');

    $tipo = sanitize_key($_POST['tipo'] ?? '');
    if (!$tipo || !post_type_exists($tipo)) { wp_die('Tipo de conteúdo inválido.'); }

    $posts = get_posts(array(
        'post_type'   => $tipo,
        'post_status' => array('publish', 'draft', 'pending', 'private', 'future'),
        'numberposts' => -1,
        'orderby'     => 'date',
        'order'       => 'ASC',
    ));

    // Primeira passada: descobrir quais colunas existem. Um registro antigo pode ter um
    // campo que os novos não têm, e o contrário também — a união cobre os dois.
    $linhas = array();
    $chaves = array();
    foreach ($posts as $post) {
        $meta = array();
        foreach (get_post_meta($post->ID) as $chave => $valores) {
            if (strpos($chave, '_') === 0) { continue; }
            $v = maybe_unserialize($valores[0]);
            if (is_array($v)) { $v = implode(' | ', array_map('strval', $v)); }
            $meta[$chave] = (string) $v;
            $chaves[$chave] = true;
        }
        $linhas[] = array('post' => $post, 'meta' => $meta);
    }
    $chaves = array_keys($chaves);
    sort($chaves);

    // Nome FIXO — ver o bloco de comentário acima. A data aqui quebraria a deduplicação.
    $arquivo = 'wordpress-' . $tipo . '.csv';

    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $arquivo . '"');

    $saida = fopen('php://output', 'w');
    // BOM: sem ele o Excel abre "Cássio" como "CÃ¡ssio". O leitor do CRM o descarta.
    fwrite($saida, "\xEF\xBB\xBF");

    // "ID" é a coluna que a importação reconhece como identificador da linha; é ela que
    // faz reimportar atualizar. "Situação (WordPress)" é nomeada assim de propósito, para
    // NÃO ser confundida com a etapa do funil no mapeamento automático.
    fputcsv($saida, array_merge(array('ID', 'Título', 'Data', 'Situação (WordPress)'), $chaves));

    foreach ($linhas as $l) {
        $base = array(
            $l['post']->ID,
            $l['post']->post_title,
            get_the_date('Y-m-d H:i', $l['post']),
            $l['post']->post_status,
        );
        foreach ($chaves as $chave) { $base[] = $l['meta'][$chave] ?? ''; }
        fputcsv($saida, $base);
    }
    fclose($saida);
    exit;
});
