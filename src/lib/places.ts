import { Meeting } from "@/types";

export const PRESET_PLACES = ["Teams", "対面", "その他"];

/** 候補：定番の場所 → 過去に使った場所（使用回数の多い順） */
export function placeOptions(meetings: Meeting[]): string[] {
  const count = new Map<string, number>();
  for (const m of meetings) if (m.place && !PRESET_PLACES.includes(m.place)) count.set(m.place, (count.get(m.place) ?? 0) + 1);
  return [...PRESET_PLACES, ...[...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).map(([p]) => p)];
}
