// Credit cost per generation. Tune so credits sold > GPU seconds cost.
// Sell credits at ~$0.10 each. Costs below already include margin.
export const COST: Record<string, number> = {
  image: 1,   // FLUX-schnell ~2s GPU  -> ~$0.003 cost, charge $0.10
  voice: 1,   // Kokoro ~1s GPU        -> ~$0.001 cost, charge $0.10
  video: 5,   // LTX 5s clip ~60-90s   -> ~$0.05-0.07 cost, charge $0.50
};

export type Modality = keyof typeof COST;

export function isModality(x: string): x is Modality {
  return x === "image" || x === "video" || x === "voice";
}
