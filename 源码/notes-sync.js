(function(root){
 'use strict';
 var START='—— 念念任务区开始 ——',END='—— 念念任务区结束 ——';
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function month(now){var p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).formatToParts(new Date(now||Date.now())),v={};p.forEach(function(x){v[x.type]=x.value;});return v.year+'-'+v.month;}
 function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
 function ensureKeys(tasks,existing){
  var keys=clone(existing||{}),used={};Object.keys(keys).forEach(function(id){used[keys[id]]=id;});
  tasks.forEach(function(t){if(keys[t.id])return;var n=0,key=hash(t.id);while(used[key]&&used[key]!==t.id)key=hash(t.id+'#'+(++n));keys[t.id]=key;used[key]=t.id;});return keys;
 }
 function fields(t){return {title:t.title,kind:t.kind,day:t.kind==='daily'?t.day:null,completed:!!t.completedAt};}
 function rowsForMonth(state,m,archive,now){
  var current=month(now),oldIds={};if(archive)(archive.rows||[]).forEach(function(t){oldIds[t.id]=true;});
  return state.tasks.filter(function(t){
   if(oldIds[t.id])return true;
   if(t.kind==='long')return m===current?(!t.completedAt||month(t.completedAt)===m):!!t.completedAt&&month(t.completedAt)===m;
   return t.day.slice(0,7)===m||!!t.completedAt&&month(t.completedAt)===m||m===current&&!t.completedAt&&t.day<=m+'-31';
  }).map(clone);
 }
 function render(state,m,metadata,archive,now){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))throw Error('月份需要 YYYY-MM');
  var rows=rowsForMonth(state,m,archive,now),keys=ensureKeys(state.tasks,metadata&&metadata.keys),title='念念 · '+m.slice(0,4)+'年'+m.slice(5)+'月';
  var lines=[title,'任务行可新增、改名、删除；[x] 表示完成，[ ] 表示未完成。保留末尾编号。',START,'长期任务'];
  var longs=rows.filter(function(t){return t.kind==='long';}),daily=rows.filter(function(t){return t.kind==='daily';});
  function line(t){return '['+(t.completedAt?'x':' ')+'] '+t.title.replace(/[\r\n]+/g,' ')+' 〔'+keys[t.id]+'〕';}
  if(!longs.length)lines.push('暂无长期任务');else longs.forEach(function(t){lines.push(line(t));});
  lines.push('每日任务');var groups={};daily.forEach(function(t){(groups[t.day]||(groups[t.day]=[])).push(t);});
  if(!daily.length)lines.push('暂无日常任务');Object.keys(groups).sort().forEach(function(d){lines.push(d);groups[d].forEach(function(t){lines.push(line(t));});});lines.push(END);
  var html=lines.map(function(l,i){if(i===0)return '<h1>'+esc(l)+'</h1>';if(l==='长期任务'||l==='每日任务'||/^\d{4}-\d{2}-\d{2}$/.test(l))return '<h2>'+esc(l)+'</h2>';return '<div>'+esc(l)+'</div>';}).join('\n');
  return {month:m,title:title,rows:rows,keys:keys,plain:lines.join('\n'),html:html,signature:hash(JSON.stringify(rows.map(fields)))};
 }
 function parse(plain,m){
  plain=String(plain||'').replace(/\r\n?/g,'\n');var start=plain.indexOf(START),end=plain.indexOf(END);
  if(start<0||end<start)throw Error('同步标记被修改；为保留原文，已暂停覆盖这篇备忘录');
  var rows=[],kind=null,date=m+'-01',seen={},body=plain.slice(start+START.length,end);
  body.split('\n').forEach(function(raw){
   var l=raw.trim();if(!l)return;
   if(l==='长期任务'){kind='long';return;}if(l==='每日任务'){kind='daily';return;}
   if(/^\d{4}-\d{2}-\d{2}$/.test(l)){if(!isFinite(new Date(l+'T12:00:00Z').getTime())||new Date(l+'T12:00:00Z').toISOString().slice(0,10)!==l)throw Error('备忘录中日期无效');date=l;kind='daily';return;}
   if(l==='暂无长期任务'||l==='暂无日常任务')return;
   var key=l.match(/\s*〔([a-z0-9]{8})〕\s*$/);if(key)l=l.slice(0,key.index).trim();
   var task=l.match(/^(?:[-*]\s*)?\[([ xX✓])\]\s*(.+)$/);if(!task||!kind)throw Error('任务行请使用 [ ] 或 [x] 开头，并放在任务标题下面');
   if(key&&seen[key[1]])throw Error('同一任务编号重复；复制新任务时请删掉编号');if(key)seen[key[1]]=true;
   var title=task[2].trim();if(!title||title.length>180)throw Error('备忘录任务名称需要 1–180 个字符');
   rows.push({key:key?key[1]:null,title:title,kind:kind,day:kind==='daily'?date:null,completed:task[1].toLowerCase()==='x'||task[1]==='✓'});
  });return {rows:rows,tail:plain.slice(end+END.length)};
 }
 function merge(state,baseRows,remote,keys,model,now,strategy){
  now=now||new Date();var next=clone(state),local={},base={},byKey={},rem={},fresh=[],conflicts=[];
  next.tasks.forEach(function(t){local[t.id]=t;});(baseRows||[]).forEach(function(t){base[t.id]=t;});Object.keys(keys||{}).forEach(function(id){byKey[keys[id]]=id;});
  remote.rows.forEach(function(r){if(!r.key){fresh.push(r);return;}var id=byKey[r.key];if(!id)throw Error('任务编号不存在，请保留原编号或删掉编号作为新任务');if(rem[id])throw Error('任务编号重复');rem[id]=r;});
  function conflict(id,reason,l,r){conflicts.push({id:id,title:(l||base[id]||r).title,reason:reason,local:l?fields(l):null,notes:r||null});}
  function remove(id){var t=local[id];if(t){next.trash=next.trash||[];next.trash.push({task:clone(t),deletedAt:now.toISOString(),source:'notes'});next.tasks=model.remove(next.tasks,id);delete local[id];}}
  function assign(t,field,value){if(field==='completed')t.completedAt=value?(t.completedAt||now.toISOString()):null;else if(field==='day'){if(t.kind==='daily')t.day=value;}else t[field]=value;t.updatedAt=now.toISOString();}
  Object.keys(base).forEach(function(id){
   var b=base[id],l=local[id],r=rem[id],bf=fields(b),lf=l?fields(l):null;
   if(!l&&!r)return;
   if(!l&&r){if(JSON.stringify(bf)!==JSON.stringify({title:r.title,kind:r.kind,day:r.day,completed:r.completed})){conflict(id,'念念已删除，备忘录又有修改',null,r);if(strategy==='notes'){l=clone(b);next.tasks.push(l);local[id]=l;}else return;}else return;}
   if(l&&!r){if(JSON.stringify(bf)!==JSON.stringify(lf)){conflict(id,'念念有修改，备忘录已删除',l,null);if(strategy==='notes')remove(id);}else remove(id);return;}
   lf=fields(l);
   ['title','kind','day','completed'].forEach(function(f){
    var rv=r[f],bv=bf[f],lv=lf[f];if(rv===bv)return;
    if(lv!==bv&&lv!==rv){conflict(id,'两边同时修改 '+f,l,r);if(strategy!=='notes')return;}
    assign(l,f,rv);
   });
   if(l.kind==='long'){delete l.day;delete l.parentId;delete l.parentTitle;}
  });
  Object.keys(rem).forEach(function(id){if(base[id])return;var l=local[id],r=rem[id];if(!l)throw Error('备忘录引用了已不存在的任务');if(JSON.stringify(fields(l))!==JSON.stringify({title:r.title,kind:r.kind,day:r.day,completed:r.completed})){conflict(id,'从其他月份复制的任务存在差异',l,r);if(strategy==='notes')['title','kind','day','completed'].forEach(function(f){assign(l,f,r[f]);});}});
  if(conflicts.length&&!strategy)return {state:state,conflicts:conflicts};
  fresh.forEach(function(r){next.tasks=model.add(next.tasks,r.title,r.kind,null,now);var t=next.tasks[next.tasks.length-1];if(r.kind==='daily')t.day=r.day;t.completedAt=r.completed?now.toISOString():null;t.updatedAt=now.toISOString();});
  var titles={};next.tasks.forEach(function(t){if(t.kind==='long')titles[t.id]=t.title;});next.tasks.forEach(function(t){if(t.parentId&&titles[t.parentId])t.parentTitle=titles[t.parentId];});
  return {state:next,conflicts:strategy?[]:conflicts};
 }
 var api={month:month,hash:hash,ensureKeys:ensureKeys,rowsForMonth:rowsForMonth,render:render,parse:parse,merge:merge,START:START,END:END};
 if(typeof module!=='undefined')module.exports=api;else root.NNNotes=api;
})(this);
