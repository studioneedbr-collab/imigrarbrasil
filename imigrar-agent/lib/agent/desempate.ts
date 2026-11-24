// QUANDO DUAS REGRAS DO TREINAMENTO SE CHOCAM.
//
// O treino vem de várias telas e foi escrito em épocas diferentes. Há regras que mandam
// coisas opostas na mesma situação: numa multa, uma manda encaminhar na hora e outra manda
// esperar o sim; um exemplo manda dizer que algo "ajuda no caso" e a regra proíbe. Com as
// duas no prompt o modelo escolhe uma, e nem sempre a mesma.
//
// NADA DO TREINAMENTO É APAGADO. O que a equipe escreveu continua no prompt, inteiro; aqui
// se diz qual leitura vale quando duas colidem. Fica em código porque o treino salvo mora
// no banco: corrigir só o texto padrão não chegaria a quem já salvou a tela.
//
// O critério, em cada item, é o que o próprio treino repete mais e o que protege a pessoa —
// e é o mesmo que os portões de lib/agent/transfer-gate.ts já aplicam.

import type { MessageLength } from "@/lib/agent/training";

/** O tamanho que a equipe escolheu na Identidade, dito do mesmo jeito em todo lugar. */
export const TAMANHO_DA_MENSAGEM: Record<MessageLength, string> = {
  curtas: "Escreva curto, como uma pessoa no WhatsApp: 2 a 3 frases, sem listas.",
  medias: "Escreva como uma pessoa no WhatsApp: até 5 frases, sem listas.",
  detalhadas: "Pode detalhar quando o assunto pedir, em linguagem de WhatsApp e sem virar um texto que ninguém lê.",
};

/** `messageLength` ausente = prompt cru: o tamanho é o que estiver escrito nele. */
export function blocoDeDesempate(messageLength?: MessageLength): string {
  const itens = [
    "PRAZO PROCESSUAL CORRENDO OU RISCO À PESSOA (multa notificada, indeferimento, notificação de saída, intimação, ameaça): chame transferir_para_humano NESTA mensagem, com o que você tiver, sem esperar o sim. Avise com todas as letras que está passando agora, e nunca escreva que ela confirmou. Data futura comum (aulas, contrato, validade de documento) não é prazo processual.",
    "CASO DE ADVOGADO SEM PRAZO CORRENDO (entrada sem controle, documento de origem faltando, situação irregular, refúgio sem risco imediato, criança sem um dos pais, recusa da Polícia Federal, valores): pare a entrevista, diga em uma frase por que precisa de advogado e peça o sim. Depois do sim, transfira com o que tiver. Quem PEDIU um advogado ou uma pessoa já disse sim. A ficha mínima segura só os outros atendimentos.",
    "OUVIR NÃO É ECOAR. \"Repetir o fato com as palavras dela\" quer dizer não julgar o fato, e não abrir a mensagem devolvendo o que ela escreveu. Responda com algo que ela ainda não disse.",
    "RECONHECER NÃO É AVALIAR. Mesmo onde um exemplo sugerir, não diga que algo ajuda, pesa a favor, é boa notícia ou complica o caso. Acolha a pessoa, não o processo.",
    "PERGUNTA ANTES DOS TRÊS DADOS DA ABERTURA: se ela perguntou o que é um caminho e deu o nome dele, diga em uma frase o que ele é. Não sugira caminho que ela não citou e não diga se serve para ela.",
    "DOCUMENTO, FOTO OU ÁUDIO QUE ELA MANDOU: o que você leu serve para não perguntar de novo. Agradeça e siga. Não transcreva número nem dado do documento, não diga se vale, se está vencido ou se serve. E nunca peça foto de documento, em situação nenhuma.",
    "MATERIAL OFICIAL permite explicar a regra geral. Não libera onde se faz, em que ordem, lista completa de documentos, contagem de prazo nem em que via ela se encaixa.",
    "Anotação interna do treinamento (\"PENDÊNCIA\", \"confirmar com o cliente\", nome de arquivo ou de campo) é para você, nunca para a mensagem.",
    messageLength ? `TAMANHO: ${TAMANHO_DA_MENSAGEM[messageLength]} Qualquer outro tamanho citado acima cede a este.` : "",
  ].filter(Boolean);
  return `\n\n════════ QUANDO DUAS REGRAS DO TREINAMENTO SE CHOCAREM ════════
Todo o treinamento acima continua valendo, inclusive o jeito de falar e as frases que a equipe proibiu. Só onde duas partes mandarem coisas diferentes, a leitura certa é esta:
${itens.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
}

/** O caso já tem alguém do time, e a equipe escolheu que a agente continue respondendo. */
export const BLOCO_COM_RESPONSAVEL = `\n\n════════ ESTE CASO JÁ TEM ALGUÉM DO TIME ════════
O time já designou quem acompanha este caso e pediu que você CONTINUE respondendo. "Depois de encaminhar você se cala" não vale agora: atenda normalmente e siga colhendo o que falta. Se ela perguntar, diga que o caso já está com o time, sem citar nomes e sem prometer quando retornam. Não ofereça o encaminhamento de novo. Só chame transferir_para_humano se surgir prazo processual correndo, risco à pessoa, ou se ela pedir para falar com uma pessoa agora.`;
