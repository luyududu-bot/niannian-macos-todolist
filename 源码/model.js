(function(root){
  'use strict';
  const day = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const listName = text => String(text||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,60) || 'XX’s to do list';
  const uid = () => Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  const title = text => String(text||'').replace(/[\r\n]+/g,' ').trim().slice(0,180);
  function add(tasks,text,kind,parentId=null,now=new Date()) {
    const clean=title(text);if(!clean)return tasks;
    const parent=tasks.find(t=>t.id===parentId&&t.kind==='long'&&!t.watchOnly&&!t.completedAt);
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
  // Reorder only slots of the visible group; history and the other list stay in place.
  function reorder(tasks,id,targetId,after=false,at=day()) {
    const source=tasks.find(t=>t.id===id),target=tasks.find(t=>t.id===targetId);
    if(!source||!target||id===targetId||source.kind!==target.kind||!!source.watchOnly!==!!target.watchOnly||!!source.completedAt!==!!target.completedAt)return tasks;
    const visible=new Set((source.kind==='daily'?daily(tasks,at):tasks.filter(t=>t.kind==='long'&&!!t.watchOnly===!!source.watchOnly)).filter(t=>!!t.completedAt===!!source.completedAt).map(t=>t.id));
    if(!visible.has(id)||!visible.has(targetId))return tasks;
    const group=tasks.filter(t=>visible.has(t.id)&&t.id!==id);
    group.splice(group.findIndex(t=>t.id===targetId)+(after?1:0),0,source);
    let index=0;return tasks.map(t=>visible.has(t.id)?group[index++]:t);
  }
  function stepRows(tasks,id){
    const parent=tasks.find(t=>t.id===id),plans=parent&&parent.plannedSteps||[];
    const planned=plans.map(p=>{const t=tasks.find(t=>t.id===p.taskId||t.plannedStepId===p.id&&t.parentId===id);return {...p,title:t?t.title:p.title,taskId:t?t.id:null,completedAt:t?t.completedAt:null,scheduled:!!(t&&!t.completedAt&&t.day<=day())};});
    return planned.concat(tasks.filter(t=>t.parentId===id&&!planned.some(p=>p.taskId===t.id)).map(t=>({id:t.id,title:t.title,taskId:t.id,completedAt:t.completedAt,scheduled:!t.completedAt&&t.day<=day(),legacy:true})));
  }
  function steps(tasks,id){const rows=stepRows(tasks,id);return {all:rows.length,done:rows.filter(t=>t.completedAt).length,today:rows.filter(t=>t.scheduled).length};}
  function setSteps(tasks,id,plans){
    const parent=tasks.find(t=>t.id===id&&t.kind==='long'&&!t.watchOnly);if(!parent)throw Error('长期任务不存在');
    const old=parent.plannedSteps||[];
    const next=plans.map(p=>({...p,id:p.id||uid(),title:title(p.title)})).filter(p=>p.title);
    if(new Set(next.map(p=>p.id)).size!==next.length)throw Error('步骤重复');
    const removed=old.filter(p=>!next.some(n=>n.id===p.id));
    return tasks.map(t=>{if(t.id===id)return {...t,plannedSteps:next};
      if(t.parentId!==id)return t;
      if(removed.some(p=>p.id===t.plannedStepId||p.taskId===t.id)){const v={...t,parentId:null,parentTitle:null};delete v.plannedStepId;return v;}
      const p=next.find(p=>p.id===t.plannedStepId||p.taskId===t.id);return p?{...t,title:p.title}:t;
    });
  }
  function createLong(tasks,text,lines=[]){let next=add(tasks,text,'long');if(next===tasks)return tasks;return setSteps(next,next[next.length-1].id,lines.map(title=>({title})));}
  function watch(tasks,text){const next=add(tasks,text,'long');return next===tasks?tasks:next.map((t,i)=>i===next.length-1?{...t,watchOnly:true}:t);}
  function promote(tasks,id,kind){return tasks.map(t=>t.id!==id||!t.watchOnly?t:{...t,watchOnly:false,kind, ...(kind==='daily'?{day:day(),parentId:null,parentTitle:null}:{})});}
  function scheduleSteps(tasks,id,ids){
    const parent=tasks.find(t=>t.id===id&&t.kind==='long'&&!t.watchOnly&&!t.completedAt);if(!parent)throw Error('长期任务已经完成或移除');
    let next=tasks.slice();const rows=stepRows(tasks,id);
    ids.forEach(sid=>{const row=rows.find(p=>p.id===sid);if(!row||row.completedAt||row.scheduled)return;
      if(row.taskId){next=next.map(t=>t.id===row.taskId?{...t,day:day()}:t);return;}
      const taskId=uid();next.push({id:taskId,kind:'daily',title:row.title,day:day(),createdAt:new Date().toISOString(),completedAt:null,parentId:id,parentTitle:parent.title,plannedStepId:sid});
      next=next.map(t=>t.id===id?{...t,lastPlannedAt:new Date().toISOString(),plannedSteps:(t.plannedSteps||[]).map(p=>p.id===sid?{...p,taskId}:p)}:t);
    });return next;
  }
  function spotlight(tasks,offset=0,at=day()) {
    const goals=tasks.filter(t=>t.kind==='long'&&!t.watchOnly&&!t.completedAt);
    if(!goals.length)return null;
    // Prefer goals with no unfinished step in today's list.
    const available=goals.filter(t=>!tasks.some(s=>s.parentId===t.id&&!s.completedAt&&s.day<=at));
    const pool=available.length?available:goals;
    const dateNumber=Math.floor(Date.parse(at+'T12:00:00Z')/86400000);
    return pool[(dateNumber+offset)%pool.length];
  }
  const api={listName,day,add,toggle,rename,remove,daily,reorder,steps,stepRows,setSteps,createLong,watch,promote,scheduleSteps,spotlight};
  if(typeof module!=='undefined')module.exports=api; else root.Nian=api;
})(typeof window!=='undefined'?window:globalThis);
