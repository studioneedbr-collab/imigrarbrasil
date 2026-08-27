import type { Repository } from "@/lib/data/repository";
import type {
  Conversation, Message, MessageMedia, DocumentItem, Lead, Followup,
  FollowupStatus, Cliente, FlowStateId, TransferTicket, User,
  Classificacao, Reclassificacao, AccessLogEntry, EventoOperacao, TipoEventoOperacao, Lembrete,
} from "@/lib/domain/types";
import { eFiltrada } from "@/lib/domain/types";
import { semCamposDePrazo } from "@/lib/data/prazo";
import type { ActivityMessage } from "@/lib/notifications/new-messages";

let counter = 0;
const id = (p: string) => `${p}_${(++counter).toString(36)}_${Math.floor(performance.now())}`;
const now = () => new Date().toISOString();

export class MemoryRepository implements Repository {
  private conversations = new Map<string, Conversation>();
  private byNumber = new Map<string, string>();
  private messages = new Map<string, Message[]>();
  private leads = new Map<string, Lead>(); // key = conversationId
  private followups: Followup[] = [];
  private config = new Map<string, unknown>();
  private clientes = new Map<string, Cliente>();
  private tickets = new Map<string, TransferTicket>();
  private users = new Map<string, User>(); // key = lowercased email
  private reclassificacoes: Reclassificacao[] = [];
  private acessos: AccessLogEntry[] = [];
  private eventos: EventoOperacao[] = [];
  private lembretes: Lembrete[] = [];

  async getOrCreateConversation(whatsappNumber: string, contactName?: string): Promise<Conversation> {
    const existing = this.byNumber.get(whatsappNumber);
    if (existing) return this.conversations.get(existing)!;
    const conv: Conversation = {
      id: id("conv"), whatsappNumber, contactName: contactName ?? null,
      status: "active", leadScore: 0, createdAt: now(), updatedAt: now(),
      estadoAtual: "S0", lastMessageAt: now(), followupSentAt: null, reopenedAt: null,
      assumedBy: null, assumedAt: null,
    };
    this.conversations.set(conv.id, conv);
    this.byNumber.set(whatsappNumber, conv.id);
    this.messages.set(conv.id, []);
    return conv;
  }
  async getConversation(cid: string) { return this.conversations.get(cid) ?? null; }
  async updateConversation(cid: string, patch: Partial<Conversation>) {
    const c = this.conversations.get(cid);
    if (!c) throw new Error(`Conversation not found: ${cid}`);
    const updated = { ...c, ...patch, updatedAt: now() };
    this.conversations.set(cid, updated);
    return updated;
  }
  async listConversations() { return Array.from(this.conversations.values()); }
  async deleteConversation(id: string) {
    this.conversations.delete(id);
    this.messages.delete(id);
    this.leads.delete(id);
    for (const [k, t] of Array.from(this.tickets.entries())) {
      if (t.conversationId === id) this.tickets.delete(k);
    }
  }
  async updateConversationStatus(id: string, status: Conversation["status"]) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, status, updatedAt: now() });
  }
  async updateLastMessageAt(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, lastMessageAt: now() });
  }

  // Atendimento humano: só estes dois métodos mexem em assumedBy. Encaminhar para um
  // setor NÃO assume a conversa — a Ana segue atendendo até alguém entrar de fato.
  async assumeConversation(id: string, who: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, assumedBy: who, assumedAt: now(), status: "transferred", updatedAt: now() });
  }
  async releaseConversation(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, assumedBy: null, assumedAt: null, status: "active", updatedAt: now() });
  }
  async markFollowupSent(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, followupSentAt: now() });
  }
  async getConversationsForFollowup() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return Array.from(this.conversations.values()).filter(
      (c) => c.status === "waiting" && !c.followupSentAt && !c.optOutAt && !c.noFollowupAt
        && new Date(c.lastMessageAt ?? c.updatedAt).getTime() < cutoff,
    );
  }
  async marcarOptOut(id: string, tipo: "bloquear" | "sem_followup") {
    const c = this.conversations.get(id);
    if (!c) return;
    const campo = tipo === "bloquear" ? "optOutAt" : "noFollowupAt";
    this.conversations.set(id, { ...c, [campo]: now(), updatedAt: now() });
  }
  async getInactiveConversations() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return Array.from(this.conversations.values()).filter(
      (c) => c.status === "waiting" && !!c.followupSentAt && new Date(c.followupSentAt).getTime() < cutoff,
    );
  }

  async addMessage(conversationId: string, role: "user" | "assistant", content: string, whatsappMessageId?: string, media?: MessageMedia) {
    const msg: Message = {
      id: id("msg"), conversationId, role, content,
      whatsappMessageId: whatsappMessageId ?? null, createdAt: now(),
      mediaUrl: media?.url ?? null, mediaType: media?.kind ?? null,
      mediaName: media?.name ?? null, mediaText: media?.text ?? null,
    };
    if (!this.messages.has(conversationId)) this.messages.set(conversationId, []);
    this.messages.get(conversationId)!.push(msg);
    return msg;
  }
  async listMessages(conversationId: string) { return this.messages.get(conversationId) ?? []; }
  async listMessagesForConversations(conversationIds: string[]) {
    const out = new Map<string, Message[]>();
    for (const id of conversationIds) out.set(id, this.messages.get(id) ?? []);
    return out;
  }
  async setMessageMediaText(messageId: string, text: string) {
    for (const list of Array.from(this.messages.values())) {
      const m = list.find((x) => x.id === messageId);
      if (m) { m.mediaText = text; return; }
    }
  }
  async listDocuments(opts?: { conversationId?: string; limit?: number }): Promise<DocumentItem[]> {
    const out: DocumentItem[] = [];
    for (const [convId, list] of Array.from(this.messages.entries())) {
      if (opts?.conversationId && convId !== opts.conversationId) continue;
      const conv = this.conversations.get(convId);
      for (const m of list) {
        if (!m.mediaUrl) continue;
        out.push({
          messageId: m.id, conversationId: convId,
          contactName: conv?.contactName ?? null,
          whatsappNumber: conv?.whatsappNumber ?? "",
          url: m.mediaUrl, kind: m.mediaType ?? "document",
          name: m.mediaName ?? "documento", text: m.mediaText ?? null,
          createdAt: m.createdAt,
        });
      }
    }
    out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return out.slice(0, opts?.limit ?? 200);
  }
  async hasWhatsappMessage(whatsappMessageId: string): Promise<boolean> {
    for (const list of Array.from(this.messages.values())) {
      if (list.some((m) => m.whatsappMessageId === whatsappMessageId)) return true;
    }
    return false;
  }
  async listRecentUserMessages(limit: number): Promise<ActivityMessage[]> {
    const out: ActivityMessage[] = [];
    for (const list of Array.from(this.messages.values())) {
      for (const m of list) {
        if (m.role !== "user") continue;
        out.push({
          id: m.id,
          conversationId: m.conversationId,
          contactName: this.conversations.get(m.conversationId)?.contactName ?? null,
          createdAt: m.createdAt,
        });
      }
    }
    out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return out.slice(0, limit);
  }

  async upsertLead(conversationId: string, patch: Partial<Lead>) {
    const existing = this.leads.get(conversationId);
    const conv = this.conversations.get(conversationId);
    const defaults: Lead = {
      id: id("lead"), conversationId,
      whatsappNumber: conv?.whatsappNumber ?? "", status: "new",
      createdAt: now(), updatedAt: now(),
      stage: "novo", score: 0,
      temPrazoCorrendo: false, atendimentoStatus: "novo",
    };
    // Datas de prazo caem fora: este é o caminho do agente. Ver lib/data/prazo.ts.
    const limpo = semCamposDePrazo(patch);
    // A PRIMEIRA classificação da IA fica guardada à parte. É o denominador da taxa de
    // reclassificação — sobrescrevê-la a cada turno apagaria a discordância humana.
    const classificacaoIa =
      existing?.classificacaoIa ?? (limpo.classificacao as Classificacao | undefined) ?? null;
    const lead: Lead = { ...defaults, ...existing, ...limpo, classificacaoIa, updatedAt: now() };
    this.leads.set(conversationId, lead);
    return lead;
  }
  private salvar(lead: Lead): Lead {
    this.leads.set(lead.conversationId, lead);
    return lead;
  }
  private acharLead(id: string): Lead | null {
    for (const l of Array.from(this.leads.values())) if (l.id === id) return l;
    return null;
  }
  async getLead(id: string) { return this.acharLead(id); }
  async updateLead(id: string, patch: Partial<Lead>) {
    const atual = this.acharLead(id);
    if (!atual) throw new Error("Lead não encontrado.");
    // `classificacao` não passa por aqui: mudá-la é reclassificar, e reclassificar
    // registra o par (de → para). Ver `reclassificarLead`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descartada de propósito
    const { classificacao, ...resto } = semCamposDePrazo(patch);
    return this.salvar({ ...atual, ...resto, updatedAt: now() });
  }
  async confirmarPrazo(
    leadId: string,
    dados: { tipo: Lead["prazoTipo"]; notificacao?: string | null; limite?: string | null },
    autor: string,
  ) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    return this.salvar({
      ...atual,
      temPrazoCorrendo: true,
      prazoTipo: dados.tipo ?? atual.prazoTipo ?? null,
      prazoDataNotificacao: dados.notificacao ?? null,
      prazoDataLimite: dados.limite ?? null,
      prazoConfirmadoPor: autor,
      prazoConfirmadoEm: now(),
      updatedAt: now(),
    });
  }
  async assumirLead(leadId: string, usuarioId: string | null, autor: string) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    const salvo = this.salvar({
      ...atual,
      responsavelId: usuarioId,
      // Só o PRIMEIRO a assumir marca o relógio: o tempo até o primeiro contato humano
      // não pode ser reiniciado por uma troca de responsável no dia seguinte.
      assumidoEm: atual.assumidoEm ?? now(),
      atendimentoStatus: atual.atendimentoStatus === "novo" ? "em_atendimento" : atual.atendimentoStatus,
      updatedAt: now(),
    });
    await this.registrarAcesso({ autor, acao: "assumiu_lead", alvoTipo: "lead", alvoId: leadId });
    return salvo;
  }
  async reclassificarLead(leadId: string, para: Classificacao, autor: string, motivo?: string) {
    const atual = this.acharLead(leadId);
    if (!atual) throw new Error("Lead não encontrado.");
    const de = atual.classificacao ?? null;
    this.reclassificacoes.push({
      id: id("reclass"), leadId, de, para, motivo: motivo ?? null, autor, criadoEm: now(),
    });
    // Resgate = sair do descarte por mão humana. É a métrica que denuncia um agente
    // filtrando demais, então é marcada exatamente aqui, e não no clique do botão.
    const resgate = eFiltrada(de) && !eFiltrada(para);
    return this.salvar({
      ...atual,
      classificacao: para,
      resgatadoEm: resgate ? now() : atual.resgatadoEm,
      resgatadoPor: resgate ? autor : atual.resgatadoPor,
      updatedAt: now(),
    });
  }
  async listReclassificacoes() {
    return [...this.reclassificacoes].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }
  async registrarEventoOperacao(e: Omit<EventoOperacao, "id" | "criadoEm" | "contato">) {
    this.eventos.push({ ...e, id: id("evt"), criadoEm: now() });
  }
  async listEventosOperacao(opts: { tipo?: TipoEventoOperacao; desde?: string; apenasPendentes?: boolean; limit?: number } = {}) {
    let out = this.eventos.filter(
      (e) =>
        (!opts.tipo || e.tipo === opts.tipo) &&
        (!opts.desde || e.criadoEm >= opts.desde) &&
        (!opts.apenasPendentes || !e.resolvidoEm),
    );
    out = out.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    for (const e of out) {
      const conv = e.conversationId ? this.conversations.get(e.conversationId) : null;
      e.contato = conv ? { nome: conv.contactName, whatsappNumber: conv.whatsappNumber } : null;
    }
    return out.slice(0, opts.limit ?? 200);
  }
  async resolverEventoOperacao(eventoId: string, quem: string) {
    const e = this.eventos.find((x) => x.id === eventoId);
    if (e) { e.resolvidoEm = now(); e.resolvidoPor = quem; }
  }

  async criarLembrete(l: { leadId: string; quando: string; nota: string; autor: string }) {
    const lembrete: Lembrete = { ...l, id: id("lemb"), criadoEm: now() };
    this.lembretes.push(lembrete);
    return lembrete;
  }
  async listLembretes(opts: { leadId?: string; apenasPendentes?: boolean } = {}) {
    return this.lembretes
      .filter((l) => (!opts.leadId || l.leadId === opts.leadId) && (!opts.apenasPendentes || !l.feitoEm))
      .sort((a, b) => a.quando.localeCompare(b.quando));
  }
  async concluirLembrete(lembreteId: string, quem: string) {
    const l = this.lembretes.find((x) => x.id === lembreteId);
    if (l) { l.feitoEm = now(); l.feitoPor = quem; }
  }

  async registrarAcesso(entry: Omit<AccessLogEntry, "id" | "criadoEm">) {
    this.acessos.push({ ...entry, id: id("acesso"), criadoEm: now() });
  }
  async listAcessos(limit = 200) {
    return [...this.acessos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limit);
  }
  async purgarDescartados(dias: number) {
    const corte = Date.now() - dias * 86_400_000;
    let apagados = 0;
    for (const [k, l] of Array.from(this.leads.entries())) {
      if (eFiltrada(l.classificacao) && !l.resgatadoEm && Date.parse(l.updatedAt) <= corte) {
        this.leads.delete(k);
        apagados++;
      }
    }
    return apagados;
  }
  async getLeadByConversation(conversationId: string) { return this.leads.get(conversationId) ?? null; }
  async listLeads() { return Array.from(this.leads.values()); }
  async deleteLead(id: string) {
    for (const [k, v] of Array.from(this.leads.entries())) {
      if (v.id === id) { this.leads.delete(k); break; }
    }
  }

  async scheduleFollowup(conversationId: string, message: string, scheduledAt: string) {
    const f: Followup = { id: id("fup"), conversationId, message, scheduledAt, status: "pending", attempt: 1, createdAt: now() };
    this.followups.push(f);
    return f;
  }
  async listPendingFollowups() { return this.followups.filter((f) => f.status === "pending"); }
  async updateFollowupStatus(fid: string, status: FollowupStatus) {
    const f = this.followups.find((x) => x.id === fid); if (f) f.status = status;
  }
  async cancelPendingFollowups(conversationId: string) {
    for (const f of this.followups) {
      if (f.conversationId === conversationId && f.status === "pending") f.status = "cancelled";
    }
  }

  async getConfig<T = unknown>(key: string) { return (this.config.get(key) as T) ?? null; }
  async setConfig(key: string, value: unknown) { this.config.set(key, value); }

  async upsertCliente(patch: Partial<Cliente> & { id?: string }): Promise<Cliente> {
    const existing = patch.id
      ? this.clientes.get(patch.id)
      : patch.cpf ? Array.from(this.clientes.values()).find((c) => c.cpf === patch.cpf) : undefined;
    const clienteId = existing?.id ?? patch.id ?? id("cli");
    const merged: Cliente = {
      createdAt: existing?.createdAt ?? now(),
      ...existing, ...patch, id: clienteId,
    } as Cliente;
    this.clientes.set(merged.id, merged);
    return merged;
  }
  async getCliente(cid: string) { return this.clientes.get(cid) ?? null; }
  async listClientes() {
    return Array.from(this.clientes.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async updateCliente(cid: string, patch: Partial<Cliente>): Promise<Cliente> {
    const existing = this.clientes.get(cid);
    if (!existing) throw new Error(`Cliente not found: ${cid}`);
    const updated: Cliente = { ...existing, ...patch, id: cid };
    this.clientes.set(cid, updated);
    return updated;
  }
  async deleteCliente(cid: string): Promise<void> {
    this.clientes.delete(cid);
  }

  async setEstado(conversationId: string, estado: FlowStateId) {
    const c = this.conversations.get(conversationId);
    if (c) c.estadoAtual = estado;
  }
  async setHandoff(conversationId: string, to: string, reason: string) {
    const c = this.conversations.get(conversationId);
    if (c) { c.handedOffTo = to; c.handoffReason = reason; c.status = "transferred"; }
  }

  async createTransferTicket(data: Omit<TransferTicket, "id" | "createdAt">) {
    const t: TransferTicket = { id: id("tkt"), createdAt: now(), ...data };
    this.tickets.set(t.id, t);
    return t;
  }
  async listTransferTickets() { return Array.from(this.tickets.values()); }
  async listTransferTicketsByConversation(conversationId: string) {
    return Array.from(this.tickets.values()).filter((t) => t.conversationId === conversationId);
  }

  async getUserByEmail(email: string) {
    return this.users.get(email.toLowerCase()) ?? null;
  }
  async createUser(data: { email: string; passwordHash: string; name?: string; role?: User["role"]; setor?: string | null }): Promise<User> {
    const user: User = {
      id: id("user"), email: data.email, passwordHash: data.passwordHash,
      // Default 'atendente' (o mais restrito), nunca 'admin': quem precisa de mais pede.
      name: data.name, role: data.role ?? "atendente", setor: (data.setor as User["setor"]) ?? null, active: true, createdAt: now(),
    };
    this.users.set(data.email.toLowerCase(), user);
    return user;
  }
  async listUsers(): Promise<Array<Omit<User, "passwordHash">>> {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, setor: u.setor ?? null,
      active: u.active, createdAt: u.createdAt,
    }));
  }
  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    for (const [key, u] of Array.from(this.users.entries())) {
      if (u.id === id) { this.users.set(key, { ...u, passwordHash }); return; }
    }
  }

}
