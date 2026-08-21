"""Limpeza de texto extraído de PDF. Sem dependências externas."""
import re
from collections import Counter

# ---------------------------------------------------------------- idioma
_STOP = {
    "pt": "que nao para uma dos das como com por ser pessoa migrante residencia brasil voce seu sua ate tambem quando pode deve",
    "en": "the and for you with that this from your are will can have must been which their who when",
    "fr": "les des une pour vous avec dans que qui est sur par plus votre sont etre peut doit",
    "es": "los las una para con que del por usted como mas este esta son sus puede debe cuando",
}
_STOP = {k: set(v.split()) for k, v in _STOP.items()}
_DIACRITICOS = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüçñ", "aaaaaeeeeiiiiooooouuuucn")
_ARABE = re.compile(r"[؀-ۿ]")


def detectar_idioma(texto: str) -> str:
    """Retorna 'pt'|'en'|'fr'|'es'|'ar'|'?' por frequência de stopwords."""
    palavras = re.findall(r"[a-zà-ÿ]+", texto.lower())
    if _ARABE.findall(texto) and len(_ARABE.findall(texto)) > len(palavras):
        return "ar"
    if len(palavras) < 25:
        return "?"
    normal = [p.translate(_DIACRITICOS) for p in palavras]
    escores = {k: sum(1 for p in normal if p in s) / len(normal) for k, s in _STOP.items()}
    melhor = max(escores, key=escores.get)
    return melhor if escores[melhor] > 0.02 else "?"


# ---------------------------------------------------------------- sumário
_LINHA_SUMARIO = re.compile(r"[\.\s]\d{1,3}\s*$")


def e_sumario(texto: str) -> bool:
    """Página de índice: maioria das linhas termina em número de página."""
    linhas = [l for l in texto.splitlines() if len(l.strip()) > 3]
    if len(linhas) < 6:
        return False
    return sum(1 for l in linhas if _LINHA_SUMARIO.search(l)) / len(linhas) >= 0.4


# ------------------------------------------------- cabeçalho/rodapé fixo
def descobrir_repetidas(paginas, limiar=0.25, bordas=3):
    """Linhas que aparecem nas bordas de >= `limiar` das páginas são header/footer."""
    contador = Counter()
    for texto in paginas:
        linhas = [l.strip() for l in texto.splitlines() if l.strip()]
        for l in set(linhas[:bordas] + linhas[-bordas:]):
            if 4 <= len(l) <= 120 and not l.isdigit():
                contador[_sem_numeros(l)] += 1
    minimo = max(3, int(len(paginas) * limiar))
    return {chave for chave, n in contador.items() if n >= minimo}


def _sem_numeros(linha: str) -> str:
    return re.sub(r"\d+", "#", linha).strip()


# ---------------------------------------------------------------- limpeza
_NOTA_RODAPE = re.compile(r"^\d{1,3}$")
_URL_QUEBRADA = re.compile(r"(https?://\S+?)-\n(\S)")


def limpar_pagina(texto: str, repetidas: set) -> str:
    linhas = []
    for bruta in texto.splitlines():
        linha = bruta.rstrip()
        nua = linha.strip()
        if not nua:
            linhas.append("")
            continue
        if _NOTA_RODAPE.match(nua):          # número de página solto
            continue
        if _sem_numeros(nua) in repetidas:   # cabeçalho/rodapé recorrente
            continue
        linhas.append(linha)
    return "\n".join(linhas)


def juntar_paragrafos(texto: str) -> str:
    """Desfaz a quebra de linha do PDF preservando parágrafos e listas."""
    texto = _URL_QUEBRADA.sub(r"\1\2", texto)
    texto = re.sub(r"(\w)-\n(\w)", r"\1\2", texto)          # hifenização
    linhas = texto.split("\n")
    saida, buffer = [], ""
    for linha in linhas:
        nua = linha.strip()
        if not nua:
            if buffer:
                saida.append(buffer)
                buffer = ""
            continue
        if _inicia_bloco(nua) and buffer:
            saida.append(buffer)
            buffer = nua
            continue
        buffer = f"{buffer} {nua}".strip() if buffer else nua
        if nua.endswith((".", ":", ";", "?", "!")) and len(nua) < 60:
            saida.append(buffer)
            buffer = ""
    if buffer:
        saida.append(buffer)
    return "\n\n".join(_espacos(p) for p in saida if p.strip())


_MARCADOR = re.compile(r"^([•▪◦\-–·]|[IVXLC]+\s*[-–)]|[a-z]\)|\d+[\.\)])\s")


def _inicia_bloco(linha: str) -> bool:
    return bool(_MARCADOR.match(linha))


def _espacos(t: str) -> str:
    return re.sub(r"[ \t]+", " ", t).strip()
