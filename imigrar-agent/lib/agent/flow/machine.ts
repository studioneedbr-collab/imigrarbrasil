import type { FlowStateId } from "@/lib/domain/types";
import { STATES } from "@/lib/agent/flow/states";

export function initialState(): FlowStateId { return "S0"; }

export interface Transition { state: FlowStateId; reply: string; transfer?: boolean; terminal?: boolean; }

export function nextState(current: FlowStateId, input: string): Transition {
  const def = STATES[current];
  const choice = input.trim();
  if (def.options?.["*"]) {
    const dest = def.options["*"]; const d = STATES[dest];
    return { state: dest, reply: d.message, transfer: d.transfer, terminal: d.terminal };
  }
  if (def.options?.[""]) {
    const dest = def.options[""]; const d = STATES[dest];
    return { state: dest, reply: d.message, transfer: d.transfer, terminal: d.terminal };
  }
  const dest = def.options?.[choice];
  if (!dest) {
    return { state: current, reply: `Não entendi. Por favor, digite uma opção válida.\n${def.message}` };
  }
  const d = STATES[dest];
  return { state: dest, reply: d.message, transfer: d.transfer, terminal: d.terminal };
}
