'use strict';
const $=id=>document.getElementById(id);
const svg=(paths)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const icons={
  plus:svg('<path d="M12 5v14M5 12h14"/>'),check:svg('<path d="m5 12 4 4L19 6"/>'),
  pin:svg('<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6Z"/><path d="M12 15v6"/>'),
  collapse:svg('<path d="M5 12h14"/>'),arrow:svg('<path d="M5 12h14m-5-5 5 5-5 5"/>'),
  leaf:svg('<path d="M5 18C1 8 9 3 20 4c1 12-5 19-13 14"/><path d="M4 21 16 9"/>'),
  sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'),
  more:svg('<circle cx="5" cy="12" r=".7"/><circle cx="12" cy="12" r=".7"/><circle cx="19" cy="12" r=".7"/>'),
  chevron:svg('<path d="m9 5 7 7-7 7"/>'),down:svg('<path d="m5 9 7 7 7-7"/>'),
  close:svg('<path d="m6 6 12 12M6 18 18 6"/>'),info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>'),
  link:svg('<path d="M7 8h5a4 4 0 0 1 0 8H7m10-8h-5a4 4 0 0 0 0 8h5"/>'),
  refresh:svg('<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/>'),
  folder:svg('<path d="M3 7V5h7l2 3h9v12H3V7Z"/>'),
  orb:svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>')
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native=!!window.webkit?.messageHandlers?.native;
let state={version:1,tasks:[],pinned:false}, tab='daily',showDone=false,spotOffset=0,saving=false;
let integrations={},integrationView=false;
let savedTasks=[],toastTimer,lastDay=Nian.day(),loaded=!native;
const send=(type,body={})=>{if(native)window.webkit.messageHandlers.native.postMessage({type,...body});};
if(!native){try{const value=JSON.parse(localStorage.getItem('niannian-preview'));if(value&&Array.isArray(value.tasks))state=value;}catch(e){}}

function toast(text,action){
  clearTimeout(toastTimer);$('toast').innerHTML=`<span>${esc(text)}</span>${action?`<button id="undo-action">${esc(action.label)}</button>`:''}`;
  $('toast').classList.add('visible');if(action)$('undo-action').onclick=()=>{action.run();$('toast').classList.remove('visible');};
  toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),action?9000:3000);
}
function commit(tasks,message){
  if(!loaded)return;
  if(saving){toast('正在保存，稍等一下');return;}
  savedTasks=state.tasks;state={...state,tasks};render();
  if(native){saving=true;send('save',{tasks});setTimeout(()=>{if(saving){toast('保存尚未确认，请先保留应用打开');}},5000);}
  else{try{localStorage.setItem('niannian-preview',JSON.stringify(state));}catch(e){state.tasks=savedTasks;render();toast('浏览器无法保存数据');return;}}
  if(message)toast(message);
}
window.receiveNative=function(payload){
  const changed=JSON.stringify(state.tasks)!==JSON.stringify(payload.state.tasks)||state.pinned!==payload.state.pinned||state.pinMode!==payload.state.pinMode;
  const previousIntegration=JSON.stringify(integrations);integrations=payload.integration||{};
  state=payload.state;loaded=true;updateListName();document.body.dataset.appearance=state.appearance||'glass';$('layout-bar').hidden=!payload.editingLayout;document.body.classList.toggle('layout-editing',!!payload.editingLayout);
  $('pin').classList.toggle('selected',!!state.pinned);$('pin').setAttribute('aria-pressed',String(!!state.pinned));
  $('pin').title=state.pinned?'取消固定':'固定清单（方式可在右下角选择）';
  if(changed||!$('content').innerHTML)render();
  if(integrationView&&previousIntegration!==JSON.stringify(integrations))integrationSettings();
  if(payload.storageLocked){$('new-task').disabled=true;toast('原数据无法读取，已暂停写入。请打开资料检查。');}
};
window.saveAcknowledged=function(){saving=false;};
window.nativeError=function(text){if(saving){state.tasks=savedTasks;saving=false;render();}toast(text);};

function switchTab(value){tab=value;showDone=false;render();$('content').scrollTop=0;}
function row(t){
  const stats=t.kind==='long'?Nian.steps(state.tasks,t.id):null;
  const parent=state.tasks.find(p=>p.id===t.parentId);
  const parentTitle=parent?.title||t.parentTitle;
  const meta=t.kind==='long'?(stats.all?`${stats.done}/${stats.all} 步已完成${stats.today?` · 今天 ${stats.today} 步`:''}`:''):(parentTitle?`${icons.link}<span>${esc(parentTitle)}</span>`:'');
  return `<article class="task ${t.completedAt?'done':''}" data-id="${esc(t.id)}"><button class="check" data-action="toggle" aria-label="${t.completedAt?'撤销完成':'完成'}：${esc(t.title)}" aria-pressed="${!!t.completedAt}">${t.completedAt?icons.check:''}</button><div class="task-main"><div class="task-title">${esc(t.title)}</div>${meta?`<div class="task-meta">${meta}</div>`:''}${t.kind==='daily'&&t.day<Nian.day()&&!t.completedAt?'<div class="task-meta carry">昨日未完成</div>':''}</div><div class="task-actions">${t.kind==='long'&&!t.completedAt?`<button data-action="step" title="拆一步到今天" aria-label="为${esc(t.title)}安排今天的一小步">${icons.plus}</button>`:''}<button class="more" data-action="edit" title="编辑或删除" aria-label="编辑${esc(t.title)}">${icons.more}</button></div></article>`;
}
function updateListName(){const name=Nian.listName(state.listName);$('list-name').textContent=name;$('list-name').title=name;document.title=name;}
function render(){
  updateListName();
  const now=new Date(),date=now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  $('date').textContent=date.replace('星期','周');
  const daily=Nian.daily(state.tasks),pending=daily.filter(t=>!t.completedAt),completed=daily.filter(t=>t.completedAt);
  const goals=state.tasks.filter(t=>t.kind==='long'&&!t.completedAt);
  $('daily-count').textContent=pending.length;$('long-count').textContent=goals.length;
  for(const kind of ['daily','long']){$('tab-'+kind).classList.toggle('active',tab===kind);$('tab-'+kind).setAttribute('aria-selected',String(tab===kind));}
  $('new-task').placeholder=tab==='daily'?'添加今天的任务':'添加长期任务';
  let html='';
  if(tab==='daily'){
    const goal=Nian.spotlight(state.tasks,spotOffset);
    if(pending.length){html+=pending.map(row).join('');}
    else html+=`<div class="empty"><p>${completed.length?'已全部完成':'暂无任务'}</p></div>`;
    if(completed.length)html+=`<button class="complete-toggle" data-action="done">${showDone?icons.down:icons.chevron} 已完成 ${completed.length}</button>${showDone?'<div class="done-list">'+completed.map(row).join('')+'</div>':''}`;
    if(goal){const steps=Nian.steps(state.tasks,goal.id);html+=`<div class="long-reminder"><div class="section-label"><span>长期</span>${goals.length>1?'<button data-action="rotate">换一个</button>':''}</div><div class="spotlight" data-id="${esc(goal.id)}"><div class="goal-title">${esc(goal.title)}</div><button class="step-button" data-action="step" title="拆一步到今天">${steps.today?'再加一步':'安排今天'}${icons.arrow}</button></div></div>`;}
  }else{
    const finished=state.tasks.filter(t=>t.kind==='long'&&t.completedAt);
    if(goals.length)html+=goals.map(row).join('');
    else html+=`<div class="empty"><p>暂无长期任务</p></div>`;
    if(finished.length)html+=`<button class="complete-toggle" data-action="done">${showDone?icons.down:icons.chevron} 已完成 ${finished.length}</button>${showDone?'<div class="done-list">'+finished.map(row).join('')+'</div>':''}`;
  }
  $('content').innerHTML=html;
  $('footnote').textContent=state.pinned?(state.pinMode==='desktop'?'贴在桌面':'始终置顶'):'';
  $('pin').classList.toggle('selected',!!state.pinned);$('pin').setAttribute('aria-pressed',String(!!state.pinned));
}
function closeDialog(){integrationView=false;$('overlay').hidden=true;$('overlay').innerHTML='';$('new-task').focus();}
function dialog(title,body,buttons,preserveFocus=false){
  $('overlay').hidden=false;$('overlay').innerHTML=`<form class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-heading"><h2>${esc(title)}</h2><button type="button" data-close aria-label="关闭">${icons.close}</button></div><div class="dialog-body">${body}</div><div class="dialog-actions">${buttons}</div></form>`;
  $('overlay').querySelector('[data-close]').onclick=closeDialog;
  $('overlay').onclick=e=>{if(e.target===$('overlay'))closeDialog();};
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=closeDialog);
  if(!preserveFocus)setTimeout(()=>{const input=$('dialog-input');if(input){input.focus();input.select();}else $('overlay').querySelector('button').focus();},50);
  return $('overlay').querySelector('form');
}
function stepDialog(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||task.completedAt)return;
  const form=dialog('安排到今天',`<div class="context">${esc(task.title)}</div><label for="dialog-input">今天具体做什么？</label><input id="dialog-input" maxlength="180" placeholder="例如：先整理一个文件夹" required><p class="hint">完成这一步，长期任务仍会保留。</p>`,`<button type="button" data-cancel>取消</button><button type="submit" class="primary">添加到今天</button>`);
  form.onsubmit=e=>{e.preventDefault();const value=$('dialog-input').value.trim();if(!value)return;try{const next=Nian.add(state.tasks,value,'daily',id);closeDialog();switchTab('daily');commit(next);}catch(error){toast(error.message);}};
}
function editDialog(id){
  const task=state.tasks.find(t=>t.id===id);if(!task)return;
  const form=dialog('编辑任务',`<label for="dialog-input">${task.kind==='long'?'长期任务':'今天的任务'}</label><input id="dialog-input" maxlength="180" value="${esc(task.title)}" required>`,`<button type="button" id="delete-task" class="danger">删除</button><button type="button" data-cancel>取消</button><button type="submit" class="primary">保存</button>`);
  form.onsubmit=e=>{e.preventDefault();const value=$('dialog-input').value.trim();if(!value)return;closeDialog();commit(Nian.rename(state.tasks,id,value));};
  $('delete-task').onclick=()=>{const previous=state.tasks;closeDialog();commit(Nian.remove(state.tasks,id));toast('已删除',{label:'撤销',run:()=>{if(!saving)commit(previous);}});};
}
function nameDialog(){
 integrationView=false;
 const form=dialog('清单名称',`<label for="dialog-input">名称</label><input id="dialog-input" aria-label="清单名称" maxlength="60" value="${esc(Nian.listName(state.listName))}" placeholder="例如：XX’s to do list" required><p class="hint">可以使用自己的名字，也可以填写任意名称。</p>`,`<button type="button" data-cancel>取消</button><button type="submit" class="primary">保存</button>`);
 form.onsubmit=e=>{e.preventDefault();if(!$('dialog-input').value.trim())return;const name=Nian.listName($('dialog-input').value);if(native)send('listName',{value:name});else{state.listName=name;localStorage.setItem('niannian-preview',JSON.stringify(state));updateListName();}closeDialog();};
}
function help(){
 integrationView=false;
 const mode=state.pinMode||'top',look=state.appearance||'glass',opacity=Math.round((state.opacity??.78)*100);
 const form=dialog('显示设置',`<button type="button" id="rename-list" class="layout-action name-setting"><span>清单名称<small>${esc(Nian.listName(state.listName))}</small></span>${icons.chevron}</button><button type="button" id="edit-layout" class="layout-action">调整大小和位置 ${icons.arrow}</button><label>窗口大小</label><div class="size-options"><button type="button" data-size="compact">紧凑</button><button type="button" data-size="standard">标准</button><button type="button" data-size="large">宽大</button></div><label>外观</label><div class="mode-options"><button type="button" data-look="glass" class="${look==='glass'?'selected':''}">磨砂玻璃</button><button type="button" data-look="dark" class="${look==='dark'?'selected':''}">暗色半透明</button></div><label class="opacity-label" for="opacity-range">背景不透明度 <output id="opacity-value">${opacity}%</output></label><input id="opacity-range" type="range" min="30" max="95" value="${opacity}"><label>固定方式</label><div class="mode-options"><button type="button" data-mode="top" class="${mode==='top'?'selected':''}">始终置顶<small>其他应用上方</small></button><button type="button" data-mode="desktop" class="${mode==='desktop'?'selected':''}">贴在桌面<small>其他应用可以盖住</small></button></div><label class="dock-option"><input id="show-dock" type="checkbox" ${state.showDock!==false?'checked':''}> 在 Dock 显示图标</label><button type="button" id="integrations" class="layout-action">Agent 与备忘录 ${icons.arrow}</button><div class="interaction-help">×：收起成球。⌘Q：退出应用。<br>隐藏后，点 Dock 或菜单栏「念念」唤醒。<br>退出后，重新打开「念念.app」启动。</div>`,`<button type="button" id="hide-all">隐藏</button><button type="button" id="open-data">资料</button><button type="submit" class="primary">完成</button>`);
 form.onsubmit=e=>{e.preventDefault();closeDialog();};
 $('rename-list').onclick=nameDialog;
 $('integrations').onclick=integrationSettings;
 $('edit-layout').onclick=()=>{closeDialog();send('beginLayout');};
 const sizes={compact:[320,380],standard:[390,510],large:[540,620]};
 form.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{const size=sizes[button.dataset.size];closeDialog();send('resizePreset',{width:size[0],height:size[1]});});
 form.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{const mode=button.dataset.mode;closeDialog();if(native)send('setPinMode',{mode});else{state.pinMode=mode;state.pinned=true;localStorage.setItem('niannian-preview',JSON.stringify(state));render();}});
 function appearance(){const style=state.appearance||'glass',opacity=Number($('opacity-range').value)/100;state.opacity=opacity;if(native)send('appearance',{style,opacity});else{localStorage.setItem('niannian-preview',JSON.stringify(state));document.body.dataset.appearance=style;}}
 form.querySelectorAll('[data-look]').forEach(button=>button.onclick=()=>{state.appearance=button.dataset.look;form.querySelectorAll('[data-look]').forEach(b=>b.classList.toggle('selected',b===button));appearance();});
 $('opacity-range').oninput=()=>{$('opacity-value').textContent=$('opacity-range').value+'%';};$('opacity-range').onchange=appearance;
 $('show-dock').onchange=e=>{state.showDock=e.target.checked;send('showDock',{value:state.showDock});};
 $('hide-all').onclick=()=>{closeDialog();if(native)send('hide');};$('open-data').onclick=()=>{if(native)send('openData');};
}

function integrationSettings(){
 const priorScroll=$('overlay').querySelector('.dialog-body')?.scrollTop||0,priorFocus=document.activeElement?.id,wasOpen=integrationView;
 integrationView=true;
 const n=integrations.notes||{},accounts=(n.accounts||[]).filter(a=>a.isICloud),selected=$('notes-account')?.value;
 const form=dialog('Agent 与备忘录',`<label>备忘录 · 双向同步</label><p class="hint">iCloud「念念」文件夹，每月一篇。每天的任务与完成状态，另列长期任务。</p><div role="status" class="sync-status">${esc(n.status||'未启用')}${n.running?'…':''}</div>${n.error?`<p class="hint sync-error">${esc(n.error)}</p>`:''}${n.lastSyncedAt?`<p class="hint">上次同步 ${esc(new Date(n.lastSyncedAt).toLocaleString('zh-CN'))}</p>`:''}${!n.enabled?`<button type="button" id="notes-accounts" class="layout-action" ${n.running?'disabled':''}>读取 iCloud 账户</button>${accounts.length?`<select id="notes-account" aria-label="iCloud 账户">${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}</select><button type="button" id="notes-enable" class="layout-action">启用双向同步</button>`:''}`:`<div class="size-options"><button type="button" id="notes-sync" ${n.running?'disabled':''}>立即同步</button><button type="button" id="notes-disable">停用</button></div>`}${n.conflicts?.length?`<p class="hint">${n.conflicts.length} 处冲突：${esc([...new Set(n.conflicts.map(c=>c.title))].join('、'))}</p><details><summary>查看两边内容</summary>${n.conflicts.map(c=>`<p class="hint">${esc(c.title)}<br>念念：${esc(c.local?c.local.title+' / '+(c.local.completed?'已完成':'未完成'):'已删除')}<br>备忘录：${esc(c.notes?c.notes.title+' / '+(c.notes.completed?'已完成':'未完成'):'已删除')}</p>`).join('')}</details><div class="size-options"><button type="button" data-resolve="local">冲突处保留念念</button><button type="button" data-resolve="notes">冲突处保留备忘录</button></div>`:''}<p class="hint">任务用 [ ] / [x] 开头；保留末尾编号。新增任务不用编号。说明可写在任务区结束标记之后。打开念念时约每 30 秒同步，退出后下次打开继续。</p><label>Agent · 标准 MCP</label><p class="hint">支持本机的 MCP 客户端，可读写任务、拆分长期目标。不绑定模型，无需 API Key。</p><button type="button" id="mcp-folder" class="layout-action">打开连接配置 ${icons.folder}</button>`,`<button type="button" id="back-settings">返回</button><button type="submit" class="primary">完成</button>`,wasOpen);
 if(wasOpen){form.querySelector(".dialog-body").scrollTop=priorScroll;if(priorFocus&&$(priorFocus))$(priorFocus).focus({preventScroll:true});}
 form.onsubmit=e=>{e.preventDefault();closeDialog();};
 $('back-settings').onclick=help;$('mcp-folder').onclick=()=>send('openMCP');
 if($('notes-accounts'))$('notes-accounts').onclick=()=>send('notesAccounts');
 if($('notes-enable'))$('notes-enable').onclick=()=>send('notesEnable',{accountId:$('notes-account').value});
 if($('notes-sync'))$('notes-sync').onclick=()=>send('notesSync');
 if($('notes-disable'))$('notes-disable').onclick=()=>send('notesDisable');
 form.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>send('notesResolve',{strategy:b.dataset.resolve}));
}

$('content').onclick=e=>{
  const button=e.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action,id=button.closest('[data-id]')?.dataset.id;
  if(action==='toggle'){commit(Nian.toggle(state.tasks,id));}
  if(action==='step')stepDialog(id);if(action==='edit')editDialog(id);
  if(action==='rotate'){spotOffset++;render();}if(action==='done'){showDone=!showDone;render();}
  if(action==='go-long'){switchTab('long');$('new-task').focus();}
};
$('tab-daily').onclick=()=>switchTab('daily');$('tab-long').onclick=()=>switchTab('long');
$('pin').innerHTML=icons.pin;$('collapse').innerHTML=icons.close;$('settings').innerHTML=icons.more;
document.querySelector('.add-button').innerHTML=icons.plus;
$('pin').onclick=()=>{const next=!state.pinned;if(native)send('pin');else{state.pinned=next;localStorage.setItem('niannian-preview',JSON.stringify(state));render();}};
$('collapse').onclick=()=>{if(native)send('collapse');else toast('Mac 应用中，点击这里收起为悬浮球');};
$('settings').onclick=help;
$('composer').onsubmit=e=>{e.preventDefault();if(saving)return;const text=$('new-task').value.trim();if(!text)return;commit(Nian.add(state.tasks,text,tab));$('new-task').value='';$('new-task').focus();};
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(document.body.classList.contains('layout-editing')&&e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const moves={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,10],ArrowDown:[0,-10]};send('movePanel',{dx:moves[e.key][0],dy:moves[e.key][1]});return;}
  if(e.key==='Escape'){e.preventDefault();if(!$('overlay').hidden)closeDialog();else send('collapse');}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();if($('overlay').hidden)$('new-task').focus();}
  if((e.metaKey||e.ctrlKey)&&(e.key==='1'||e.key==='2')&&$('overlay').hidden){e.preventDefault();switchTab(e.key==='1'?'daily':'long');}
});
// Keep unfinished tasks through midnight; completed history remains in the data file.
setInterval(()=>{if(lastDay!==Nian.day()){lastDay=Nian.day();spotOffset=0;render();}},15000);
render();send('ready');

$('finish-layout').onclick=()=>send('finishLayout');
let resizeSession=null,resizeFrame=0;
const grip=$('resize-grip');
grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();resizeSession={id:e.pointerId,x:e.screenX,y:e.screenY,w:innerWidth,h:innerHeight};grip.setPointerCapture(e.pointerId);send('beginLayout');};
grip.onpointermove=e=>{if(!resizeSession||e.pointerId!==resizeSession.id)return;const w=resizeSession.w+e.screenX-resizeSession.x,h=resizeSession.h+e.screenY-resizeSession.y;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>send('resize',{width:w,height:h}));};
function endResize(e){if(!resizeSession||e.pointerId!==resizeSession.id)return;cancelAnimationFrame(resizeFrame);send('resize',{width:resizeSession.w+e.screenX-resizeSession.x,height:resizeSession.h+e.screenY-resizeSession.y});if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);resizeSession=null;}
grip.onpointerup=endResize;grip.onpointercancel=e=>{if(resizeSession&&e.pointerId===resizeSession.id)resizeSession=null;};
grip.onclick=e=>{if(e.detail===0)help();};
