/* 旧バージョン(git HEAD)と新バージョンで、おはし二日町の結果が変わっていないか比べる */
const fs=require("fs"),vm=require("vm"),path=require("path"),cp=require("child_process");
/* 比較のもとにする「落合対応より前」のバージョン */
const BASE="7dc2e22";
const OLDSRC=cp.execSync("git show "+BASE+":index.html",{cwd:path.join(__dirname,".."),maxBuffer:1<<24}).toString("utf8");
function load(file,src){
  const CODE=(src!=null?src:fs.readFileSync(file,"utf8")).match(/<script>([\s\S]*?)<\/script>/)[1];
  const m={}, els={};
  const mkEl=(id)=>({id,innerHTML:"",textContent:"",classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)}}});
  ["app","printview","mask","sheet","toast"].forEach(i=>els[i]=mkEl(i));
  const sb={document:{getElementById:(i)=>els[i]||null,addEventListener(){},hidden:false},
    localStorage:{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}},
    fetch:()=>new Promise(()=>{}), window:{addEventListener(){}},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,
    Date,Math,JSON,Object,Array,String,Number,isNaN,parseInt,parseFloat,console,confirm:()=>true};
  sb.globalThis=sb; vm.createContext(sb); vm.runInContext(CODE,sb,{filename:file});
  return sb;
}
/* 同じスタッフ・同じ希望を両方に入れる */
const staff=[];
for(let i=0;i<8;i++) staff.push({id:"o"+i,name:"従業員"+i,pos:[],ci:i});
const req={ o0:{17:{s:"ng"}}, o1:{17:{s:"tm",f:"18:00",t:"23:00"}}, o2:{18:{s:"ng"}} };
const seed=()=>({staff:JSON.parse(JSON.stringify(staff)),req:JSON.parse(JSON.stringify(req)),asg:{},submitted:{},updatedAt:1});

const OLD=load("旧版("+BASE+")",OLDSRC);
const NEW=load(path.join(__dirname,"..","index.html"));
NEW.applyShop("ohashi");                       /* 新版：おはし二日町にする */

function draft(S,day){ S.DATA=seed(); S.ensureColors(); S.MDAY=day; S.autoDraft();
  return (S.DATA.shift[day]||[]).map(e=>e.sid+"|"+e.pos+"|"+e.f+"|"+e.t).sort(); }

let bad=0;
for(const day of [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]){
  const a=draft(OLD,day), b=draft(NEW,day);
  const same=JSON.stringify(a)===JSON.stringify(b);
  if(!same){ bad++; console.log("差分 8/"+day+"\n  旧:"+JSON.stringify(a)+"\n  新:"+JSON.stringify(b)); }
}
/* 旧データ(asg)からの引き継ぎも比べる */
const legacyAsg={17:{s2:["o1","o2","o3"],s6:["o1","o4"],s7:["o1"]}};
function migrate(S){ S.DATA=seed(); S.DATA.asg=JSON.parse(JSON.stringify(legacyAsg)); S.ensureColors();
  return S.shiftOf(17).map(e=>e.sid+"|"+e.pos+"|"+e.f+"|"+e.t).sort(); }
const ma=migrate(OLD), mb=migrate(NEW);
if(JSON.stringify(ma)!==JSON.stringify(mb)){ bad++; console.log("差分 旧データ引き継ぎ\n  旧:"+JSON.stringify(ma)+"\n  新:"+JSON.stringify(mb)); }
else console.log("  OK   旧データ(asg)→帯の引き継ぎが旧版と同一: "+JSON.stringify(mb));

/* 印刷ビューも比べる */
function print(S){ S.DATA=seed(); S.ensureColors(); [16,17,18].forEach(d=>{S.MDAY=d;S.autoDraft();}); S.renderPrint();
  return S.document.getElementById("printview").innerHTML; }
const pa=print(OLD), pb=print(NEW);
if(pa!==pb){ bad++; console.log("差分 印刷ビュー\n  旧:"+pa.slice(0,300)+"\n  新:"+pb.slice(0,300)); }
else console.log("  OK   印刷ビューのHTMLが旧版と完全一致");

console.log(bad?("\n"+bad+"件の差分あり"):"\nおはし二日町：16日ぶんの自動作成・引き継ぎ・印刷すべて旧版と同一");
process.exit(bad?1:0);
