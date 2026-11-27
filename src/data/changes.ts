import type { Category, Holiday, Meeting } from "@/types";

// クライアントと Worker で共有する同期データの型と差分計算。
// 前回サーバーと一致していた内容（base）と現在の内容を比べ、変わったレコードだけを送る。
// レコード単位で反映するので、他の端末が別の会議を編集していても上書きしない。

export interface DataSet { meetings: Meeting[]; categories: Category[]; holidays: Holiday[] }
export type SortedCategory = Category & { sort: number };
export interface ChangeSet {
  meetings: { put: Meeting[]; del: string[] };
  categories: { put: SortedCategory[]; del: string[] };
  holidays: { put: Holiday[]; del: Holiday[] };
}
export interface RemoteData extends DataSet { revision: number; user?: string }

export const holidayKey = (h: Holiday) => `${h.date}:${h.kind}`;

function diffBy<T>(base: T[], next: T[], key: (x: T) => string) {
  const before = new Map(base.map(x => [key(x), JSON.stringify(x)]));
  const after = new Set<string>();
  const put: T[] = [];
  for (const x of next) {
    const k = key(x);
    after.add(k);
    if (before.get(k) !== JSON.stringify(x)) put.push(x);
  }
  const del = base.filter(x => !after.has(key(x)));
  return { put, del };
}

const withSort = (items: Category[]): SortedCategory[] => items.map((c, sort) => ({ ...c, sort }));

export function diff(base: DataSet, next: DataSet): ChangeSet {
  const m = diffBy(base.meetings, next.meetings, x => x.id);
  const c = diffBy(withSort(base.categories), withSort(next.categories), x => x.id);
  const h = diffBy(base.holidays, next.holidays, holidayKey);
  return {
    meetings: { put: m.put, del: m.del.map(x => x.id) },
    categories: { put: c.put, del: c.del.map(x => x.id) },
    holidays: h,
  };
}

export const isEmpty = (c: ChangeSet) =>
  !c.meetings.put.length && !c.meetings.del.length && !c.categories.put.length && !c.categories.del.length && !c.holidays.put.length && !c.holidays.del.length;

/** サーバーの最新データに、まだ送っていない手元の変更を重ねる（他端末の更新を残したまま、自分の編集を優先する） */
export function rebase(remote: DataSet, pending: ChangeSet): DataSet {
  const meetings = new Map(remote.meetings.map(m => [m.id, m]));
  for (const m of pending.meetings.put) meetings.set(m.id, m);
  for (const id of pending.meetings.del) meetings.delete(id);

  const categories = new Map(withSort(remote.categories).map(c => [c.id, c]));
  for (const c of pending.categories.put) categories.set(c.id, c);
  for (const id of pending.categories.del) categories.delete(id);

  const holidays = new Map(remote.holidays.map(h => [holidayKey(h), h]));
  for (const h of pending.holidays.put) holidays.set(holidayKey(h), h);
  for (const h of pending.holidays.del) holidays.delete(holidayKey(h));

  return {
    meetings: [...meetings.values()],
    categories: [...categories.values()].sort((a, b) => a.sort - b.sort).map(({ sort: _sort, ...c }) => c),
    holidays: [...holidays.values()],
  };
}
