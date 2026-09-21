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
 * EXPORTAR UM TIPO DE CONTEÚDO PARA O CRM
 *
 * O WordPress deste site guarda leads em tipos próprios (`orcamento`, e possivelmente
 * outros) que só existem dentro do wp-admin. Nenhum deles aparece na REST pública — o que
 * está certo, e é justamente por isso que não há como trazê-los de fora.
 *
 * Esta tela fecha o caminho: gera o CSV que a tela "Importar planilha" do painel já sabe
 * ler, com o mapeamento de colunas e a deduplicação que já existem lá. Nada de novo do
 * lado do CRM.
 *
 * ── AS COLUNAS SAEM DO CONTEÚDO, NÃO DE UMA LISTA ESCRITA AQUI ────────────────────
 *
 * Não sabemos que campos esses registros têm: são campos do ACF, criados na mão de quem
 * montou o site. Escrever a lista aqui seria adivinhar, e um campo esquecido é um dado
 * que some sem aviso. Então as colunas são a UNIÃO das chaves de meta encontradas nos
 * próprios registros, e quem decide o que é o quê é a tela de importação.
 *
 * Chaves começadas com `_` ficam de fora: são a contabilidade interna do WordPress e do
 * ACF (cada campo tem uma chave gêmea `_campo` com a referência da definição), e trazê-las
 * dobraria as colunas com lixo.
 *
 * ── POR QUE O NOME DO ARQUIVO NÃO TEM DATA ────────────────────────────────────────
 *
 * Do lado do CRM, a "fonte externa" de cada linha é o NOME DO ARQUIVO importado
 * (`app/api/importacao/route.ts`). É o par fonte + ID que faz reimportar ATUALIZAR em vez
 * de duplicar. Um nome com a data mudaria a cada exportação, a chave nunca casaria com a
 * anterior e a segunda importação criaria tudo de novo — exatamente o que não pode
 * acontecer. O nome é fixo de propósito.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

add_action('admin_menu', function () {
    add_management_page(
        'Exportar para o CRM',
        'Exportar para o CRM',
        'manage_options',
        'imigrar-exportar',
        'imigrar_tela_de_exportacao'
    );
});

function imigrar_tela_de_exportacao() {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }

    // Só os tipos criados por plugin/tema: post e página não são lead de ninguém.
    $tipos = get_post_types(array('_builtin' => false), 'objects');
    echo '<div class="wrap"><h1>Exportar para o CRM</h1>';
    echo '<p>Gera o arquivo <code>.csv</code> que a tela <strong>Importar planilha</strong> do painel lê. ' .
         'Reimportar o mesmo tipo <strong>atualiza</strong> os registros em vez de duplicar, desde que o nome do arquivo não seja alterado.</p>';

    if (empty($tipos)) {
        echo '<p>Nenhum tipo de conteúdo personalizado neste site.</p></div>';
        return;
    }

    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="imigrar_exportar_cpt">';
    wp_nonce_field('imigrar_exportar');
    echo '<table class="form-table"><tr><th scope="row"><label for="tipo">Tipo de conteúdo</label></th><td><select name="tipo" id="tipo">';
    foreach ($tipos as $t) {
        $qtd = (int) wp_count_posts($t->name)->publish + (int) wp_count_posts($t->name)->draft;
        printf(
            '<option value="%s">%s (%s) — %d registro(s)</option>',
            esc_attr($t->name),
            esc_html($t->labels->name),
            esc_html($t->name),
            $qtd
        );
    }
    echo '</select></td></tr></table>';
    submit_button('Baixar CSV');
    echo '</form></div>';
}

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
