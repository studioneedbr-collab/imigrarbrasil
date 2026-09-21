<?php
/**
 * Apagar o plugin apaga o que ele guardou.
 *
 * Roda só quando alguém escolhe EXCLUIR o plugin — desativar não passa por aqui, e é assim
 * que tem de ser: desativar para testar alguma coisa não pode custar o token e a lista de
 * tipos configurados.
 *
 * O token sai junto de propósito. Deixar um segredo do CRM no banco de um plugin que não
 * existe mais é deixá-lo onde ninguém mais vai procurar.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) { exit; }

foreach (array('imigrar_token_do_crm', 'imigrar_tipos_no_crm', 'imigrar_elementor_no_crm', 'imigrar_ultimos_envios') as $opcao) {
    delete_option($opcao);
}
