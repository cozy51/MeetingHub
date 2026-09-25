import { Meeting } from "@/types";

export const PRESET_PLACES = ["Teams", "対面", "その他"];

/** 候補：定番の場所 → 過去に使った場所（使用回数の多い順） */
export function placeOptions(meetings: Meeting[]): string[] {
  const count = new Map<string, number>();
  for (const m of meetings) if (m.place && !PRESET_PLACES.includes(m.place)) count.set(m.place, (count.get(m.place) ?? 0) + 1);
  return [...PRESET_PLACES, ...[...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).map(([p]) => p)];
}

// オンライン会議とみなす場所（部分一致・大文字小文字無視）
const ONLINE = /teams|zoom|google\s*meet|meet\.google|webex|skype|slack|オンライン|web会議|ウェブ会議|リモート|online|remote/i;
/** 移動が必要な場所か（オンラインでも、場所未定の「その他」でもない） */
export const isOnsite = (place: string) => Boolean(place.trim()) && place.trim() !== "その他" && !ONLINE.test(place);
