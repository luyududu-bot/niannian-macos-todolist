(function(root){
 'use strict';
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function fields(t){return t?{title:t.title,kind:t.kind,day:t.kind==='daily'?t.day:null,completed:!!t.completedAt}:null;}
 function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
 function validDay(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;}
 function plan(state,snapshot,now,strategy){
  now=now||new Date();var meta=clone(snapshot.meta),next=clone(state),locals={},remote={},conflicts=[],ops=[],seen={};meta.links=meta.links||{};meta.base=meta.base||{};
  next.tasks.forEach(function(t){locals[t.id]=t;});
  var byRemote={};Object.keys(meta.links).forEach(function(id){if(byRemote[meta.links[id]])throw Error('提醒事项映射重复，已暂停同步');byRemote[meta.links[id]]=id;});
  snapshot.rows.forEach(function(r){
   if(seen[r.remoteId])throw Error('提醒事项重复，已暂停同步');seen[r.remoteId]=true;
   if(!r.title||r.title.length>180)throw Error('提醒事项名称需要 1–180 个字符，请先调整名称');
   if(r.kind==='daily'&&!validDay(r.day))throw Error('提醒事项中的日期无效');
   var id=byRemote[r.remoteId]||'reminder:'+r.remoteId;
   meta.links[id]=r.remoteId;remote[id]=r;
   if(!byRemote[r.remoteId]){var t={id:id,title:r.title,kind:r.kind,createdAt:r.createdAt||now.toISOString(),completedAt:r.completedAt||null};if(r.kind==='daily')t.day=r.day;else t.lastPlannedAt=null;next.tasks.push(t);locals[id]=t;meta.base[id]=fields(t);}
  });
  function conflict(id,field,l,r){conflicts.push({id:id,title:(l||r||meta.base[id]).title,field:field,local:fields(l),remote:fields(r)});return strategy==='remote';}
  function drop(id){var t=locals[id];if(t){next.trash=next.trash||[];next.trash.push({task:clone(t),deletedAt:now.toISOString(),source:'reminders'});next.tasks=next.tasks.filter(function(x){return x.id!==id;});delete locals[id];}}
  var ids={};Object.keys(meta.base).concat(Object.keys(locals)).forEach(function(id){ids[id]=true;});
  Object.keys(ids).forEach(function(id){
   var l=locals[id],r=remote[id],b=meta.base[id];
   if(!b){if(l)ops.push({type:'create',id:id,desired:fields(l)});return;}
   if(!l&&!r){delete meta.base[id];delete meta.links[id];return;}
   if(!l&&r){
    if(!equal(b,fields(r))&&conflict(id,'删除与修改',l,r)){l={id:id,title:r.title,kind:r.kind,createdAt:now.toISOString(),completedAt:r.completedAt||null};if(r.kind==='daily')l.day=r.day;next.tasks.push(l);locals[id]=l;}
    else{ops.push({type:'remove',id:id,remoteId:meta.links[id],expected:fields(r)});return;}
   }
   if(l&&!r){
    if(!equal(b,fields(l))){if(conflict(id,'删除与修改',l,r)){drop(id);delete meta.base[id];delete meta.links[id];}else{delete meta.links[id];ops.push({type:'create',id:id,desired:fields(l)});} }
    else{drop(id);delete meta.base[id];delete meta.links[id];}return;
   }
   var lf=fields(l),rf=fields(r);
   ['title','kind','day','completed'].forEach(function(f){
    if(rf[f]===b[f])return;
    if(lf[f]!==b[f]&&lf[f]!==rf[f]&&!conflict(id,f,l,r))return;
    if(f==='completed')l.completedAt=rf[f]?(r.completedAt||l.completedAt||now.toISOString()):null;
    else l[f]=rf[f];l.updatedAt=now.toISOString();
   });
   if(l.kind==='long'){delete l.day;delete l.parentId;delete l.parentTitle;}else if(!validDay(l.day))throw Error('日常任务需要有效日期');
   var desired=fields(l);if(!equal(desired,rf))ops.push({type:'update',id:id,remoteId:meta.links[id],expected:rf,desired:desired});else meta.base[id]=desired;
  });
  if(conflicts.length&&!strategy)return {state:state,conflicts:conflicts,ops:[]};
  var goals={};next.tasks.forEach(function(t){if(t.kind==='long')goals[t.id]=t.title;});next.tasks.forEach(function(t){if(t.parentId){if(goals[t.parentId])t.parentTitle=goals[t.parentId];else{t.parentId=null;delete t.parentTitle;}}});
  return {state:next,meta:meta,ops:ops,conflicts:[]};
 }
 function archive(state,m,rows,hash){
  function esc(s){return String(s).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  var title=m.slice(0,4)+'年'+Number(m.slice(5))+'月',space='<div><br></div>';
  // Use the native Notes heading/body styles chosen in the user's manually formatted note.
  var html='<h1 style="font-size:20px">'+esc(title)+'</h1><div><font color="#888888">'+esc(state.listName||'念念')+'</font><br></div>'+space;
  function group(name,tasks){
   html+='<h3 style="font-size:14px">'+esc(name)+'</h3>';
   if(!tasks.length){html+='<div><font color="#888888">无任务</font><br></div>'+space;return;}
   [false,true].forEach(function(done){
    var items=tasks.filter(function(t){return !!t.completedAt===done;});if(!items.length)return;
    var label=(done?'已完成':'待完成')+' · '+items.length;
    html+=done?'<h3 style="font-size:14px">'+esc(label)+'</h3>':'<div><font color="#888888">'+esc(label)+'</font><br></div>';
    items.forEach(function(t){html+='<div>'+(done?'✓':'•')+'　'+esc(t.title)+'<br></div>';});html+=space;
   });
  }
  group('长期任务',rows.filter(function(t){return t.kind==='long';}));var days={};rows.forEach(function(t){if(t.kind==='daily')(days[t.day]||(days[t.day]=[])).push(t);});Object.keys(days).sort().forEach(function(d){group(Number(d.slice(5,7))+'月'+Number(d.slice(8))+'日',days[d]);});
  return {month:m,title:title,html:html,rows:rows,signature:'reminders-archive-v3:'+hash(html)};
 }
 var api={plan:plan,fields:fields,equal:equal,validDay:validDay,archive:archive};if(typeof module!=='undefined')module.exports=api;else root.NNReminders=api;
})(this);
