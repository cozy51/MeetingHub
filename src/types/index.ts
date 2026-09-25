/** 場所（「Teams」「対面」「その他」のほか、会議室名などの自由入力） */
export type Place = string;
export type LinkType = "document" | "teams" | "other";
export interface MeetingLink { id: string; title: string; url: string; type: LinkType }
export interface MeetingTask { id: string; title: string; completed: boolean; dueDate?: string }
export interface Category { id: string; name: string; color: string }
export interface Meeting {
  id: string; date: string; startTime?: string; endTime?: string; place: Place; category: string; title: string; important: boolean;
  memo: string; tags: string[]; links: MeetingLink[]; tasks: MeetingTask[]; icsUid?: string; createdAt: string; updatedAt: string;
}
export type HolidayKind = "self" | "company";
export interface Holiday { date: string; kind: HolidayKind }
export type View = "all" | "today" | "week" | "tasks" | "incomplete" | "important" | "categories" | "settings";
export interface Filters { category: string; place: string; from: string; to: string; important: boolean; hasTasks: boolean; incomplete: boolean }
