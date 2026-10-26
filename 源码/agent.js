(function(root){
 'use strict';
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function day(date){var p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date)),v={};p.forEach(function(x){v[x.type]=x.value;});return v.year+'-'+v.month+'-'+v.day;}
 function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var d=new Date(value+'T12:00:00Z');return isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
 function clean(value){if(typeof value!=='string')throw Error('任务名称必须是文字');var s=value.replace(/[\r\n]+/g,' ').trim();if(!s||s.length>180)throw Error('任务名称需要 1–180 个字符');return s;}
 function query(state,p,now){
  p=p||{};var at=p.date||day(now||new Date()),rows=state.tasks.slice();
  if(p.scope==='today')rows=rows.filter(function(t){return t.kind==='daily'&&t.day<=at&&(!t.completedAt||day(t.completedAt)===at);});
  else if(p.scope==='long')rows=rows.filter(function(t){return t.kind==='long';});
  if(typeof p.completed==='boolean')rows=rows.filter(function(t){return !!t.completedAt===p.completed;});
  if(p.search)rows=rows.filter(function(t){return t.title.toLowerCase().indexOf(String(p.search).toLowerCase())>=0;});
  return {tasks:rows,total:rows.length,date:at};
 }
 function apply(state,op,p,model,now){
  p=p||{};now=now||new Date();var next=clone(state),id=p.id,task=next.tasks.find(function(t){return t.id===id;});
  function required(){if(!task)throw Error('未找到任务：'+id);}
  function date(){if(p.date!==undefined&&!validDay(p.date))throw Error('日期需要有效的 YYYY-MM-DD');return p.date||day(now);}
  switch(op){
   case 'create_task':
    if(p.kind&&p.kind!=='daily'&&p.kind!=='long')throw Error('kind 只能是 daily 或 long');
    next.tasks=model.add(next.tasks,clean(p.title),p.kind||'daily',p.parent_id||null,now);task=next.tasks[next.tasks.length-1];if(task.kind==='daily')task.day=date();break;
   case 'plan_step':
    var goal=next.tasks.find(function(t){return t.id===p.goal_id&&t.kind==='long'&&!t.completedAt;});if(!goal)throw Error('未找到未完成的长期目标');
    next.tasks=model.add(next.tasks,clean(p.title),'daily',goal.id,now);task=next.tasks[next.tasks.length-1];task.day=date();break;
   case 'update_task':required();
    if(p.title!==undefined)next.tasks=model.rename(next.tasks,id,clean(p.title));
    task=next.tasks.find(function(t){return t.id===id;});if(p.date!==undefined){if(task.kind!=='daily')throw Error('长期目标没有日常日期');task.day=date();}break;
   case 'complete_task':required();
    if(p.completed!==undefined&&typeof p.completed!=='boolean')throw Error('completed 必须是布尔值');
    task.completedAt=p.completed===false?null:(task.completedAt||now.toISOString());break;
   case 'delete_task':required();
    next.trash=next.trash||[];next.trash.push({task:clone(task),deletedAt:now.toISOString(),source:'agent'});next.tasks=model.remove(next.tasks,id);return {state:next,result:{deleted:true,id:id,recoverable:true}};
   case 'restore_task':
    var item=(next.trash||[]).slice().reverse().find(function(v){return v.task.id===id;});if(!item)throw Error('未找到可恢复的任务');
    if(task)throw Error('任务已经存在');task=clone(item.task);if(task.parentId&&!next.tasks.some(function(t){return t.id===task.parentId;}))task.parentId=null;
    next.tasks.push(task);next.trash=next.trash.filter(function(v){return v.task.id!==id;});break;
   default:throw Error('不支持的操作：'+op);
  }
  task.updatedAt=now.toISOString();return {state:next,result:{task:clone(task)}};
 }
 var api={query:query,apply:apply,validDay:validDay,day:day};
 if(typeof module!=='undefined')module.exports=api;else root.NNAgent=api;
})(this);
