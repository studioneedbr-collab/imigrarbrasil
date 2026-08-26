import type {
  Conversation, Message, MessageMedia, DocumentItem, Lead, Proposal, Followup, ServiceCatalogItem,
  ProposalStatus, ProposalEmailStatus, FollowupStatus, Cliente, FlowStateId, TransferTicket, User, Funcionario,
} from "@/lib/domain/types";
import type { PricingParams } from "@/lib/comercial/pricing-params";
import type { ActivityMessage } from "@/lib/notifications/new-messages";

export interface Repository {
  getOrCreateConversation(whatsappNumber: string, contactName?: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  updateConversation(id: string, patch: Partial<Conversation>): Promise<Conversation>;
  listConversations(): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;
  // Ciclo de status/follow-up automático.
  updateConversationStatus(id: string, status: Conversation["status"]): Promise<void>;
  updateLastMessageAt(id: string): Promise<void>;
  markFollowupSent(id: string): Promise<void>;
  getConversationsForFollowup(): Promise<Conversation[]>;
  getInactiveConversations(): Promise<Conversation[]>;
  /**
   * Um atendente REAL assume a conversa (e-mail do usuário do painel). A partir daqui
   * a Ana fica em silêncio no WhatsApp para não falar por cima dele.
   * `releaseConversation` devolve o atendimento para ela.
   */
  assumeConversation(id: string, who: string): Promise<void>;
  releaseConversation(id: string): Promise<void>;
  /**
   * O contato pediu para parar de receber mensagem. `bloquear` cala a Ana de vez
   * neste número; `sem_followup` só impede as mensagens automáticas. Nunca é revertido
   * por código — só o próprio contato voltando a escrever (e aí quem puxou foi ele).
   */
  marcarOptOut(id: string, tipo: "bloquear" | "sem_followup"): Promise<void>;

  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    whatsappMessageId?: string,
    media?: MessageMedia,
  ): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
  /**
   * Mensagens de várias conversas em UMA ida ao banco, agrupadas por conversa.
   * A visão geral calculava o tempo médio de resposta com um listMessages por
   * conversa dentro de um for: 30 idas em sequência, ~1,8s só nisso, e o painel
   * parecia travado depois do login.
   */
  listMessagesForConversations(conversationIds: string[]): Promise<Map<string, Message[]>>;
  /** Grava o texto lido de um anexo depois que a visão termina (é lento para bloquear o insert). */
  setMessageMediaText(messageId: string, text: string): Promise<void>;
  /** Documentos recebidos — a conversa inteira, ou os mais recentes de todas (aba Documentos). */
  listDocuments(opts?: { conversationId?: string; limit?: number }): Promise<DocumentItem[]>;
  /** Deduplicação de webhook: a Meta reentrega a mesma mensagem quando não recebe 200 a tempo. */
  hasWhatsappMessage(whatsappMessageId: string): Promise<boolean>;
  /**
   * Mensagens de cliente mais recentes, de todas as conversas — alimenta a
   * notificação do painel. Não devolve o conteúdo (LGPD). Não usa `lastMessageAt`
   * da conversa, que `addMessage` não mantém atualizado.
   */
  listRecentUserMessages(limit: number): Promise<ActivityMessage[]>;

  upsertLead(conversationId: string, patch: Partial<Lead>): Promise<Lead>;
  getLeadByConversation(conversationId: string): Promise<Lead | null>;
  listLeads(): Promise<Lead[]>;
  deleteLead(id: string): Promise<void>;

  createProposal(data: Omit<Proposal, "id" | "createdAt" | "status"> & { status?: ProposalStatus }): Promise<Proposal>;
  updateProposalStatus(id: string, status: ProposalStatus): Promise<void>;
  updateProposalEmailStatus(id: string, emailStatus: ProposalEmailStatus): Promise<void>;
  /** Busca uma proposta pelo id, com o PDF. listProposals() omite o PDF de propósito. */
  getProposal(id: string): Promise<Proposal | null>;
  listProposals(): Promise<Proposal[]>;
  deleteProposal(id: string): Promise<void>;
  /**
   * Esta conversa já recebeu proposta? Herdado da base comercial e usado só pelo painel
   * (telas de Propostas/Orçamento) — o agente não gera mais proposta nenhuma.
   */
  hasProposalForConversation(conversationId: string): Promise<boolean>;

  scheduleFollowup(conversationId: string, message: string, scheduledAt: string): Promise<Followup>;
  listPendingFollowups(): Promise<Followup[]>;
  updateFollowupStatus(id: string, status: FollowupStatus): Promise<void>;
  cancelPendingFollowups(conversationId: string): Promise<void>;

  getConfig<T = unknown>(key: string): Promise<T | null>;
  setConfig(key: string, value: unknown): Promise<void>;

  listServices(): Promise<ServiceCatalogItem[]>;
  getService(name: string): Promise<ServiceCatalogItem | null>;

  upsertCliente(patch: Partial<Cliente> & { id?: string }): Promise<Cliente>;
  getCliente(id: string): Promise<Cliente | null>;
  listClientes(): Promise<Cliente[]>;
  updateCliente(id: string, patch: Partial<Cliente>): Promise<Cliente>;
  deleteCliente(id: string): Promise<void>;
  setEstado(conversationId: string, estado: FlowStateId): Promise<void>;
  setHandoff(conversationId: string, to: string, reason: string): Promise<void>;
  createTransferTicket(data: Omit<TransferTicket, "id" | "createdAt">): Promise<TransferTicket>;
  listTransferTickets(): Promise<TransferTicket[]>;
  /** Filtra no banco (usa idx_transfer_conv) em vez de trazer todos e filtrar em JS. */
  listTransferTicketsByConversation(conversationId: string): Promise<TransferTicket[]>;

  listFunctionPricing(): Promise<PricingParams[]>;
  getFunctionPricing(name: string): Promise<PricingParams | null>;
  upsertFunctionPricing(params: PricingParams): Promise<PricingParams>;
  deleteFunctionPricing(functionName: string): Promise<void>;

  getUserByEmail(email: string): Promise<User | null>;
  createUser(data: { email: string; passwordHash: string; name?: string; role?: "admin" | "user"; setor?: string | null }): Promise<User>;
  listUsers(): Promise<Array<Omit<User, "passwordHash">>>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;

  listFuncionarios(): Promise<Funcionario[]>;
  createFuncionario(data: { nome: string; cpf?: string; cargo?: string; setor?: string; telefone?: string; email?: string }): Promise<Funcionario>;
}
