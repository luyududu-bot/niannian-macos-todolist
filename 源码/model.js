(function(root){
  'use strict';
  const day = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const listName = text => String(text||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,60) || 'XX’s to do list';
  const uid = () => Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  const title = text => String(text||'').replace(/[\r\n]+/g,' ').trim().slice(0,180);
  function add(tasks,text,kind,parentId=null,now=new Date()) {
    const clean=title(text);if(!clean)return tasks;
    const parent=tasks.find(t=>t.id===parentId&&t.kind==='long'&&!t.completedAt);
    if(parentId&&!parent)throw Error('这个长期任务已经完成或被移除');
    const next=tasks.map(t=>t.id===parentId?{...t,lastPlannedAt:now.toISOString()}:t);
    next.push({id:uid(),kind,title:clean,createdAt:now.toISOString(),completedAt:null,...(kind==='daily'?{day:day(now),parentId:parent?parent.id:null,parentTitle:parent?parent.title:null}:{lastPlannedAt:null})});
    return next;
  }
  function toggle(tasks,id,now=new Date()) {return tasks.map(t=>t.id===id?{...t,completedAt:t.completedAt?null:now.toISOString()}:t);}
  function rename(tasks,id,text) {
    const clean=title(text);if(!clean)return tasks;
    return tasks.map(t=>t.id===id?{...t,title:clean}:t.parentId===id?{...t,parentTitle:clean}:t);
  }
  function remove(tasks,id){return tasks.filter(t=>t.id!==id).map(t=>t.parentId===id?{...t,parentId:null}:t);}
  function daily(tasks,at=day()) {return tasks.filter(t=>t.kind==='daily'&&t.day<=at&&(!t.completedAt||day(new Date(t.completedAt))===at));}
  function steps(tasks,id){const rows=tasks.filter(t=>t.parentId===id);return {all:rows.length,done:rows.filter(t=>t.completedAt).length,today:rows.filter(t=>!t.completedAt&&t.day<=day()).length};}
  function spotlight(tasks,offset=0,at=day()) {
    const goals=tasks.filter(t=>t.kind==='long'&&!t.completedAt);
    if(!goals.length)return null;
    // Prefer goals with no unfinished step in today's list.
    const available=goals.filter(t=>!tasks.some(s=>s.parentId===t.id&&!s.completedAt&&s.day<=at));
    const pool=available.length?available:goals;
    const dateNumber=Math.floor(Date.parse(at+'T12:00:00Z')/86400000);
    return pool[(dateNumber+offset)%pool.length];
  }
  const api={listName,day,add,toggle,rename,remove,daily,steps,spotlight};
  if(typeof module!=='undefined')module.exports=api; else root.Nian=api;
})(typeof window!=='undefined'?window:globalThis);
