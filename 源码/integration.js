var NNIntegration=(function(){
 var reminders,RM,storage,lastHousekeeping=0,styleAdoption=null,cloudFlow=null,cloudState={connecting:false,notesWanted:true},cloudPolicy;
 var api={ready:false},agent,notes,model,meta,status,accounts=[],task=null,job=null,pendingDocs={},resolveStrategy=null;
 var dirs={},lastTasks=[],lastTaskJSON='',lastMonth='',syncDue=0,lastScan=0,lastHeartbeat=0,serial=0;
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function json(path,fallback){try{var raw=read(path);return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
 function mkdir(path){$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(path),true,$({}),null);}
 function remove(path){$.NSFileManager.defaultManager.removeItemAtPathError($(path),null);}
 function saveMeta(){write(folder+'/notes-sync.json',JSON.stringify(meta,null,2));}
 function updateStatus(values){Object.keys(values).forEach(function(k){status[k]=values[k];});status.updatedAt=new Date().toISOString();write(folder+'/notes-status.json',JSON.stringify(status,null,2));if(started)publish();}
 function archive(){
  var m=notes.month(),old=json(dirs.monthly+'/'+m+'.json',null),rows=notes.rowsForMonth(state,m,old);
  write(dirs.monthly+'/'+m+'.json',JSON.stringify({month:m,updatedAt:new Date().toISOString(),rows:rows},null,2));lastMonth=m;
 }
 api.setup=function(){
  (0,eval)(read(resourceFolder+'/agent.js'));agent=NNAgent;(0,eval)(read(resourceFolder+'/notes-sync.js'));notes=NNNotes;(0,eval)(read(resourceFolder+'/model.js'));model=Nian;
  dirs={requests:folder+'/agent-requests',replies:folder+'/agent-replies',monthly:folder+'/monthly',jobs:folder+'/notes-jobs'};Object.keys(dirs).forEach(function(k){mkdir(dirs[k]);});
  meta=json(folder+'/notes-sync.json',{keys:{},months:{}});meta.keys=meta.keys||{};meta.months=meta.months||{};
  status=json(folder+'/notes-status.json',{status:'未启用',running:false,conflicts:[]});status.running=false;
  if(!state.notesSync)state.notesSync={enabled:false,folderName:'念念',direction:'two-way'};
  (0,eval)(read(resourceFolder+'/reminders-integration.js'));reminders=NNRemindersIntegration;reminders.setup();RM=NNReminders;(0,eval)(read(resourceFolder+'/storage.js'));storage=NNStorage;(0,eval)(read(resourceFolder+'/cloud-setup.js'));cloudPolicy=NNCloudSetup;
  if(!state.usageMode&&(state.remindersSync.enabled||state.notesSync.enabled))state.usageMode='icloud';else if(!state.usageMode&&state.cloudSetupSeen)state.usageMode='local';
  lastTasks=clone(state.tasks);lastTaskJSON=JSON.stringify(state.tasks);api.ready=true;housekeeping();archive();syncDue=Date.now()+3000;
  updateStatus({status:state.notesSync.enabled?'等待同步':'未启用',running:false});
 };
 api.beforePersist=function(){
  var ids={};state.tasks.forEach(function(t){ids[t.id]=true;});
  lastTasks.forEach(function(t){if(!ids[t.id]){state.trash=state.trash||[];if(!state.trash.some(function(x){return x.task.id===t.id;}))state.trash.push({task:clone(t),deletedAt:new Date().toISOString(),source:'app'});}});
 };
 api.afterPersist=function(){
  var current=JSON.stringify(state.tasks);if(current!==lastTaskJSON&&reminders)reminders.changed();if(current!==lastTaskJSON||lastMonth!==notes.month()){archive();syncDue=Date.now()+1500;}
  lastTaskJSON=current;lastTasks=clone(state.tasks);
 };
 function startBridge(operation,body){
  if(state.usageMode==='local')throw Error('当前仅在本机使用；请先从设置选择连接 iCloud');
  if(task&&task.isRunning)return false;
  var key=String(Date.now())+'-'+(++serial),prefix=dirs.jobs+'/'+key;
  var request={operation:operation,accountId:state.notesSync.accountId,folderId:meta.folderId||null,resources:resourceFolder,archiveMode:state.notesSync.direction==='archive',backupFolder:folder+'/notes-backups'};Object.keys(body||{}).forEach(function(k){request[k]=body[k];});
  write(prefix+'.json',JSON.stringify(request));
  $.NSFileManager.defaultManager.createFileAtPathContentsAttributes($(prefix+'.out'),$.NSData.data,$({}));
  $.NSFileManager.defaultManager.createFileAtPathContentsAttributes($(prefix+'.err'),$.NSData.data,$({}));
  var stdout=$.NSFileHandle.fileHandleForWritingAtPath($(prefix+'.out')),stderr=$.NSFileHandle.fileHandleForWritingAtPath($(prefix+'.err'));
  task=$.NSTask.alloc.init;task.launchPath=$('/usr/bin/osascript');task.arguments=$(['-l','JavaScript',resourceFolder+'/notes-bridge.js',prefix+'.json']);task.standardOutput=stdout;task.standardError=stderr;
  job={operation:operation,prefix:prefix,started:Date.now(),stdout:stdout,stderr:stderr};task.launch;
  updateStatus({status:operation==='accounts'?'读取 iCloud 账户中':'同步中',running:true,error:null});return true;
 }
 function scan(){if(!state.notesSync.enabled)return;lastScan=Date.now();startBridge('scan',{months:meta.months});}
 function planWrite(scanResult){
  if(state.notesSync.direction==='archive')return planArchive(scanResult);
  if(!state.notesSync.enabled){updateStatus({status:'已停用',running:false});return;}
  if(scanResult.missing&&scanResult.missing.length){updateStatus({status:'需要重新连接',running:false,error:'月度备忘录已被移走或删除，清单任务已保留',missing:scanResult.missing});return;}
  if(scanResult.folderId)meta.folderId=scanResult.folderId;
  var next=clone(state),changed={},conflicts=[];
  (scanResult.changed||[]).forEach(function(remote){
   changed[remote.month]=remote;
   if(remote.attachments)throw Error('同步笔记中有附件，已暂停自动改写以保留附件');
   var parsed=notes.parse(remote.plain,remote.month),base=meta.months[remote.month];
   var merged=notes.merge(next,base?base.base:[],parsed,meta.keys,model,new Date(),resolveStrategy);
   next=merged.state;conflicts=conflicts.concat(merged.conflicts);
  });
  if(conflicts.length){resolveStrategy=null;updateStatus({status:'有同步冲突',running:false,conflicts:conflicts,error:'同一任务两边都有改动，请选择保留方向'});return;}
  resolveStrategy=null;
  if(JSON.stringify(next.tasks)!==JSON.stringify(state.tasks)){state=next;persist();publish();}
  var months=Object.keys(meta.months),current=notes.month();if(months.indexOf(current)<0)months.push(current);
  var docs=[];pendingDocs={};
  months.sort().forEach(function(m){
   var old=meta.months[m],rendered=notes.render(state,m,meta,json(dirs.monthly+'/'+m+'.json',null));meta.keys=rendered.keys;
   var remote=changed[m],modified=remote?remote.modifiedAt:old&&old.modifiedAt;
   if(!old||rendered.signature!==old.signature){
    var doc={month:m,title:rendered.title,html:rendered.html,noteId:old?old.noteId:null,expectedModifiedAt:modified||null,expectedPlain:remote?remote.plain:old&&old.plain};docs.push(doc);pendingDocs[m]=rendered;
   }else if(remote&&old){old.modifiedAt=remote.modifiedAt;old.plain=remote.plain;}
  });
  saveMeta();
  if(docs.length)startBridge('write',{documents:docs});
  else updateStatus({status:state.notesSync.direction==='archive'?'已归档':'已同步',running:false,conflicts:[],error:null,lastSyncedAt:new Date().toISOString(),month:current});
 }
 function planArchive(result){
  if(!state.notesSync.enabled)return;
  if(result.missing&&result.missing.length)throw Error('月度备忘录已被移走或删除，请重新连接');
  if(result.folderId)meta.folderId=result.folderId;
  var changed={};(result.changed||[]).forEach(function(r){changed[r.month]=r;});
  var months=Object.keys(meta.months),m=notes.month();if(months.indexOf(m)<0)months.push(m);var docs=[];pendingDocs={};
  months.sort().forEach(function(month){
   var old=meta.months[month],remote=changed[month];
   if(styleAdoption&&styleAdoption.month===month){
    var actualPlain=remote?remote.plain:old&&old.plain,actualModified=remote?remote.modifiedAt:old&&old.modifiedAt;
    if(!old||old.noteId!==styleAdoption.noteId||actualPlain!==styleAdoption.plain||actualModified!==styleAdoption.modifiedAt)throw Error('备忘录又发生变化，请重新读取手动格式；原文已保留');
    old=clone(old);old.plain=actualPlain;old.modifiedAt=actualModified;old.signature='';
    var tailAt=actualPlain.lastIndexOf('\n随记\n');old.archiveTail=tailAt>=0?actualPlain.slice(tailAt+4).trim():'';
    remote=null;styleAdoption=null;
   }
   if(remote&&(remote.attachments||old&&remote.plain!==old.plain))throw Error('月度备忘录有手动修改，已保留原文并暂停归档；任务同步继续');
   var rows=notes.rowsForMonth(state,month,json(dirs.monthly+'/'+month+'.json',null)),rendered=RM.archive(state,month,rows,notes.hash);
   var tail=old&&old.archiveTail;
   if(old&&old.format!=='monthly-archive-v1'){try{tail=notes.parse(old.plain,month).tail.trim();}catch(e){throw Error('原备忘录格式已变化，已保留原文');}}
   if(tail){rendered.html+='<h3 style="font-size:14px">随记</h3><div>'+String(tail).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')+'<br></div>';rendered.signature+=':'+notes.hash(tail);}rendered.archiveTail=tail||'';
   if(!old||old.signature!==rendered.signature){docs.push({month:month,title:rendered.title,html:rendered.html,noteId:old?old.noteId:null,initialMigration:!!old&&old.format!=='monthly-archive-v1',expectedPlain:old&&old.plain,expectedModifiedAt:old&&old.modifiedAt});pendingDocs[month]=rendered;}
  });
  if(docs.length)startBridge('write',{documents:docs});else updateStatus({status:'已归档',running:false,error:null,lastSyncedAt:new Date().toISOString(),conflicts:[]});
 }
 function processWritten(result){
  if(result.folderId)meta.folderId=result.folderId;
  (result.written||[]).forEach(function(item){var rendered=pendingDocs[item.month];if(!rendered)return;meta.months[item.month]={noteId:item.noteId,modifiedAt:item.modifiedAt,base:rendered.rows,signature:rendered.signature,plain:item.plain,format:state.notesSync.direction==='archive'?'monthly-archive-v1':'legacy-text',archiveTail:rendered.archiveTail||''};});saveMeta();
 }
 function pollBridge(){
  if(!task)return;
  if(task.isRunning){if(Date.now()-job.started>120000){task.terminate;updateStatus({status:'同步超时',running:false,error:'备忘录未及时响应，请检查系统授权或 iCloud 状态'});}return;}
  job.stdout.closeFile;job.stderr.closeFile;
  var result=json(job.prefix+'.out',null),operation=job.operation,err=read(job.prefix+'.err');['.json','.out','.err'].forEach(function(ext){remove(job.prefix+ext);});task=null;job=null;
  if(operation==='write'&&result)processWritten(result);
  if(!result||!result.ok){updateStatus({status:'同步未完成',running:false,error:result?result.error:'备忘录接口未返回有效结果',errorCode:result&&result.code});return;}
  try{
   if(operation==='accounts'){accounts=result.accounts||[];updateStatus({status:accounts.some(function(a){return a.isICloud;})?'可连接 iCloud':'未找到 iCloud 备忘录账户',running:false,error:null});}
   else if(operation==='scan')planWrite(result);
   else if(operation==='write')updateStatus({status:state.notesSync.direction==='archive'?'已归档':'已同步',running:false,conflicts:[],error:null,lastSyncedAt:new Date().toISOString(),month:notes.month()});
  }catch(e){updateStatus({status:'同步需确认',running:false,error:String(e.message||e)});}
 }
 api.requestAccounts=function(){return startBridge('accounts',{});};
 api.enableNotes=function(accountId){
  var account=accounts.find(function(a){return a.id===accountId&&a.isICloud;});if(!account)throw Error('请先读取并选择 iCloud 备忘录账户');
  if(status.missing){status.missing.forEach(function(m){delete meta.months[m];});status.missing=[];saveMeta();}
  state.notesSync={enabled:true,accountId:account.id,accountName:account.name,folderName:'念念',direction:state.remindersSync&&state.remindersSync.enabled?'archive':'two-way'};persist();syncDue=Date.now();updateStatus({status:'准备同步',conflicts:[],error:null});
 };
 api.disableNotes=function(){state.notesSync.enabled=false;persist();updateStatus({status:'已停用',running:!!task});};
 api.syncNow=function(strategy){if(!state.notesSync.enabled)throw Error('请先连接 iCloud 备忘录');if(strategy&&strategy!=='local'&&strategy!=='notes')throw Error('同步方向无效');resolveStrategy=strategy||null;syncDue=Date.now();if(!task)scan();return {started:true,status:status.status};};
 api.snapshot=function(){cloudState.mode=state.usageMode||'local';return {cloud:cloudState,reminders:reminders.snapshot(),notes:{archiveOnly:state.notesSync.direction==='archive',enabled:!!state.notesSync.enabled,status:status.status,running:!!status.running,error:status.error||null,accounts:accounts,lastSyncedAt:status.lastSyncedAt||null,conflicts:status.conflicts||[]},mcp:{transport:'stdio',vendorNeutral:true}};};
 api.handle=function(message){
  if(message.type==='useLocal'){if(task||reminders.snapshot().running)throw Error('当前同步尚未结束，请稍等片刻再切换');cloudFlow=null;cloudState={connecting:false,ready:false,notesWanted:true,mode:'local'};state=cloudPolicy.localState(state);syncDue=0;remove(folder+'/reminders-activate.request');reminders.disable();updateStatus({status:'仅在本机使用',running:false,error:null,conflicts:[]});return true;}
  if(message.type==='cloudConnect'){state.usageMode='icloud';persist();cloudFlow={notesWanted:message.notesWanted!==false,remindersStarted:false,accountsAsked:false};cloudState={connecting:true,notesWanted:cloudFlow.notesWanted,phase:'准备连接',error:null};publish();return true;}
  if(message.type==='cloudSetupDismiss'){cloudFlow=null;cloudState.connecting=false;state.cloudSetupSeen=true;persist();return true;}
  if(message.type==='cloudSelectAccount'){if(message.service==='reminders'){if(!cloudFlow||!reminders.snapshot().accounts.some(function(a){return a.isICloud&&a.id===message.accountId;}))throw Error('请先选择读取到的 iCloud 账户');cloudFlow.remindersAccountId=message.accountId;cloudFlow.remindersStarted=false;}else api.enableNotes(message.accountId);if(cloudFlow){cloudState.connecting=true;cloudState.needsAccount=false;}return true;}
  if(message.type==='openCloudHelp'){$.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString($('https://support.apple.com/zh-cn/guide/icloud/mmbf52194b5a/icloud')));return true;}
  if(message.type==='remindersEnable'&&task)throw Error('请等待备忘录同步结束后连接');
  if(reminders.handle(message))return true;
  switch(message.type){
   case 'notesAccounts':api.requestAccounts();return true;
   case 'notesEnable':api.enableNotes(message.accountId);return true;
   case 'notesDisable':api.disableNotes();return true;
   case 'notesSync':api.syncNow();return true;
   case 'notesResolve':api.syncNow(message.strategy);return true;
   case 'openMCP':$.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath($(ObjC.unwrap($(folder).stringByDeletingLastPathComponent)+'/MCP')));return true;
   default:return false;
  }
 };
 function reply(id,value,error){write(dirs.replies+'/'+id+'.json',JSON.stringify(error?{ok:false,error:String(error.message||error)}:{ok:true,result:value}));}
 function processRequests(){
  var names=$.NSFileManager.defaultManager.contentsOfDirectoryAtPathError($(dirs.requests),null),pending=[];
  for(var i=0;i<names.count;i++){var name=ObjC.unwrap(names.objectAtIndex(i));if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;var req=json(dirs.requests+'/'+name,null);if(req)pending.push({name:name,request:req});}
  pending.sort(function(a,b){return a.request.createdAt-b.request.createdAt;});
  pending.slice(0,10).forEach(function(item){
   var req=item.request;if(req.id+'.json'!==item.name){remove(dirs.requests+'/'+item.name);return;}
   if(req.expiresAt<Date.now()){reply(req.id,null,Error('请求已过期，未执行'));remove(dirs.requests+'/'+item.name);return;}
   state.agentReceipts=state.agentReceipts||{};
   if(state.agentReceipts[req.id]){reply(req.id,state.agentReceipts[req.id].result);remove(dirs.requests+'/'+item.name);return;}
   var previousState=clone(state);
   try{
    var result;
    if(req.operation==='sync_reminders_now')result=reminders.sync();
    else if(req.operation==='resolve_reminders_conflicts')result=reminders.sync(req.params.strategy);
    else if(req.operation==='sync_notes_now')result=api.syncNow();
    else if(req.operation==='resolve_notes_conflicts')result=api.syncNow(req.params.strategy);
    else{var applied=agent.apply(state,req.operation,req.params,model,new Date());state=applied.state;result=applied.result;}
    state.agentReceipts[req.id]={at:Date.now(),result:result};var ids=Object.keys(state.agentReceipts);if(ids.length>500)ids.sort(function(a,b){return state.agentReceipts[a].at-state.agentReceipts[b].at;}).slice(0,ids.length-500).forEach(function(id){delete state.agentReceipts[id];});
    persist();reply(req.id,result);publish();remove(dirs.requests+'/'+item.name);remove(folder+'/agent-launch.request');
   }catch(e){state=previousState;reply(req.id,null,e);remove(dirs.requests+'/'+item.name);}
  });
 }
 function runCloudSetup(){
  if(!cloudFlow)return;
  var action=cloudPolicy.next(cloudFlow,{reminders:reminders.snapshot(),notes:{enabled:!!state.notesSync.enabled,status:status.status,running:status.running,error:status.error,accounts:accounts}}),previous=JSON.stringify(cloudState);
  cloudState.phase=action.phase;cloudState.needsAccount=action.action==='selectAccount'||action.action==='selectReminderAccount';cloudState.accountKind=action.action==='selectReminderAccount'?'reminders':'notes';cloudState.accountOptions=action.action==='selectReminderAccount'?reminders.snapshot().accounts:accounts.filter(function(a){return a.isICloud;});
  if(action.action==='connectReminders'&&!task){if(reminders.enable(action.accountId))cloudFlow.remindersStarted=true;}
  else if(action.action==='readAccounts'&&!task){if(api.requestAccounts())cloudFlow.accountsAsked=true;}
  else if(action.action==='enableNotes'&&!task)api.enableNotes(action.accountId);
  else if(action.action==='error'){cloudState.error=action.error;cloudState.connecting=false;cloudFlow=null;}
  else if(action.action==='ready'){cloudState.error=null;cloudState.connecting=false;cloudState.ready=true;cloudFlow=null;state.cloudSetupSeen=true;persist();}
  if(previous!==JSON.stringify(cloudState))publish();
 }
 function housekeeping(){
  lastHousekeeping=Date.now();
  ['notes-jobs','reminders-jobs','agent-replies'].forEach(function(dir){
   var path=folder+'/'+dir,names=$.NSFileManager.defaultManager.contentsOfDirectoryAtPathError($(path),null);
   if(!names)return;for(var i=0;i<names.count;i++){
    var n=ObjC.unwrap(names.objectAtIndex(i)),attrs=$.NSFileManager.defaultManager.attributesOfItemAtPathError($(path+'/'+n),null),d=attrs&&attrs.objectForKey($.NSFileModificationDate);
    if(d&&storage.expiredCache(n,Number(d.timeIntervalSince1970)*1000,Date.now()))remove(path+'/'+n);
   }
  });
 }
 api.tick=function(){
  if(Date.now()-lastHousekeeping>3600000)housekeeping();
  if(Date.now()-lastHeartbeat>2000){lastHeartbeat=Date.now();write(folder+'/agent-heartbeat.json',JSON.stringify({at:Date.now(),pid:$.NSProcessInfo.processInfo.processIdentifier}));}
  processRequests();reminders.tick(!!task);pollBridge();runCloudSetup();
  if(!task&&read(folder+'/notes-adopt-style.request')){styleAdoption=json(folder+'/notes-adopt-style.request',null);remove(folder+'/notes-adopt-style.request');syncDue=Date.now();}
  if(lastMonth!==notes.month()){archive();syncDue=Date.now();}
  if(state.notesSync.enabled&&!task&&!reminders.snapshot().running&&(Date.now()>=syncDue&&syncDue>0||Date.now()-lastScan>30000)){syncDue=0;scan();}
 };
 return api;
})();
