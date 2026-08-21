import type { Repository } from "@/lib/data/repository";
import type {
  Conversation, Message, MessageMedia, DocumentItem, Lead, Proposal, Followup, ServiceCatalogItem,
  ProposalStatus, ProposalEmailStatus, FollowupStatus, Cliente, FlowStateId, TransferTicket, User, Funcionario,
} from "@/lib/domain/types";
import { SEED_SERVICES } from "@/lib/agent/catalog";
import { calcularPreco } from "@/lib/agent/pricing";
import { DEFAULT_PRICING, type PricingParams } from "@/lib/agent/pricing-params";
import type { ActivityMessage } from "@/lib/notifications/new-messages";

let counter = 0;
const id = (p: string) => `${p}_${(++counter).toString(36)}_${Math.floor(performance.now())}`;
const now = () => new Date().toISOString();

export class MemoryRepository implements Repository {
  private conversations = new Map<string, Conversation>();
  private byNumber = new Map<string, string>();
  private messages = new Map<string, Message[]>();
  private leads = new Map<string, Lead>(); // key = conversationId
  private proposals: Proposal[] = [];
  private followups: Followup[] = [];
  private config = new Map<string, unknown>();
  private services: ServiceCatalogItem[];
  private clientes = new Map<string, Cliente>();
  private tickets = new Map<string, TransferTicket>();
  private functionPricing = new Map<string, PricingParams>();
  private users = new Map<string, User>(); // key = lowercased email
  private funcionarios = new Map<string, Funcionario>();

  constructor() {
    this.services = SEED_SERVICES.map((s) => {
      const price = calcularPreco({ serviceName: s.name, employeesCount: 1, schedule: s.schedule });
      return { ...s, id: id("svc"), costPerEmployee: price.unitCost, salePrice: price.unitSalePrice };
    });
    for (const p of DEFAULT_PRICING) {
      this.functionPricing.set(p.functionName.toLowerCase(), { ...p });
    }
  }

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
  // setor NÃO assume a conversa — a Shayene segue atendendo até alguém entrar de fato.
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
    };
    const lead: Lead = { ...defaults, ...existing, ...patch, updatedAt: now() };
    this.leads.set(conversationId, lead);
    return lead;
  }
  async getLeadByConversation(conversationId: string) { return this.leads.get(conversationId) ?? null; }
  async listLeads() { return Array.from(this.leads.values()); }
  async deleteLead(id: string) {
    for (const [k, v] of Array.from(this.leads.entries())) {
      if (v.id === id) { this.leads.delete(k); break; }
    }
  }

  async createProposal(data: Omit<Proposal, "id" | "createdAt" | "status"> & { status?: ProposalStatus }) {
    const proposal: Proposal = { ...data, id: id("prop"), status: data.status ?? "sent", createdAt: now() };
    this.proposals.push(proposal);
    return proposal;
  }
  async updateProposalStatus(pid: string, status: ProposalStatus) {
    const p = this.proposals.find((x) => x.id === pid); if (p) p.status = status;
  }
  async updateProposalEmailStatus(pid: string, emailStatus: ProposalEmailStatus) {
    const p = this.proposals.find((x) => x.id === pid); if (p) p.emailStatus = emailStatus;
  }
  async deleteProposal(id: string) { this.proposals = this.proposals.filter((p) => p.id !== id); }
  async getProposal(id: string) { return this.proposals.find((p) => p.id === id) ?? null; }
  async listProposals() { return this.proposals; }
  async hasProposalForConversation(conversationId: string) {
    return this.proposals.some((p) => p.conversationId === conversationId);
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

  async listServices() { return this.services; }
  async getService(name: string) {
    return this.services.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

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

  async listFunctionPricing() { return Array.from(this.functionPricing.values()); }
  async getFunctionPricing(name: string) {
    return this.functionPricing.get(name.toLowerCase()) ?? null;
  }
  async upsertFunctionPricing(params: PricingParams) {
    const saved = { ...params };
    this.functionPricing.set(params.functionName.toLowerCase(), saved);
    return saved;
  }
  async deleteFunctionPricing(functionName: string) {
    this.functionPricing.delete(functionName.toLowerCase());
  }

  async getUserByEmail(email: string) {
    return this.users.get(email.toLowerCase()) ?? null;
  }
  async createUser(data: { email: string; passwordHash: string; name?: string; role?: "admin" | "user"; setor?: string | null }): Promise<User> {
    const user: User = {
      id: id("user"), email: data.email, passwordHash: data.passwordHash,
      // Default 'user', não 'admin': quem precisa de admin pede explicitamente.
      name: data.name, role: data.role ?? "user", setor: (data.setor as User["setor"]) ?? null, active: true, createdAt: now(),
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

  async listFuncionarios() {
    return Array.from(this.funcionarios.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createFuncionario(data: { nome: string; cpf?: string; cargo?: string; setor?: string; telefone?: string; email?: string }): Promise<Funcionario> {
    const funcionario: Funcionario = {
      id: id("func"), nome: data.nome, cpf: data.cpf, cargo: data.cargo, setor: data.setor,
      telefone: data.telefone, email: data.email, active: true, createdAt: now(),
    };
    this.funcionarios.set(funcionario.id, funcionario);
    return funcionario;
  }
}
