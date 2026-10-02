<?php
// IMAGENS DOS ARTIGOS: /uploads/blog/AAAA/MM/nome-xxxx.jpg
//
// Reduz para no máximo 1600 px de largura (a capa aparece com 960) e grava ao lado a
// versão WebP (foto.jpg.webp), que o nginx entrega no mesmo endereço para quem aceita —
// o mesmo esquema das imagens do build (scripts/otimizar-imagens.mjs).
declare(strict_types=1);

const LARGURA_MAX = 1600;

function receber_imagem(array $arq, string $nome): string
{
    if (($arq['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new InvalidArgumentException('O envio falhou. Tente de novo (imagens até 15 MB).');
    if ($arq['size'] > 15 * 1048576) throw new InvalidArgumentException('Imagem grande demais: o limite é 15 MB.');
    $info = @getimagesize($arq['tmp_name']);
    $tipos = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($tipos[$info[2]])) throw new InvalidArgumentException('Envie JPG, PNG ou WebP.');
    $ext = $tipos[$info[2]];

    $base = trim(substr(slugify($nome), 0, 60), '-') ?: 'imagem';
    $pasta = '/uploads/blog/' . date('Y/m');
    $url = "$pasta/$base-" . bin2hex(random_bytes(2)) . ".$ext";
    $destino = RAIZ . $url;
    if (!is_dir(dirname($destino))) mkdir(dirname($destino), 0770, true);

    $gd = function_exists('imagecreatefromstring') ? @imagecreatefromstring((string) file_get_contents($arq['tmp_name'])) : false;
    if (!$gd) {
        // Sem GD no servidor: guarda como veio.
        move_uploaded_file($arq['tmp_name'], $destino) || copy($arq['tmp_name'], $destino);
        chmod($destino, 0660);
        return $url;
    }
    if ($ext === 'jpg') $gd = girar_pela_camera($gd, $arq['tmp_name']);
    if (imagesx($gd) > LARGURA_MAX) {
        $menor = imagescale($gd, LARGURA_MAX, (int) round(imagesy($gd) * LARGURA_MAX / imagesx($gd)));
        if ($menor) $gd = $menor;
    }
    if ($ext !== 'jpg') { imagealphablending($gd, false); imagesavealpha($gd, true); }
    match ($ext) {
        'jpg' => imagejpeg($gd, $destino, 82),
        'png' => imagepng($gd, $destino, 9),
        'webp' => imagewebp($gd, $destino, 80),
    };
    if ($ext !== 'webp' && function_exists('imagewebp')) imagewebp($gd, "$destino.webp", 78);
    foreach ([$destino, "$destino.webp"] as $f) if (is_file($f)) chmod($f, 0660);
    return $url;
}

/** Foto de celular vem deitada com uma marca de "gire"; o navegador gira, o GD não. */
function girar_pela_camera(GdImage $gd, string $arq): GdImage
{
    $o = function_exists('exif_read_data') ? (@exif_read_data($arq)['Orientation'] ?? 1) : 1;
    $graus = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
    return $graus ? imagerotate($gd, $graus, 0) : $gd;
}
