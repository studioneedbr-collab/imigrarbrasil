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
 */
export type TipoEventoOperacao = "transcricao_falhou" | "deepseek_falhou" | "documento_falhou";

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
