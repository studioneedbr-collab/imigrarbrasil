#!/usr/bin/env bash
# Gera o ZIP que o WordPress instala em Plugins → Adicionar novo → Enviar plugin.
#
# A pasta de dentro do ZIP TEM de se chamar `imigrar-crm`: é ela que vira
# `wp-content/plugins/imigrar-crm/`, e é por esse caminho que o WordPress reconhece uma
# atualização como atualização do mesmo plugin, em vez de instalar um segundo ao lado.
set -euo pipefail
cd "$(dirname "$0")"

rm -f imigrar-crm.zip
# -X não guarda os metadados do macOS; sem isso o ZIP carrega __MACOSX e ._arquivos, que
# aparecem como lixo dentro da pasta de plugins do cliente.
zip -r -X imigrar-crm.zip imigrar-crm -x '.*' -x '__MACOSX' >/dev/null
echo "imigrar-crm.zip — $(du -h imigrar-crm.zip | cut -f1)"
unzip -l imigrar-crm.zip
