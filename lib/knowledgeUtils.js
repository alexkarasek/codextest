import { getKnowledgePack } from "./storage.js";

export function normalizeKnowledgePackIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export async function resolveKnowledgePacks(ids) {
  const packs = [];
  const uniqueIds = normalizeKnowledgePackIds(ids);
  for (const id of uniqueIds) {
    const pack = await getKnowledgePack(id);
    packs.push(pack);
  }
  return packs;
}

export function mergeKnowledgePacks(...lists) {
  const map = new Map();
  lists
    .filter(Boolean)
    .forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((pack) => {
        if (pack && pack.id && !map.has(pack.id)) map.set(pack.id, pack);
      });
    });
  return [...map.values()];
}
