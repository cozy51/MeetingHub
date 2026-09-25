export type Place = "Teams" | "対面" | "その他";
export type LinkType = "document" | "teams" | "other";
export interface MeetingLink { id: string; title: string; url: string; type: LinkType }
export interface MeetingTask { id: string; title: string; completed: boolean; dueDate?: string }
export interface Category { id: string; name: string; color: string }
export interface Meeting {
  id: string; date: string; place: Place; category: string; title: string; important: boolean;
  memo: string; tags: string[]; links: MeetingLink[]; tasks: MeetingTask[]; createdAt: string; updatedAt: string;
}
export type View = "all" | "today" | "week" | "tasks" | "incomplete" | "important" | "categories" | "settings";
export interface Filters { category: string; place: string; from: string; to: string; important: boolean; hasTasks: boolean; incomplete: boolean }
