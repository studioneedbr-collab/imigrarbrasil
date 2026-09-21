<?php
/**
 * Plugin Name: Imigrar Brasil — integração com o CRM
 * Description: Leva ao CRM os leads do site (formulários e tipos de conteúdo) e instala a medição do Studio Need. Painel em "Imigrar CRM".
 * Version: 1.1.0
 * Author: Studio Need
 * Requires at least: 5.6
 * Requires PHP: 7.0
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
 * ── PLUGIN NORMAL, E NÃO MU-PLUGIN: A TROCA ───────────────────────────────────────
 *
 * Isto nasceu como mu-plugin, que é um arquivo solto em `wp-content/mu-plugins/`. Aquilo
 * tinha uma vantagem real: carrega SEMPRE, não aparece na lista para alguém desativar por
 * engano e nenhuma atualização o apaga.
 *
 * Só que mu-plugin NÃO INSTALA POR ZIP. Não existe essa porta no wp-admin — é FTP ou
 * gerenciador de arquivos da hospedagem, toda vez, inclusive para corrigir uma linha. Na
 * prática isso significa que a correção não sobe, e um plugin que ninguém consegue
 * atualizar é pior do que um que alguém pode desativar sem querer.
 *
 * Então: plugin normal. O risco que isso traz — ser desativado e o lead parar de chegar
 * em silêncio — é respondido pelo painel: ele mostra o estado de cada função e a lista dos
 * últimos envios, que é onde "parou de chegar" aparece antes de o cliente reclamar.
 *
 * ── POR QUE NÃO MEXEMOS NO PLUGIN DO FORMULÁRIO ───────────────────────────────────
 *
 * `rest_request_after_callbacks` roda DEPOIS que o endpoint do ibexgo já respondeu, e é
 * WordPress puro. Editar o plugin resolveria hoje e seria revertido na próxima
 * atualização dele. Aqui nada do ibexgo é tocado — se um dia ele mudar de nome de campo,
 * este arquivo para de achar o que mandar e registra no painel, em vez de quebrar o site.
 *
 * ── INSTALAÇÃO ────────────────────────────────────────────────────────────────────
 *
 * Plugins → Adicionar novo → Enviar plugin → `imigrar-crm.zip` → Ativar.
 * Depois, no menu "Imigrar CRM", cole o token e ligue as origens.
 */

if (!defined('ABSPATH')) { exit; }

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O SEGREDO, E O REGISTRO DO QUE ACONTECEU
 * ═══════════════════════════════════════════════════════════════════════════════════ */

const IMIGRAR_OPCAO_TOKEN = 'imigrar_token_do_crm';
const IMIGRAR_OPCAO_LOG   = 'imigrar_ultimos_envios';
const IMIGRAR_LOG_MAX     = 50;

/**
 * O TOKEN, DE ONDE ELE ESTIVER.
 *
 * A constante no `wp-config.php` VENCE quando existe: é o lugar mais seguro, fora do banco
 * e fora do alcance de qualquer tela. Mas exigir que ela exista significava FTP na
 * instalação — e um plugin que só instala com FTP é um plugin que não é atualizado quando
 * precisa. Então o campo do painel é o caminho normal, e a constante continua valendo para
 * quem quiser tirá-lo do banco.
 *
 * Nos dois casos o segredo é legível por quem administra o site; a diferença real é que
 * o do banco aparece num dump e o da constante não. É uma troca, não um descuido.
 */
function imigrar_token() {
    if (defined('IMIGRAR_CAPTURE_TOKEN') && IMIGRAR_CAPTURE_TOKEN) {
        return (string) IMIGRAR_CAPTURE_TOKEN;
    }
    return (string) get_option(IMIGRAR_OPCAO_TOKEN, '');
}

/** De onde veio o token, para o painel poder dizer. */
function imigrar_origem_do_token() {
    if (defined('IMIGRAR_CAPTURE_TOKEN') && IMIGRAR_CAPTURE_TOKEN) { return 'wp-config.php'; }
    return get_option(IMIGRAR_OPCAO_TOKEN) ? 'painel' : '';
}

/**
 * O DIÁRIO DOS ÚLTIMOS ENVIOS.
 *
 * `error_log()` continua sendo escrito, mas em hospedagem compartilhada quase ninguém
 * alcança esse arquivo — e um erro que só existe num log inalcançável é um erro que
 * ninguém vai ver. Esta lista fica no painel, onde a pergunta de verdade ("o lead de
 * ontem chegou?") é feita.
 *
 * Últimos 50, e só. Não é auditoria: é o suficiente para responder "está funcionando?" e
 * "por que aquele não entrou?", sem virar uma tabela que cresce para sempre num site que
 * ninguém administra.
 */
function imigrar_anotar($origem, $desfecho, $detalhe = '') {
    $log = get_option(IMIGRAR_OPCAO_LOG, array());
    if (!is_array($log)) { $log = array(); }
    array_unshift($log, array(
        'quando'   => current_time('mysql'),
        'origem'   => (string) $origem,
        'desfecho' => (string) $desfecho,
        // mbstring não é garantida em toda hospedagem, e `substr` cortaria um caractere
        // acentuado ao meio — o detalhe viraria lixo justamente na linha de erro.
        'detalhe'  => function_exists('mb_substr')
            ? mb_substr((string) $detalhe, 0, 200)
            : substr((string) $detalhe, 0, 200),
    ));
    update_option(IMIGRAR_OPCAO_LOG, array_slice($log, 0, IMIGRAR_LOG_MAX), false);
}

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

    if (!imigrar_token()) {
        error_log('[imigrar-captura] sem token configurado — ' .
            'o lead de "' . $lead['nome'] . '" ficou só no WordPress.');
        return;
    }

    $corpo = array_filter($lead, static function ($v) { return $v !== '' && $v !== null; });

    $resposta = wp_remote_post(IMIGRAR_DESTINO, array(
        'timeout'  => 8,
        'blocking' => true, // Precisamos LER a resposta: é ela que diz se o lead entrou.
        'headers'  => array(
            'Content-Type'    => 'application/json; charset=utf-8',
            'X-Imigrar-Token' => imigrar_token(),
        ),
        'body' => wp_json_encode($corpo),
    ));

    // O LOG É O ÚNICO LUGAR ONDE ISTO APARECE. A pessoa já foi embora para o WhatsApp e
    // ninguém está olhando a tela. Se o token estiver errado ou a rota fora do ar, é esta
    // linha no error_log do WordPress que responde "por que o lead não chegou no CRM".
    if (is_wp_error($resposta)) {
        error_log('[imigrar-captura] não alcançou o CRM: ' . $resposta->get_error_message());
        imigrar_anotar('formulário do topo', 'falhou', $resposta->get_error_message());
        return;
    }
    $codigo = (int) wp_remote_retrieve_response_code($resposta);
    if ($codigo < 200 || $codigo >= 300) {
        error_log('[imigrar-captura] o CRM recusou (HTTP ' . $codigo . '): ' .
            substr((string) wp_remote_retrieve_body($resposta), 0, 300));
        imigrar_anotar('formulário do topo', 'recusado', 'HTTP ' . $codigo . ' — ' .
            substr((string) wp_remote_retrieve_body($resposta), 0, 160));
        return;
    }
    imigrar_anotar('formulário do topo', 'enviado', $lead['nome']);
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
function imigrar_enviar_ao_crm($fonte, $id_externo, $campos, $descricao) {
    if (!imigrar_token()) {
        error_log('[imigrar-captura] sem token configurado — ' . $descricao . ' não foi ao CRM.');
        imigrar_anotar($fonte, 'sem token', $descricao);
        return null;
    }

    $corpo = array(
        // A FONTE PRECISA SER ESTÁVEL: junto com o id, ela É a identidade do registro.
        // Mudar esta string depois faria todos os registros daquela origem parecerem novos.
        'fonte'  => $fonte,
        'campos' => $campos,
    );
    // Sem id, a identidade do outro lado passa a ser o telefone. É o certo para envio de
    // formulário, que não é um registro que alguém edita depois — ver o bloco do Elementor.
    if ($id_externo !== null && $id_externo !== '') { $corpo['idExterno'] = (string) $id_externo; }

    $resposta = wp_remote_post(IMIGRAR_DESTINO_REGISTRO, array(
        'timeout'  => 15,
        'blocking' => true, // É a resposta que diz se o caso entrou.
        'headers'  => array(
            'Content-Type'    => 'application/json; charset=utf-8',
            'X-Imigrar-Token' => imigrar_token(),
        ),
        'body' => wp_json_encode($corpo),
    ));

    if (is_wp_error($resposta)) {
        error_log('[imigrar-captura] ' . $descricao . ' não alcançou o CRM: ' .
            $resposta->get_error_message());
        imigrar_anotar($fonte, 'falhou', $descricao . ' — ' . $resposta->get_error_message());
        return null;
    }
    $codigo = (int) wp_remote_retrieve_response_code($resposta);
    $texto  = (string) wp_remote_retrieve_body($resposta);
    if ($codigo < 200 || $codigo >= 300) {
        error_log('[imigrar-captura] o CRM recusou ' . $descricao .
            ' (HTTP ' . $codigo . '): ' . substr($texto, 0, 300));
        imigrar_anotar($fonte, 'recusado', 'HTTP ' . $codigo . ' — ' . substr($texto, 0, 160));
        return null;
    }
    $json = json_decode($texto, true);
    $desfecho = is_array($json) && isset($json['desfecho']) ? $json['desfecho'] : 'ok';
    imigrar_anotar($fonte, $desfecho, is_array($json) ? (string) ($json['nome'] ?? $json['detalhe'] ?? '') : '');
    return $desfecho;
}

/**
 * Manda um registro de um tipo de conteúdo. Devolve o `desfecho` do CRM, ou null se não
 * chegou lá.
 *
 * Reenviar É ESPERADO e não duplica: o CRM identifica o registro pelo par (fonte, id) e
 * atualiza. Editar um orçamento no WordPress dez vezes dá um card só.
 */
function imigrar_enviar_registro($post) {
    return imigrar_enviar_ao_crm(
        'wordpress:' . $post->post_type,
        $post->ID,
        imigrar_campos_do_post($post),
        'o registro #' . $post->ID
    );
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
 * OS FORMULÁRIOS DO ELEMENTOR
 *
 * O `/fale-conosco/` tem DOIS formulários: o do `ibexgo` (nome e WhatsApp) e um do
 * Elementor chamado "Contato", com nome, telefone, e-mail e mensagem. O do Elementor é o
 * único do site com campo de MENSAGEM — é o que faz a triagem funcionar já na porta:
 * nacionalidade, onde a pessoa está e sinal de prazo chegam preenchidos na ficha em vez de
 * a Ana ter que perguntar tudo.
 *
 * Ele não passava por nenhum dos dois ganchos que já existiam aqui. O `ibexgo` tem rota
 * REST própria; os tipos de conteúdo passam pelo `save_post`. O Elementor não faz nem um
 * nem outro: envia por `admin-ajax` e não cria post nenhum. Sem este gancho, esse
 * formulário ia para onde quer que as ações dele mandem — e não para a fila.
 *
 * ── SEM ID, DE PROPÓSITO ──────────────────────────────────────────────────────────
 *
 * Um envio de formulário NÃO É UM REGISTRO que alguém edita depois; é um acontecimento.
 * Não existe id estável para ele, e inventar um (um hash do corpo, um carimbo de tempo)
 * seria pior do que não ter: um id que muda a cada envio faz a mesma pessoa preenchendo
 * duas vezes virar dois casos — exatamente o contrário do que ele serviria para garantir.
 *
 * Então vai sem `idExterno`, e a identidade fica sendo o telefone, com as variantes do
 * nono dígito. É a mesma chave do webhook do WhatsApp: quem preenche o formulário e depois
 * escreve no WhatsApp é um card só.
 *
 * ── OS RÓTULOS, NÃO OS IDs ────────────────────────────────────────────────────────
 *
 * `get_formatted_data()` devolve o formulário com os RÓTULOS que a pessoa viu na tela
 * ("Seu Nome", "Whatsapp", "Mensagem"). Os ids internos do Elementor são coisas como
 * `field_a1b2c3`, que não dizem nada a ninguém — nem a quem for ler a ficha, nem ao CRM,
 * que reconhece os campos pelo nome. O rótulo é o que tem significado dos dois lados.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/** Ligado em Ferramentas → Integração com o CRM. Nasce desligado: mandar lead é ato deliberado. */
const IMIGRAR_OPCAO_ELEMENTOR = 'imigrar_elementor_no_crm';

add_action('elementor_pro/forms/new_record', function ($record, $handler) {
    try {
        if (!get_option(IMIGRAR_OPCAO_ELEMENTOR)) { return; }

        $campos = array();
        foreach ((array) $record->get_formatted_data() as $rotulo => $valor) {
            if (is_array($valor)) { $valor = implode(' | ', array_map('strval', $valor)); }
            if (is_scalar($valor) || $valor === null) { $campos[(string) $rotulo] = (string) $valor; }
        }
        if (!$campos) { return; }

        $ajustes = (array) $record->get('form_settings');
        $nome = $ajustes['form_name'] ?? 'formulário';

        if (!isset($GLOBALS['imigrar_formularios_pendentes'])) {
            $GLOBALS['imigrar_formularios_pendentes'] = array();
        }
        $GLOBALS['imigrar_formularios_pendentes'][] = array(
            'fonte'  => 'elementor:' . $nome,
            'campos' => $campos,
        );
    } catch (Throwable $e) {
        // O envio ao CRM nunca pode impedir o formulário do site de funcionar.
        error_log('[imigrar-captura] falha ao ler o formulário do Elementor: ' . $e->getMessage());
    }
}, 20, 2);

add_action('shutdown', function () {
    $pendentes = $GLOBALS['imigrar_formularios_pendentes'] ?? array();
    if (!$pendentes) { return; }
    $GLOBALS['imigrar_formularios_pendentes'] = array();

    // A pessoa já viu "enviado com sucesso"; a conversa com o CRM corre depois.
    imigrar_encerrar_resposta();

    foreach ($pendentes as $envio) {
        imigrar_enviar_ao_crm($envio['fonte'], null, $envio['campos'], 'formulário');
    }
}, 3);

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A TELA — ESCOLHER OS TIPOS E TRAZER O QUE JÁ EXISTE
 *
 * O gancho acima só alcança o que for salvo DAQUI PARA A FRENTE. Os orçamentos que já
 * estão no site nunca vão ser salvos de novo, e ficariam de fora para sempre — por isso o
 * botão "Enviar todos agora", que passa pelo mesmo caminho e pela mesma deduplicação.
 * Apertar duas vezes não duplica nada.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
add_action('admin_menu', function () {
    add_menu_page(
        'Imigrar CRM',
        'Imigrar CRM',
        'manage_options',
        'imigrar-crm',
        'imigrar_tela_do_crm',
        'dashicons-migrate',
        58
    );
});

/** Um cartão de estado: verde quando está de pé, vermelho quando não está. */
function imigrar_cartao($titulo, $ok, $texto) {
    printf(
        '<div style="flex:1;min-width:220px;border:1px solid #c3c4c7;border-left:4px solid %s;' .
        'background:#fff;padding:12px 16px;border-radius:4px">' .
        '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#646970">%s</div>' .
        '<div style="font-size:15px;margin-top:4px"><strong>%s</strong> %s</div></div>',
        $ok ? '#00a32a' : '#d63638',
        esc_html($titulo),
        $ok ? '✓' : '✕',
        esc_html($texto)
    );
}

/** Uma linha da tabela "o que este plugin faz". */
function imigrar_linha_de_funcao($nome, $ligada, $explicacao, $estado) {
    printf(
        '<tr><td style="white-space:nowrap"><span style="color:%s;font-weight:600">%s</span></td>' .
        '<td><strong>%s</strong><br><span class="description">%s</span></td>' .
        '<td style="white-space:nowrap">%s</td></tr>',
        $ligada ? '#00a32a' : '#8c8f94',
        $ligada ? '● ligada' : '○ desligada',
        esc_html($nome),
        esc_html($explicacao),
        esc_html($estado)
    );
}

function imigrar_tela_do_crm() {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }

    $tipos     = get_post_types(array('_builtin' => false), 'objects');
    $ligados   = imigrar_tipos_no_crm();
    $token     = imigrar_token();
    $de_onde   = imigrar_origem_do_token();
    $elementor = (bool) get_option(IMIGRAR_OPCAO_ELEMENTOR);
    $log       = (array) get_option(IMIGRAR_OPCAO_LOG, array());

    echo '<div class="wrap"><h1>Imigrar Brasil — integração com o CRM</h1>';
    echo '<p class="description" style="max-width:820px;font-size:14px">Este plugin leva ao CRM o que chega pelo site, ' .
         'e instala a medição. Ele <strong>nunca responde nada pelo WhatsApp</strong> — quem decide falar com a pessoa é uma pessoa, pelo painel do CRM.</p>';

    // ── ESTADO, ANTES DE QUALQUER AJUSTE ──────────────────────────────────────────
    //
    // É a primeira coisa da tela de propósito. A pergunta que traz alguém aqui quase
    // sempre é "está funcionando?", e ela tem que ser respondida sem rolar a página.
    echo '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:18px 0">';
    imigrar_cartao('Token do CRM', (bool) $token, $token ? 'configurado (' . $de_onde . ')' : 'não configurado');
    imigrar_cartao('Formulários', true, 'ouvindo o formulário do topo' . ($elementor ? ' e o Elementor' : ''));
    imigrar_cartao(
        'Tipos de conteúdo',
        !empty($ligados),
        $ligados ? implode(', ', $ligados) : 'nenhum ligado'
    );
    imigrar_cartao('Medição', (bool) IMIGRAR_SN_KEY, IMIGRAR_SN_KEY ? 'instalada no site' : 'sem chave');
    echo '</div>';

    if (!$token) {
        echo '<div class="notice notice-error"><p><strong>Sem o token, nada é enviado ao CRM.</strong> ' .
             'Cole-o no campo abaixo — é o mesmo valor de <code>SITE_CAPTURE_TOKEN</code> no Vercel.</p></div>';
    }

    // ── O QUE ELE FAZ ─────────────────────────────────────────────────────────────
    echo '<h2>O que este plugin faz</h2>';
    echo '<table class="widefat striped" style="max-width:940px"><thead><tr>' .
         '<th style="width:110px">Estado</th><th>Função</th><th>Identidade do caso</th></tr></thead><tbody>';
    imigrar_linha_de_funcao(
        'Formulário do topo (Atendimento Online)',
        true,
        'Pega quem preenche e NÃO completa o passo do WhatsApp — quem completa já chegava pelo webhook.',
        'telefone'
    );
    imigrar_linha_de_funcao(
        'Formulário Contato (Elementor)',
        $elementor,
        'O único formulário do site com campo de mensagem: a triagem lê o texto e a ficha já chega preenchida.',
        'telefone'
    );
    imigrar_linha_de_funcao(
        'Tipos de conteúdo (Orçamentos e afins)',
        !empty($ligados),
        'Sobem no momento em que são salvos. Salvar de novo atualiza o caso; não cria outro.',
        'tipo + ID do post'
    );
    imigrar_linha_de_funcao(
        'Medição do site (Studio Need)',
        (bool) IMIGRAR_SN_KEY,
        'Pageview, clique no WhatsApp e envio de formulário. Quem pode editar posts não é medido.',
        '—'
    );
    echo '</tbody></table>';

    // ── AJUSTES ───────────────────────────────────────────────────────────────────
    echo '<h2 style="margin-top:28px">Ajustes</h2>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="imigrar_salvar_tipos">';
    wp_nonce_field('imigrar_crm');

    echo '<table class="form-table"><tr><th scope="row"><label for="token">Token do CRM</label></th><td>';
    if ($de_onde === 'wp-config.php') {
        echo '<p><code>IMIGRAR_CAPTURE_TOKEN</code> está definido no <code>wp-config.php</code> e tem prioridade. ' .
             'Para mudá-lo, edite lá.</p>';
    } else {
        // Nunca devolvemos o segredo para a tela. Campo vazio = "não mexer".
        printf(
            '<input type="password" id="token" name="token" class="regular-text" autocomplete="off" placeholder="%s"> ' .
            '<p class="description">O mesmo valor de <code>SITE_CAPTURE_TOKEN</code> no Vercel. ' .
            'Deixe em branco para manter o atual.</p>',
            $token ? '•••••••••• (guardado)' : 'cole o token aqui'
        );
    }
    echo '</td></tr></table>';

    if (empty($tipos)) {
        echo '<p>Nenhum tipo de conteúdo personalizado neste site.</p>';
    } else {
        echo '<h3>Tipos de conteúdo que sobem ao CRM</h3>';
        echo '<table class="widefat striped" style="max-width:940px"><thead><tr>' .
             '<th style="width:90px">Enviar</th><th>Tipo</th><th style="width:100px">Registros</th>' .
             '<th style="width:190px">Trazer os que já existem</th></tr></thead><tbody>';
        foreach ($tipos as $t) {
            $c = wp_count_posts($t->name);
            $qtd = (int) ($c->publish ?? 0) + (int) ($c->draft ?? 0) + (int) ($c->private ?? 0);
            printf(
                '<tr><td><input type="checkbox" name="tipos[]" value="%1$s" %2$s></td>' .
                '<td><strong>%3$s</strong> <code>%1$s</code></td><td>%4$d</td>' .
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
        echo '<p class="description" style="max-width:940px">O gancho automático só alcança o que for salvo daqui para a frente. ' .
             '<strong>Enviar todos agora</strong> traz o que já existe, pelo mesmo caminho e com a mesma deduplicação — ' .
             'apertar duas vezes não duplica nada.</p>';
    }

    echo '<h3 style="margin-top:24px">Formulários do Elementor</h3>';
    echo '<p><label><input type="checkbox" name="elementor" value="1" ' .
         checked($elementor, true, false) . '> Enviar ao CRM os envios dos formulários do Elementor</label></p>';
    echo '<p class="description" style="max-width:940px">Inclui o <strong>Contato</strong> do Fale Conosco. ' .
         'Formulário <strong>sem telefone</strong> (uma newsletter, por exemplo) é descartado pelo CRM sem virar caso, ' .
         'então ligar isto não enche a fila de inscrição de e-mail.</p>';

    submit_button('Salvar');
    echo '</form>';

    // ── CONFERIR ──────────────────────────────────────────────────────────────────
    echo '<h2 style="margin-top:28px">Conferir</h2><p>';
    printf(
        '<a class="button button-secondary" href="%s">Testar conexão com o CRM</a> ',
        esc_url(wp_nonce_url(admin_url('admin-post.php?action=imigrar_testar'), 'imigrar_crm'))
    );
    echo '</p><p class="description" style="max-width:940px">Manda um registro de teste e mostra a resposta. ' .
         'Não cria caso: vai sem telefone de propósito, e o CRM descarta registro sem telefone.</p>';

    // ── ÚLTIMOS ENVIOS ────────────────────────────────────────────────────────────
    //
    // O `error_log` continua sendo escrito, mas em hospedagem compartilhada quase ninguém
    // alcança aquele arquivo. Esta lista é onde "o lead de ontem chegou?" é respondido.
    echo '<h2 style="margin-top:28px">Últimos envios</h2>';
    if (!$log) {
        echo '<p class="description">Nada ainda. Assim que um formulário for enviado ou um registro salvo, aparece aqui.</p>';
    } else {
        echo '<table class="widefat striped" style="max-width:940px"><thead><tr>' .
             '<th style="width:150px">Quando</th><th style="width:210px">Origem</th>' .
             '<th style="width:120px">Desfecho</th><th>Detalhe</th></tr></thead><tbody>';
        foreach ($log as $l) {
            $ruim = in_array($l['desfecho'] ?? '', array('falhou', 'recusado', 'sem token'), true);
            printf(
                '<tr><td>%s</td><td><code>%s</code></td><td style="color:%s"><strong>%s</strong></td><td>%s</td></tr>',
                esc_html($l['quando'] ?? ''),
                esc_html($l['origem'] ?? ''),
                $ruim ? '#d63638' : '#00a32a',
                esc_html($l['desfecho'] ?? ''),
                esc_html($l['detalhe'] ?? '')
            );
        }
        echo '</tbody></table>';
        echo '<p class="description">Guarda os últimos ' . IMIGRAR_LOG_MAX . '. Não é auditoria — é o suficiente para ' .
             'responder "está funcionando?" e "por que aquele não entrou?".</p>';
    }

    // ── EXPORTAR, EM ÚLTIMO ───────────────────────────────────────────────────────
    echo '<hr style="margin-top:28px"><h2>Exportar para conferir</h2>';
    echo '<p class="description" style="max-width:940px">Gera o mesmo conteúdo em <code>.csv</code>, para olhar os campos ' .
         'antes de ligar um tipo. <strong>Não é necessário para a integração.</strong></p>';
    if (!empty($tipos)) {
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="imigrar_exportar_cpt">';
        wp_nonce_field('imigrar_exportar');
        echo '<select name="tipo">';
        foreach ($tipos as $t) {
            printf('<option value="%s">%s</option>', esc_attr($t->name), esc_html($t->labels->name));
        }
        echo '</select> ';
        submit_button('Baixar CSV', 'secondary', 'submit', false);
        echo '</form>';
    }
    echo '</div>';
}

/**
 * TESTAR A CONEXÃO SEM SUJAR A FILA.
 *
 * Vai DE PROPÓSITO sem telefone: o CRM descarta registro sem telefone, então o teste
 * exercita o caminho inteiro — rede, token, middleware, handler — e não deixa um card de
 * teste para alguém apagar depois. Um botão de teste que cria lixo é um botão que ninguém
 * aperta.
 */
add_action('admin_post_imigrar_testar', function () {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }
    check_admin_referer('imigrar_crm');

    if (!imigrar_token()) {
        wp_safe_redirect(add_query_arg(
            array('imigrar' => 'teste', 'resumo' => rawurlencode('sem token configurado')),
            admin_url('admin.php?page=imigrar-crm')
        ));
        exit;
    }

    $resposta = wp_remote_post(IMIGRAR_DESTINO_REGISTRO, array(
        'timeout' => 15,
        'headers' => array(
            'Content-Type'    => 'application/json; charset=utf-8',
            'X-Imigrar-Token' => imigrar_token(),
        ),
        'body' => wp_json_encode(array(
            'fonte'  => 'teste:painel',
            'campos' => array('Título' => 'Teste de conexão do WordPress'),
        )),
    ));

    if (is_wp_error($resposta)) {
        $resumo = 'não alcançou o CRM: ' . $resposta->get_error_message();
    } else {
        $codigo = (int) wp_remote_retrieve_response_code($resposta);
        $corpo  = substr((string) wp_remote_retrieve_body($resposta), 0, 200);
        if ($codigo === 401) {
            $resumo = 'o CRM respondeu 401 — o token está errado.';
        } elseif ($codigo === 503) {
            $resumo = 'o CRM respondeu 503 — falta configurar o SITE_CAPTURE_TOKEN no Vercel.';
        } elseif ($codigo >= 200 && $codigo < 300) {
            $resumo = 'conexão OK. O CRM respondeu: ' . $corpo;
        } else {
            $resumo = 'HTTP ' . $codigo . ' — ' . $corpo;
        }
    }

    wp_safe_redirect(add_query_arg(
        array('imigrar' => 'teste', 'resumo' => rawurlencode($resumo)),
        admin_url('admin.php?page=imigrar-crm')
    ));
    exit;
});

add_action('admin_post_imigrar_salvar_tipos', function () {
    if (!current_user_can('manage_options')) { wp_die('Sem permissão.'); }
    check_admin_referer('imigrar_crm');

    $escolhidos = array();
    foreach ((array) ($_POST['tipos'] ?? array()) as $t) {
        $t = sanitize_key($t);
        if ($t && post_type_exists($t)) { $escolhidos[] = $t; }
    }
    update_option(IMIGRAR_OPCAO_TIPOS, $escolhidos);
    update_option(IMIGRAR_OPCAO_ELEMENTOR, !empty($_POST['elementor']) ? 1 : 0);

    // CAMPO VAZIO SIGNIFICA "NÃO MEXER", e não "apagar". A tela nunca devolve o segredo
    // para o navegador, então ela não tem como reenviá-lo ao salvar — se vazio apagasse,
    // salvar qualquer outro ajuste derrubaria a integração inteira em silêncio.
    $token = trim((string) ($_POST['token'] ?? ''));
    if ($token !== '') { update_option(IMIGRAR_OPCAO_TOKEN, $token, false); }
    wp_safe_redirect(add_query_arg('imigrar', 'salvo', admin_url('admin.php?page=imigrar-crm')));
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
        admin_url('admin.php?page=imigrar-crm')
    ));
    exit;
});

add_action('admin_notices', function () {
    if (($_GET['page'] ?? '') !== 'imigrar-crm') { return; }
    $q = $_GET['imigrar'] ?? '';
    if ($q === 'salvo') {
        echo '<div class="notice notice-success is-dismissible"><p>Tipos salvos.</p></div>';
    } elseif ($q === 'teste') {
        $resumo = rawurldecode((string) ($_GET['resumo'] ?? ''));
        $ok = strpos($resumo, 'OK') !== false;
        printf(
            '<div class="notice notice-%s is-dismissible"><p><strong>Teste de conexão:</strong> %s</p></div>',
            $ok ? 'success' : 'error',
            esc_html($resumo)
        );
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
