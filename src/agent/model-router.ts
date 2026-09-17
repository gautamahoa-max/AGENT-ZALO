import type { AgentProfile } from "../config/agent-store.js";

export type RoutingMessage = { text: string; images: unknown[] };
export type ModelTier = "main" | "fast";

const fold = (text: string): string =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const LIGHTWEIGHT = [
  /^(xin )?chao( anh| chi| em| ban| bot)?$/,
  /^(hi|hello|alo)( anh| chi| em| ban| bot)?$/,
  /^(da )?(cam on|thanks|thank you)( anh| chi| em| ban| bot)?$/,
  /^(ok|oke|okay|da|vang|da vang|da ro|hieu roi|duoc roi)$/,
];

export function isLightweightTurn(batch: RoutingMessage[]): boolean {
  if (batch.length === 0 || batch.length > 3 || batch.some((m) => m.images.length > 0)) return false;
  const text = fold(batch.map((m) => m.text).join(" "));
  return text.length > 0 && text.length <= 80 && LIGHTWEIGHT.some((pattern) => pattern.test(text));
}

export function routeModelForTurn(input: {
  agent: AgentProfile;
  batch: RoutingMessage[];
  fastModel: string;
  isolated: boolean;
}): { agent: AgentProfile; tier: ModelTier } {
  // Agent đã ghim model riêng luôn thắng cấu hình chung; job lịch hẹn và mọi
  // nội dung không khớp whitelist tuyệt đối đều dùng model chính.
  if (input.isolated || input.agent.modelName || !input.fastModel.trim() || !isLightweightTurn(input.batch)) {
    return { agent: input.agent, tier: "main" };
  }
  return {
    agent: {
      ...input.agent,
      modelName: input.fastModel.trim(),
      reasoningEffort: "off",
      maxSteps: Math.min(input.agent.maxSteps ?? 2, 2),
    },
    tier: "fast",
  };
}
