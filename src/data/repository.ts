import { Category, Holiday, Meeting } from "@/types";
import { defaultCategories, seedMeetings } from "./seed";
// 旧バージョンの ICS 取り込みで付けていた長いリンク名を短い名称に置き換える
const LEGACY_LINK_TITLES:Record<string,string>={"Teams 会議に参加":"Teams参加"};
const migrate=(items:Meeting[]):Meeting[]=>items.map(m=>m.links.some(l=>l.title in LEGACY_LINK_TITLES)?{...m,links:m.links.map(l=>l.title in LEGACY_LINK_TITLES?{...l,title:LEGACY_LINK_TITLES[l.title]}:l)}:m);
const MEETINGS="meeting-hub:meetings", CATEGORIES="meeting-hub:categories", HOLIDAYS="meeting-hub:holidays";
export const repository = {
  loadMeetings(): Meeting[] { const v=localStorage.getItem(MEETINGS); if(v) return migrate(JSON.parse(v)); this.saveMeetings(seedMeetings); return seedMeetings; },
  saveMeetings(items:Meeting[]) { localStorage.setItem(MEETINGS,JSON.stringify(items)); },
  loadCategories(): Category[] { const v=localStorage.getItem(CATEGORIES); if(v) return JSON.parse(v); this.saveCategories(defaultCategories); return defaultCategories; },
  saveCategories(items:Category[]) { localStorage.setItem(CATEGORIES,JSON.stringify(items)); },
  loadHolidays(): Holiday[] { const v=localStorage.getItem(HOLIDAYS); return v?JSON.parse(v):[]; },
  saveHolidays(items:Holiday[]) { localStorage.setItem(HOLIDAYS,JSON.stringify(items)); },
  parseCsv(raw:string,categories:Category[]):{meetings:Meeting[];categories:Category[]} {
    const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
    const split=(line:string)=>{const values:string[]=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){value+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){values.push(value);value=""}else value+=c}values.push(value);return values};
    const headers=split(lines.shift()??"").map(x=>x.trim()), get=(row:string[],name:string)=>row[headers.indexOf(name)]?.trim()??""; let next=[...categories];
    const meetings=lines.map((line,n)=>{const row=split(line),name=get(row,"分類")||"その他";let category=next.find(c=>c.name===name);if(!category){category={id:`csv-${n}-${name}`,name,color:"blue"};next.push(category)}const link=get(row,"リンクメモ"),teams=get(row,"Teamsリンク"),task=get(row,"自分タスク"),now=new Date().toISOString();return {id:crypto.randomUUID(),date:get(row,"年月日").replace(/年|月/g,"-").replace("日","").replaceAll("/","-"),place:(["Teams","対面","その他"].includes(get(row,"場所"))?get(row,"場所"):"その他") as Meeting["place"],category:category.id,title:get(row,"議題")||"無題の会議",important:false,memo:get(row,"メモ"),tags:[],links:[...(link?[{id:crypto.randomUUID(),title:"関連メモ",url:link,type:"document" as const}]:[]),...(teams?[{id:crypto.randomUUID(),title:"Teams",url:teams,type:"teams" as const}]:[])],tasks:task?[{id:crypto.randomUUID(),title:task,completed:false}]:[],createdAt:now,updatedAt:now}});return {meetings,categories:next};
  },
  exportData(meetings:Meeting[],categories:Category[],holidays:Holiday[]) { return JSON.stringify({version:1,exportedAt:new Date().toISOString(),meetings,categories,holidays},null,2); },
  parseImport(raw:string):{meetings:Meeting[];categories:Category[];holidays:Holiday[]} { const data=JSON.parse(raw); if(!Array.isArray(data.meetings)) throw new Error("meetings がありません"); return {meetings:migrate(data.meetings),categories:Array.isArray(data.categories)?data.categories:defaultCategories,holidays:Array.isArray(data.holidays)?data.holidays:[]}; }
};
