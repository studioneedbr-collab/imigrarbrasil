// Ciclo de vida da conversa (gerido automaticamente pela Ana):
// active: em andamento · waiting: a Ana respondeu, aguardando o contato ·
// negotiating: herdado da base comercial, o agente não usa mais · transferred: encaminhada
// ao time jurídico · finished: encerrada · inactive: sem resposta após o follow-up de 24h.
export type ConversationStatus =
  | "active" | "waiting" | "negotiating" | "transferred" | "finished" | "inactive";
export type LeadStatus = "new" | "contacted" | "proposal_sent" | "negotiating" | "won" | "lost";
export type Urgency = "immediate" | "short" | "medium" | "long";
export type FollowupStatus = "pending" | "sent" | "cancelled";
export type FlowStateId = "S0"|"S1"|"S2"|"S3"|"S4"|"S5"|"S6"|"S7"|"S8"|"S9"|"S10";
export type LeadStage = "novo"|"qualificado"|"orcado"|"transferido"|"ganho"|"perdido"|"desqualificado";
// Setor de destino do contato (define em qual pipeline/CRM ele cai). "comercial" é o
// funil do TIME JURÍDICO — é para lá que vai todo atendimento de imigração.
// suprimentos = quem quer VENDER para a assessoria (fornecedor/parceiro); diretoria =
// imprensa e institucional. Os dois precisam de um destino de verdade — sem isso um
// fornecedor ou um jornalista cai na fila de quem está pedindo ajuda com um visto.
export type LeadSetor = "comercial"|"operacional"|"rh"|"departamento_pessoal"|"suprimentos"|"diretoria";

export interface Conversation {
  id: string;
  whatsappNumber: string;
  contactName?: string | null;
  status: ConversationStatus;
  leadScore: number;
  createdAt: string;
  updatedAt: string;
  clienteId?: string;
  estadoAtual: FlowStateId;
  handedOffTo?: string;
  handoffReason?: string;
  // ATENDIMENTO HUMANO. `status: 'transferred'` diz apenas que a conversa foi
  // ENCAMINHADA a um setor (ticket aberto) — a Ana continua acolhendo a pessoa.
  // `assumedBy` diz que uma pessoa REAL pegou a conversa (e-mail do usuário do painel):
  // só aí a Ana fica em silêncio para não falar por cima do atendente.
  assumedBy?: string | null;
  assumedAt?: string | null;
  // Ciclo de status/follow-up automático.
  lastMessageAt?: string | null;
  followupSentAt?: string | null;
  reopenedAt?: string | null;
  // PEDIU PARA PARAR. Preenchido quando o contato escreve algo como "para de me mandar
  // mensagem": a Ana se despede uma vez e nunca mais fala com este número sozinha.
  // É o que evita o Bloquear + Denunciar que derruba o WhatsApp da empresa.
  optOutAt?: string | null;
  // Disse que não tem interesse. Continua conversando (pode mudar de ideia agora), mas
  // nenhuma mensagem automática vai atrás dele depois.
  noFollowupAt?: string | null;
  // IDIOMA DO CONTATO (ISO-639-1: "pt", "es", "en", "ht"…). Detectado na conversa e
  // guardado aqui. Importa em dois lugares onde a regra de idioma do prompt não alcança:
  // a mensagem automática de follow-up, que sai sem ninguém por perto e ia sempre em
  // português, e o atendente humano que abre o painel e precisa saber em que língua
  // responder antes de escrever.
  idioma?: string | null;
  // ONDE ESTA CONVERSA ACONTECEU. Gravado na criação, a partir da instância Z-API que
  // recebeu a mensagem, e nunca reescrito depois: se a instância for promovida de teste
  // a produção amanhã, o que já aconteceu continua tendo acontecido em teste.
  instanciaId?: string | null;
  ambiente?: AmbienteInstancia;
  // O RELÓGIO DA PRIMEIRA RESPOSTA HUMANA. Preenchido quando uma mensagem chega com o
  // agente desligado: ninguém respondeu ainda e o SLA está correndo. Zerado no instante
  // em que um humano responde ou assume. É isto que impede o "desligado" de virar
  // "ignorado" — a conversa entra na fila de trabalho e sobe se ninguém a pegar.
  aguardandoHumanoDesde?: string | null;
}

export type MediaKind = "image" | "document" | "audio";

/** Anexo recebido no WhatsApp, guardado junto da mensagem. */
export interface MessageMedia {
  url: string;
  kind: MediaKind;
  name: string;
  /** Conteúdo lido do arquivo (visão/OCR) — alimenta a resposta da Ana. */
  text?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  whatsappMessageId?: string | null;
  createdAt: string;
  mediaUrl?: string | null;
  mediaType?: MediaKind | null;
  mediaName?: string | null;
  mediaText?: string | null;
}

/** Uma linha da lista de Documentos (mensagem com anexo + de quem veio). */
export interface DocumentItem {
  messageId: string;
  conversationId: string;
  contactName: string | null;
  whatsappNumber: string;
  url: string;
  kind: MediaKind;
  name: string;
  text?: string | null;
  createdAt: string;
}

/**
 * O contato, do jeito que o time jurídico precisa lê-lo.
 *
 * Os campos de imigração — e a regra de quem pode gravar cada um — moram em
 * `LeadImigracao`, no fim deste arquivo.
 */
export interface Lead extends LeadImigracao {
  id: string;
  conversationId: string;
  contactName?: string | null;
  companyName?: string | null;
  whatsappNumber: string;
  email?: string | null;
  clientType?: string | null;
  servicesInterested?: string[] | null;
  region?: string | null;
  contractDuration?: string | null;
  status: LeadStatus;
  urgency?: Urgency | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  clienteId?: string;
  stage: LeadStage;
  score: number;
  setor?: LeadSetor | null;
}

export interface Followup {
  id: string;
  conversationId: string;
  scheduledAt: string;
  message: string;
  status: FollowupStatus;
  attempt: number;
  createdAt: string;
}

export interface Cliente {
  id: string;
  nome?: string;
  cpf?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  createdAt: string;
}

export interface TransferDossie {
  nome?: string; empresa?: string; cpf?: string; cidade?: string;
  servicos?: string[];
  necessidade?: string; historicoResumo?: string;
}

export interface TransferTicket {
  id: string;
  conversationId: string;
  clienteId?: string;
  reason: string;
  priority: "normal"|"urgent";
  dossie: TransferDossie;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  // Ver lib/auth/papeis.ts. 'user' continua no tipo porque contas antigas o têm gravado
  // no banco; em memória e na sessão ele é lido como 'atendente'.
  role: "admin" | "advogado" | "atendente" | "user";
  setor?: LeadSetor | null; // null/admin = vê tudo; senão restringe ao setor
  active: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE PRAZOS
//
// O que segue é o modelo deste atendimento, e não o do funil de vendas que originou o
// código. A tela inicial existe para responder uma pergunta: o que vence primeiro?
// ─────────────────────────────────────────────────────────────────────────────

/** Onde a pessoa está AGORA. É a distinção que muda o atendimento inteiro. */
export type Localizacao = "brasil" | "exterior";

/** Que prazo está correndo. Preenchido junto com a data, por um humano. */
export type PrazoTipo = "multa" | "indeferimento" | "notificacao_saida" | "outro";

/**
 * O que a pessoa disse quando lhe perguntaram se quer tocar o processo sozinha ou se
 * prefere que o escritório cuide. É o campo que separa caso de curioso — e o único que
 * responde, antes de alguém gastar uma hora ao telefone, se há intenção de contratar.
 */
export type Intencao = "contratar" | "sozinho" | "sem_condicoes";

/**
 * QUENTE_PRAZO           prazo processual correndo
 * QUENTE_JUDICIAL        caso exige ação judicial
 * MORNO_ADMINISTRATIVO   caso viável, sem urgência
 * EXTERIOR_VISTO         pessoa fora do Brasil
 * DPU                    perfil de gratuidade, encaminhado à Defensoria
 * CURIOSO                sem caso concreto
 * FORA_ESCOPO            outro país ou outra área
 */
export type Classificacao =
  | "QUENTE_PRAZO"
  | "QUENTE_JUDICIAL"
  | "MORNO_ADMINISTRATIVO"
  | "EXTERIOR_VISTO"
  | "DPU"
  | "CURIOSO"
  | "FORA_ESCOPO";

export const CLASSIFICACOES: Classificacao[] = [
  "QUENTE_PRAZO",
  "QUENTE_JUDICIAL",
  "MORNO_ADMINISTRATIVO",
  "EXTERIOR_VISTO",
  "DPU",
  "CURIOSO",
  "FORA_ESCOPO",
];

/**
 * As três classificações que NÃO aparecem na fila. Vão para a aba de conversas
 * filtradas, que existe para auditoria por amostragem — e de onde um humano pode
 * resgatar quem o agente descartou por engano.
 */
export const CLASSIFICACOES_FILTRADAS: Classificacao[] = ["DPU", "CURIOSO", "FORA_ESCOPO"];

export function eFiltrada(c: Classificacao | null | undefined): boolean {
  return !!c && (CLASSIFICACOES_FILTRADAS as string[]).includes(c);
}

/** Onde o atendimento está. Não é estágio de funil: não há avanço, há desfecho. */
export type AtendimentoStatus =
  | "novo"
  | "em_atendimento"
  | "agendado"
  | "fechado"
  | "perdido";

/**
 * O que o agente preenche na conversa e o que o humano confirma depois.
 *
 * A separação mais importante deste arquivo: `temPrazoCorrendo` é da IA;
 * `prazoDataNotificacao` e `prazoDataLimite` são SEMPRE de um humano — por isso vêm
 * acompanhadas de `prazoConfirmadoPor`. Enquanto `prazoDataLimite` for null o lead fica
 * no bloco "prazo a confirmar", com prioridade máxima e sem contador regressivo.
 */
export interface LeadImigracao {
  idioma?: string | null;
  nacionalidade?: string | null;
  localizacao?: Localizacao | null;
  paisExterior?: string | null;
  entradaControleMigratorio?: boolean | null;
  documentosPossui?: string | null;
  documentosFaltantes?: string | null;
  vinculoFamiliarBrasil?: string | null;
  situacaoDocumental?: string | null;
  objetivo?: string | null;
  modalidadeProvavel?: string | null;
  resumo?: string | null;

  /**
   * O RELÓGIO DO CASO — a frase da pessoa sobre o que pressiona o caso dela e quando:
   * "as aulas começam em março", "o passaporte vence em julho", "sem urgência".
   *
   * De propósito NÃO é `temPrazoCorrendo`. Aquele booleano é prazo processual (multa,
   * indeferimento, notificação de saída) e joga o lead no bloco de prioridade máxima da
   * fila; misturar o começo das aulas ali afogaria quem tem defesa a protocolar. Aqui é
   * texto livre, sem data calculada, para quem for pegar o caso saber o que corre.
   */
  relogioDoCaso?: string | null;
  /**
   * A data desse relógio, quando alguém do time consegue apurá-la (YYYY-MM-DD). SEMPRE
   * de humano: o agente não escreve aqui, do mesmo jeito que não escreve data de prazo.
   * Existe porque prazo mole vira duro — "aulas em março" é tranquilo em novembro e é
   * emergência em fevereiro, e o texto sozinho não mostra a virada.
   */
  relogioData?: string | null;
  intencao?: Intencao | null;

  temPrazoCorrendo?: boolean;
  prazoTipo?: PrazoTipo | null;
  prazoDataNotificacao?: string | null;
  prazoDataLimite?: string | null;
  prazoConfirmadoPor?: string | null;
  prazoConfirmadoEm?: string | null;

  classificacao?: Classificacao | null;
  /** A classificação que a IA deu antes de qualquer mão humana. Denominador da taxa de reclassificação. */
  classificacaoIa?: Classificacao | null;

  atendimentoStatus?: AtendimentoStatus;
  motivoPerda?: string | null;
  responsavelId?: string | null;
  assumidoEm?: string | null;
  resgatadoEm?: string | null;
  resgatadoPor?: string | null;
}

/** Um humano discordou da IA. É o dado que calibra o agente. */
export interface Reclassificacao {
  id: string;
  leadId: string;
  de?: Classificacao | null;
  para: Classificacao;
  motivo?: string | null;
  autor: string;
  criadoEm: string;
}

/** Quem abriu o quê, e quando. LGPD: dado sensível não se lê sem deixar rastro. */
export interface AccessLogEntry {
  id: string;
  autor: string;
  papel?: string | null;
  acao: string;
  alvoTipo?: string | null;
  alvoId?: string | null;
  detalhe?: string | null;
  ip?: string | null;
  criadoEm: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAÚDE DA OPERAÇÃO E ACOMPANHAMENTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que quebrou sem derrubar nada — e por isso passaria despercebido.
 *
 * `transcricao_falhou` é o mais caro: quem manda áudio aqui é quem não escreve bem em
 * português, quem está com pressa e quem está com medo. O áudio guardado junto é o que
 * permite alguém OUVIR, em vez de só saber que falhou.
 *
 * `llm_falhou` chamava-se `deepseek_falhou`. O nome do fornecedor virou o nome do
 * problema, e isso custou duas coisas: uma falha da OpenAI (transcrição, embedding) não
 * tinha onde ser gravada, e a contagem de quedas do modelo ficou pendurada na tela de
 * áudios — quem clicava caía numa lista de transcrição. São dois problemas diferentes,
 * com duas causas diferentes, e agora com dois nomes e duas telas.
 */
export type TipoEventoOperacao =
  | "transcricao_falhou"
  | "llm_falhou"
  | "documento_falhou"
  // O verificador de saída cortou uma frase em que a Ana qualificava a situação da
  // pessoa ("sua entrada está regular"). O corte salva aquela mensagem; o registro é o
  // que permite descobrir que o PROMPT está deixando isso passar com frequência.
  | "parecer_barrado";

export interface EventoOperacao {
  id: string;
  tipo: TipoEventoOperacao;
  conversationId?: string | null;
  messageId?: string | null;
  mediaUrl?: string | null;
  detalhe?: string | null;
  resolvidoEm?: string | null;
  resolvidoPor?: string | null;
  criadoEm: string;
  /** Preenchido na leitura, para a tela não precisar de outra consulta. */
  contato?: { nome?: string | null; whatsappNumber?: string | null } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O CUSTO DA IA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PARA QUE A CHAMADA FOI FEITA. É esta quebra que responde a pergunta que importa:
 * a separação entre modelo pequeno e modelo grande está de fato acontecendo?
 *
 * Sem ela, "usamos o modelo barato para classificar" é uma intenção declarada, não um
 * fato observado — e as duas coisas custam valores muito diferentes no fim do mês.
 */
export type TipoChamadaLlm =
  | "redacao"
  | "extracao"
  | "classificacao"
  | "transcricao"
  | "embedding";

export const TIPOS_DE_CHAMADA: TipoChamadaLlm[] = [
  "redacao",
  "extracao",
  "classificacao",
  "transcricao",
  "embedding",
];

/** Uma chamada a provedor de IA, com o que ela custou. Uma linha por chamada. */
export interface ChamadaLlm {
  id: string;
  /** "deepseek", "openai". É o fornecedor, e só ele — o problema tem nome próprio. */
  provedor: string;
  modelo: string;
  tipo: TipoChamadaLlm;
  /** Nulo quando a chamada não pertence a um atendimento (busca no painel, teste). */
  conversationId?: string | null;
  tokensEntrada: number;
  tokensSaida: number;
  /** Segundos de áudio — transcrição é cobrada por tempo, não por token. */
  segundos?: number | null;
  custoUsd: number;
  /**
   * Falso quando o modelo não está na tabela de preços. É a diferença entre "custou
   * zero" e "não sei quanto custou", e a tela precisa poder dizer qual dos dois é.
   */
  precoConhecido: boolean;
  duracaoMs?: number | null;
  ok: boolean;
  erro?: string | null;
  criadoEm: string;
}

/**
 * Um retorno agendado. A nota é obrigatória: "ligar dia 12" não diz nada a quem abrir
 * o painel duas semanas depois; "ligar quando ele conseguir a certidão consular" diz tudo.
 */
export interface Lembrete {
  id: string;
  leadId: string;
  /** Data (YYYY-MM-DD) em que o lead volta ao topo de "Meus atendimentos". */
  quando: string;
  nota: string;
  autor: string;
  feitoEm?: string | null;
  feitoPor?: string | null;
  criadoEm: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A ATIVAÇÃO DO AGENTE
//
// Ligar e desligar a Ana não é um booleano. São três níveis independentes, e a
// independência é o ponto: quem liga a instância de teste não pode, com o mesmo gesto,
// ligar a de produção; quem assume UMA conversa não cala o agente nas outras; e a chave
// geral existe justamente para o dia em que nada disso está sendo suficiente.
//
//   NÍVEL 1  chave geral      — vale para tudo, sempre visível, desligar exige motivo
//   NÍVEL 2  instância Z-API  — ambiente próprio (teste/produção) e ativação própria
//   NÍVEL 3  conversa         — um humano assumiu; ver `assumedBy` em Conversation
//
// E o que mais importa não é o botão: é o COMPORTAMENTO COM O AGENTE DESLIGADO.
// Desligado nunca significa ignorar. A mensagem continua chegando, sendo gravada e
// aparecendo no painel — o que muda é o que sai de volta. Ver `ModoDesligado`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Onde a instância vive. Não é rótulo: separa o que conta como operação real do que é
 * ensaio. Conversa de teste não entra nas métricas nem na fila de trabalho — senão a
 * primeira semana de testes envenena o histórico de um jeito que ninguém desfaz depois.
 */
export type AmbienteInstancia = "teste" | "producao";

/**
 * O que acontece com a mensagem que chega enquanto o agente está desligado.
 *
 * silencio       nada volta para o cliente. SÓ para instância de teste — em produção
 *                seria abandonar uma pessoa que escreveu pedindo ajuda.
 * resposta_fixa  uma frase avisando que um humano vai responder, e quando.
 * sombra         o agente processa normal e GRAVA a resposta que teria dado, sem enviar.
 *                É o modo que vale mais que o botão durante os testes: dá para avaliar
 *                a Ana contra conversa real, sem risco nenhum.
 */
export type ModoDesligado = "silencio" | "resposta_fixa" | "sombra";

/** Uma instância da Z-API: credenciais, ambiente e ativação próprios. */
export interface ZapiInstancia {
  id: string;
  nome: string;
  ambiente: AmbienteInstancia;
  instanceId: string;
  token: string;
  clientToken?: string | null;
  baseUrl: string;
  /** NÍVEL 2. Instância nova nasce SEMPRE desligada — o banco força isso num trigger. */
  ativo: boolean;
  ativadoPor?: string | null;
  ativadoEm?: string | null;
  modoDesligado: ModoDesligado;
  /** Texto do modo `resposta_fixa`. Vazio cai no padrão de MENSAGEM_AGENTE_DESLIGADO. */
  respostaFixa?: string | null;
  /** Minutos de expediente até a conversa sem resposta humana subir na fila. */
  slaMinutos: number;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * NÍVEL 1 — a chave geral. Guardada em `agent_config` sob a chave "chave_geral".
 *
 * `motivo` é obrigatório ao desligar, e não por burocracia: o painel mostra a frase na
 * faixa vermelha do topo, e quem chega às 9h precisa saber se o agente está parado
 * porque houve um incidente ontem ou porque alguém esqueceu de religar.
 */
export interface ChaveGeral {
  ligada: boolean;
  autor: string | null;
  em: string | null;
  motivo: string | null;
}

export type RascunhoStatus = "pendente" | "enviado" | "descartado";

/**
 * MODO SOMBRA — a resposta que a Ana teria dado, gravada e não enviada.
 *
 * Cada descarte e cada edição é dado de treinamento: `texto` é o que ela escreveu,
 * `textoEnviado` é o que a pessoa de fato mandou. O par (um diferente do outro) é o que
 * mostra ONDE ela erra — some se só o texto final for guardado.
 */
export interface RascunhoAgente {
  id: string;
  conversationId: string;
  /** A mensagem do cliente que provocou este rascunho. */
  messageId?: string | null;
  texto: string;
  botoes?: Array<{ id: string; label: string }> | null;
  status: RascunhoStatus;
  /** O que saiu de fato. Diferente de `texto` = a pessoa editou antes de enviar. */
  textoEnviado?: string | null;
  /** Por que foi descartado. É a parte do dado que explica o resto. */
  motivo?: string | null;
  decididoPor?: string | null;
  decididoEm?: string | null;
  criadoEm: string;
  /** Preenchido na leitura, para a fila de sombra não precisar de outra consulta. */
  contato?: { nome?: string | null; whatsappNumber?: string | null } | null;
}
