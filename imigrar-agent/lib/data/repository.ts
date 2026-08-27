import type {
  Conversation, Message, MessageMedia, DocumentItem, Lead, Followup,
  FollowupStatus, Cliente, FlowStateId, TransferTicket, User,
  Classificacao, Reclassificacao, AccessLogEntry, EventoOperacao, TipoEventoOperacao, Lembrete,
  ZapiInstancia, RascunhoAgente, RascunhoStatus,
} from "@/lib/domain/types";
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

  /**
   * O caminho do AGENTE. Preenche o dossiê a partir da conversa e NUNCA toca nas datas
   * de prazo: `prazoDataNotificacao` e `prazoDataLimite` são ignorados aqui, de
   * propósito, mesmo que venham no patch. Data de prazo só entra por `confirmarPrazo`.
   */
  upsertLead(conversationId: string, patch: Partial<Lead>): Promise<Lead>;
  getLead(id: string): Promise<Lead | null>;
  getLeadByConversation(conversationId: string): Promise<Lead | null>;
  /**
   * `limite` existe para a fila não trazer o banco inteiro a cada request. A ordenação
   * dela roda em memória sobre todos os leads (a regra dos três blocos não cabe num
   * `order by`), então o teto é o que segura o custo sem reescrever a regra em SQL.
   * Quem corta AVISA na tela — ver lib/fila/paginacao.ts.
   */
  listLeads(opcoes?: { limite?: number }): Promise<Lead[]>;
  /** Quantos leads existem ao todo. É o denominador do aviso de corte. */
  contarLeads(): Promise<number>;
  deleteLead(id: string): Promise<void>;

  /**
   * O caminho do HUMANO: a ficha corrigida à mão na tela de detalhe. Também recusa as
   * datas de prazo — quem as grava é `confirmarPrazo`, que exige saber quem confirmou.
   */
  updateLead(id: string, patch: Partial<Lead>): Promise<Lead>;

  /**
   * CONFIRMAÇÃO DE PRAZO — o único caminho por onde uma data de prazo entra no sistema,
   * e ele exige o nome de quem confirmou. A IA sinaliza (`temPrazoCorrendo`); a data
   * vem de uma pessoa que ligou e perguntou. Um contador regressivo em cima de uma data
   * inferida pelo modelo é o erro que faz alguém perder prazo.
   */
  confirmarPrazo(
    id: string,
    dados: { tipo: Lead["prazoTipo"]; notificacao?: string | null; limite?: string | null },
    autor: string,
  ): Promise<Lead>;

  /** Um humano assume o atendimento. Marca o relógio do "tempo até primeiro contato". */
  assumirLead(id: string, usuarioId: string | null, autor: string): Promise<Lead>;

  /**
   * O humano discorda da IA. Grava a nova classificação E o par (de → para): esse par é
   * o dado que calibra o agente, e some se só o valor final for guardado.
   */
  reclassificarLead(
    id: string,
    para: Classificacao,
    autor: string,
    motivo?: string,
  ): Promise<Lead>;
  listReclassificacoes(): Promise<Reclassificacao[]>;

  /**
   * SAÚDE DA OPERAÇÃO — o que quebrou sem derrubar nada.
   *
   * `registrarEventoOperacao` nunca lança: ele é chamado de dentro do atendimento, e
   * um problema no registro do erro não pode virar um segundo erro. A transcrição que
   * falhou já degradou com elegância; o que não pode é degradar em silêncio.
   */
  registrarEventoOperacao(
    e: Omit<EventoOperacao, "id" | "criadoEm" | "contato">,
  ): Promise<void>;
  listEventosOperacao(opts?: {
    tipo?: TipoEventoOperacao;
    desde?: string;
    apenasPendentes?: boolean;
    limit?: number;
  }): Promise<EventoOperacao[]>;
  resolverEventoOperacao(id: string, quem: string): Promise<void>;

  /** Retornos agendados. A nota é o que faz o lembrete servir para alguma coisa. */
  criarLembrete(l: { leadId: string; quando: string; nota: string; autor: string }): Promise<Lembrete>;
  listLembretes(opts?: { leadId?: string; apenasPendentes?: boolean }): Promise<Lembrete[]>;
  concluirLembrete(id: string, quem: string): Promise<void>;

  /** Log de acesso e de exportação (LGPD): quem, o quê, quando. */
  registrarAcesso(entry: Omit<AccessLogEntry, "id" | "criadoEm">): Promise<void>;
  listAcessos(limit?: number): Promise<AccessLogEntry[]>;

  /**
   * Retenção: apaga leads descartados (CURIOSO/DPU/FORA_ESCOPO) parados há mais de
   * `dias`. Devolve quantos saíram. Nunca toca em quem foi resgatado ou está na fila.
   */
  purgarDescartados(dias: number): Promise<number>;

  scheduleFollowup(conversationId: string, message: string, scheduledAt: string): Promise<Followup>;
  listPendingFollowups(): Promise<Followup[]>;
  updateFollowupStatus(id: string, status: FollowupStatus): Promise<void>;
  cancelPendingFollowups(conversationId: string): Promise<void>;

  getConfig<T = unknown>(key: string): Promise<T | null>;
  setConfig(key: string, value: unknown): Promise<void>;

  // ───────────────────────────────────────────────────────────────────────────
  // ATIVAÇÃO DO AGENTE — ver lib/agent/ativacao.ts para as regras.
  // ───────────────────────────────────────────────────────────────────────────

  listInstancias(): Promise<ZapiInstancia[]>;
  getInstancia(id: string): Promise<ZapiInstancia | null>;
  /** Resolve a instância pelo `instanceId` que a Z-API manda no payload do webhook. */
  getInstanciaPorInstanceId(instanceId: string): Promise<ZapiInstancia | null>;
  /**
   * Cadastra uma instância. AMBIENTE E ATIVAÇÃO NÃO ENTRAM AQUI de propósito: ela nasce
   * em teste e desligada, sempre. Promover e ativar são dois gestos deliberados depois,
   * cada um com o seu registro de auditoria. O banco reforça com um trigger.
   */
  criarInstancia(dados: {
    nome: string; instanceId: string; token: string;
    clientToken?: string | null; baseUrl?: string;
  }): Promise<ZapiInstancia>;
  /** Credenciais, nome, modo de desligado, SLA e ambiente. NÃO liga nem desliga. */
  atualizarInstancia(
    id: string,
    patch: Partial<Pick<ZapiInstancia,
      "nome" | "instanceId" | "token" | "clientToken" | "baseUrl" |
      "ambiente" | "modoDesligado" | "respostaFixa" | "slaMinutos">>,
  ): Promise<ZapiInstancia>;
  /**
   * NÍVEL 2 — o único caminho que mexe em `ativo`, e ele exige saber quem foi. Ligar uma
   * instância NUNCA toca em nenhuma outra: é uma linha, um UPDATE, um id.
   */
  definirAtivacaoInstancia(id: string, ativo: boolean, autor: string): Promise<ZapiInstancia>;
  excluirInstancia(id: string): Promise<void>;

  /** Modo sombra: grava a resposta que o agente teria dado. Nunca lança. */
  criarRascunho(r: {
    conversationId: string; messageId?: string | null; texto: string;
    botoes?: Array<{ id: string; label: string }> | null;
  }): Promise<RascunhoAgente | null>;
  listRascunhos(opts?: {
    conversationId?: string; status?: RascunhoStatus; limit?: number;
  }): Promise<RascunhoAgente[]>;
  getRascunho(id: string): Promise<RascunhoAgente | null>;
  /**
   * A decisão sobre um rascunho. `textoEnviado` diferente de `texto` = a pessoa editou —
   * e é esse par que vira dado de treinamento. Só decide rascunho PENDENTE: devolve null
   * se outro atendente chegou antes (dois cliques em "enviar" não mandam duas mensagens).
   */
  decidirRascunho(
    id: string,
    decisao: { status: "enviado" | "descartado"; textoEnviado?: string | null; motivo?: string | null },
    autor: string,
  ): Promise<RascunhoAgente | null>;

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

  getUserByEmail(email: string): Promise<User | null>;
  createUser(data: { email: string; passwordHash: string; name?: string; role?: User["role"]; setor?: string | null }): Promise<User>;
  listUsers(): Promise<Array<Omit<User, "passwordHash">>>;
  updateUserPassword(id: string, passwordHash: string): Promise<void>;
}
