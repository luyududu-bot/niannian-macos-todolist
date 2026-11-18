const assert=require('node:assert/strict'),N=require('../源码/model.js'),R=require('../源码/reminders-sync.js');
let tasks=N.createLong([],'建筑力学',['整理资料','练习一','练习二']);const goal=tasks[0],ids=goal.plannedSteps.map(p=>p.id);
assert.equal(N.daily(tasks).length,0);assert.equal(N.steps(tasks,goal.id).all,3);
tasks=N.scheduleSteps(tasks,goal.id,[ids[2],ids[0]]);assert.equal(N.daily(tasks).length,2);assert.equal(N.steps(tasks,goal.id).today,2);
assert.equal(N.scheduleSteps(tasks,goal.id,[ids[0]]).length,tasks.length);
const child=tasks.find(t=>t.plannedStepId===ids[0]);tasks=N.toggle(tasks,child.id);assert.equal(N.steps(tasks,goal.id).done,1);tasks=N.toggle(tasks,child.id);assert.equal(N.steps(tasks,goal.id).done,0);
tasks=N.rename(tasks,child.id,'手机改名');assert.equal(N.stepRows(tasks,goal.id)[0].title,'手机改名');
const plans=tasks[0].plannedSteps.map(p=>({...p,title:p.id===ids[0]?'步骤改名':p.title})).reverse();tasks=N.setSteps(tasks,goal.id,plans);assert.equal(tasks.find(t=>t.id===child.id).title,'步骤改名');assert.equal(N.stepRows(tasks,goal.id)[0].id,ids[2]);
const state={tasks};const snapshot={meta:{links:{},base:{}},rows:[]};const synced=R.plan(state,snapshot,new Date()).state;assert.deepEqual(synced.tasks[0].plannedSteps,tasks[0].plannedSteps);
tasks=N.setSteps(tasks,goal.id,plans.filter(p=>p.id!==ids[0]));assert.equal(tasks.find(t=>t.id===child.id).parentId,null);assert.equal(N.steps(tasks,goal.id).all,2);
let watches=N.watch(tasks,'很久以后');const watch=watches.at(-1);assert.equal(watch.watchOnly,true);assert.notEqual(N.spotlight(watches)?.id,watch.id);
assert.equal(N.promote(watches,watch.id,'daily').at(-1).day,N.day());assert.equal(N.promote(watches,watch.id,'long').at(-1).watchOnly,false);
assert.equal(N.reorder(watches,watch.id,goal.id),watches);
console.log('PASS: unscheduled steps, arbitrary multi-select, duplicate protection, completion/reopen, rename/order/delete, sync retention, watches and promotion');
for(const lines of [[],['预留步骤']]){
  const original=N.createLong([],'建筑力学',lines);
  const id=original[0].id;
  const scheduled=N.scheduleWhole(original,id);
  const [today]=N.daily(scheduled);
  assert.equal(today.title,'建筑力学');
  assert.equal(today.parentId,id);
  assert.deepEqual(N.stepRows(scheduled,id),N.stepRows(original,id));
  assert.equal(N.scheduleWhole(scheduled,id),scheduled);
  const completed=N.toggle(scheduled,today.id);
  assert.equal(N.scheduleWhole(completed,id),completed);
}
