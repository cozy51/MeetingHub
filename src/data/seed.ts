import { Category, Meeting } from "@/types";

export const defaultCategories: Category[] = [
  ["1on1","1on1","blue"],["regular","定例","violet"],["bug","不具合進捗","green"],["weekly","週次進捗","emerald"],
  ["briefing","社内説明会","indigo"],["group-short","グループ行動ショート","cyan"],["group-long","グループ行動ロング","teal"],
  ["interdept","部門間打ち合わせ","orange"],["other","その他","slate"],
].map(([id,name,color]) => ({ id, name, color }));

const make = (id:string,date:string,category:string,title:string,extra:Partial<Meeting>={}):Meeting => ({
  id,date,place:"Teams",category,title,important:false,memo:"",tags:[],links:[],tasks:[],createdAt:"2026-09-01T00:00:00.000Z",updatedAt:"2026-09-01T00:00:00.000Z",...extra
});
export const seedMeetings: Meeting[] = [
  make("m1","2026-09-08","group-short","SRC350-M3の現状把握",{links:[{id:"l1",title:"9/8 Gショート",url:"https://teams.microsoft.com",type:"teams"}]}),
  make("m2","2026-09-11","1on1","定例（進捗確認）",{tasks:[{id:"t1",title:"次回までの確認事項を整理",completed:true}]}),
  make("m3","2026-09-11","interdept","新入社員研修の発表会",{important:true,links:[{id:"l2",title:"発表会資料",url:"https://example.com",type:"document"}]}),
  make("m4","2026-09-16","briefing","3DEX勉強会",{memo:"操作マニュアルと活用事例を確認。",tasks:[{id:"t2",title:"3DEX資料確認",completed:true}]}),
  make("m5","2026-09-24","group-long","業務資料の整理、作成",{important:true,tags:["資料整理"],links:[{id:"l3",title:"9/24 グループ行動ロング",url:"https://example.com/docs",type:"document"},{id:"l4",title:"Teams 投稿",url:"https://teams.microsoft.com",type:"teams"}],tasks:[{id:"t3",title:"評価項目を整理する",completed:false,dueDate:"2026-09-25"},{id:"t4",title:"資料を安部さんへ送付",completed:false}]}),
];
