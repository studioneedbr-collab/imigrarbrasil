// Ciclo de vida da conversa (gerido automaticamente pela Shayene):
// active: em andamento · waiting: Shayene respondeu, aguardando o lead ·
// negotiating: proposta enviada, lead avaliando · transferred: encaminhada a humano ·
// finished: fechada/desqualificada/encerrada · inactive: sem resposta após follow-up de 24h.
export type ConversationStatus =
  | "active" | "waiting" | "negotiating" | "transferred" | "finished" | "inactive";
export type LeadStatus = "new" | "contacted" | "proposal_sent" | "negotiating" | "won" | "lost";
export type Urgency = "immediate" | "short" | "medium" | "long";
export type ProposalStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected";
export type ProposalEmailStatus = "nao_enviado" | "rascunho_aberto" | "enviado";
export type FollowupStatus = "pending" | "sent" | "cancelled";
export type ServiceSchedule = "5x2_44h" | "6x1_44h" | "12x36";
export type FlowStateId = "S0"|"S1"|"S2"|"S3"|"S4"|"S5"|"S6"|"S7"|"S8"|"S9"|"S10";
export type LeadStage = "novo"|"qualificado"|"orcado"|"transferido"|"ganho"|"perdido"|"desqualificado";
// Setor de destino do lead (define em qual pipeline/CRM ele cai).
// suprimentos = quem quer VENDER para a Shine (fornecedor/parceiro); diretoria = imprensa
// e institucional. Os dois não são funil de venda, mas precisam de um destino de verdade —
// sem isso a Shayene jogava fornecedor e jornalista na pipeline comercial.
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
  // ENCAMINHADA a um setor (ticket aberto) — a Shayene continua acolhendo o cliente.
  // `assumedBy` diz que uma pessoa REAL pegou a conversa (e-mail do usuário do painel):
  // só aí a Shayene fica em silêncio para não falar por cima do atendente.
  assumedBy?: string | null;
  assumedAt?: string | null;
  // Ciclo de status/follow-up automático.
  lastMessageAt?: string | null;
  followupSentAt?: string | null;
  reopenedAt?: string | null;
  // PEDIU PARA PARAR. Preenchido quando o contato escreve algo como "para de me mandar
  // mensagem": a Shayene se despede uma vez e nunca mais fala com este número sozinha.
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
  /** Conteúdo lido do arquivo (visão/OCR) — alimenta a resposta da Shayene. */
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

export interface Lead {
  id: string;
  conversationId: string;
  contactName?: string | null;
  companyName?: string | null;
  whatsappNumber: string;
  email?: string | null;
  clientType?: string | null;
  servicesInterested?: string[] | null;
  employeesNeeded?: number | null;
  region?: string | null;
  contractDuration?: string | null;
  estimatedValue?: number | null;
  status: LeadStatus;
  urgency?: Urgency | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  clienteId?: string;
  schedule?: string;
  stage: LeadStage;
  score: number;
  setor?: LeadSetor | null;
}

export interface ProposalServiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  schedule?: string;
  /**
   * O que a linha assumiu ao ser precificada. Guardado junto porque a planilha de
   * composição (GET /api/proposal/[id]/planilha) é gerada sob demanda a partir daqui —
   * sem isto, a planilha do Eduardo sairia com o preço do Rio e sem os adicionais,
   * diferente do PDF que o cliente recebeu. A coluna é jsonb, então não precisa migration.
   */
  region?: string;
  semUniforme?: boolean;
  comMaterial?: boolean;
  /**
   * Cobertura do posto. Com ela, `quantity` são POSTOS e não pessoas: um posto 24h na
   * 12x36 são quatro funcionários, dois com adicional noturno. Gravada junto para a
   * planilha de composição sair com as mesmas abas de turno que geraram o preço do PDF.
   */
  cobertura?: "24h" | "12h_diurno" | "12h_noturno";
  adicionais?: {
    insalubridade?: "minimo" | "medio" | "maximo";
    periculosidade?: boolean;
    noturno?: boolean;
    horasNoturnasMes?: number;
    intrajornadaIndenizada?: boolean;
    lideraEquipeDe?: number;
  };
}

export interface Proposal {
  id: string;
  leadId?: string | null;
  conversationId?: string | null;
  pdfUrl?: string | null;
  services: ProposalServiceLine[];
  totalValue: number;
  costBreakdown?: Record<string, number> | null;
  status: ProposalStatus;
  emailStatus?: ProposalEmailStatus | null;
  createdAt: string;
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

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: string;
  baseSalary: number;
  costPerEmployee: number;
  salePrice: number;
  marginPercent: number;
  schedule: ServiceSchedule;
  description?: string | null;
  active: boolean;
  // true = preço de venda validado (dados reais). false = estimativa → "sob consulta".
  priceConfirmed?: boolean;
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
  servicos?: string[]; quantidade?: number; escala?: string;
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
  role: "admin" | "user";
  setor?: LeadSetor | null; // null/admin = vê tudo; senão restringe ao setor
  active: boolean;
  createdAt: string;
}

export interface Funcionario {
  id: string;
  nome: string;
  cpf?: string;
  cargo?: string;
  setor?: string;
  telefone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
}
