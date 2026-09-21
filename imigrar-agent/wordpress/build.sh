#!/usr/bin/env bash
# Gera o ZIP que o WordPress instala em Plugins → Adicionar novo → Enviar plugin.
#
# A pasta de dentro do ZIP TEM de se chamar `imigrar-crm`: é ela que vira
# `wp-content/plugins/imigrar-crm/`, e é por esse caminho que o WordPress reconhece um
# reenvio como ATUALIZAÇÃO — mostrando "Substituir a atual pela enviada" — em vez de
# instalar um segundo plugin ao lado. Substituir PRESERVA as opções; excluir não, porque
# excluir roda o uninstall.php.
#
# A VERSÃO SOBE SOZINHA A CADA BUILD, e isso não é capricho: durante a depuração saíram
# várias versões diferentes todas numeradas 1.1.0, e nem eu nem quem estava instalando
# tinha como saber qual delas estava no ar. Número repetido transforma "já atualizei" e
# "ainda não atualizei" na mesma tela.
set -euo pipefail
cd "$(dirname "$0")"

ARQUIVO=imigrar-crm/imigrar-crm.php
ATUAL=$(grep -m1 '^ \* Version:' "$ARQUIVO" | sed 's/.*Version: *//')
MAIOR=${ATUAL%%.*}; RESTO=${ATUAL#*.}; MENOR=${RESTO%%.*}; PATCH=${RESTO#*.}
NOVA="$MAIOR.$MENOR.$((PATCH + 1))"

# O sed do macOS precisa do argumento vazio no -i; o do Linux não aceita. Detectar é mais
# barato do que descobrir na hora errada que o arquivo virou `imigrar-crm.php-e`.
if sed --version >/dev/null 2>&1; then
  sed -i "s/^ \* Version: .*/ * Version: $NOVA/" "$ARQUIVO"
else
  sed -i '' "s/^ \* Version: .*/ * Version: $NOVA/" "$ARQUIVO"
fi

rm -f imigrar-crm.zip
# -X não guarda os metadados do macOS; sem isso o ZIP carrega __MACOSX e ._arquivos, que
# aparecem como lixo dentro da pasta de plugins do cliente.
zip -r -X imigrar-crm.zip imigrar-crm -x '.*' -x '__MACOSX' >/dev/null

echo "imigrar-crm.zip — versão $NOVA ($(du -h imigrar-crm.zip | cut -f1))"
