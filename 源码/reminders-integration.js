var NNRemindersIntegration=(function(){
 var accounts=[];
 var api={},task=null,job=null,status={status:'未连接',running:false,conflicts:[]},due=0,lastScan=0,serial=0,strategy=null,RM;
 function json(p,f){try{return JSON.parse(read(p));}catch(e){return f;}}
 function remove(p){$.NSFileManager.defaultManager.removeItemAtPathError($(p),null);}
 function update(v){Object.keys(v).forEach(function(k){status[k]=v[k];});write(folder+'/reminders-status.json',JSON.stringify(status,null,2));if(started)publish();}
 function start(op,body){
  if(task)return false;var prefix=folder+'/reminders-jobs/'+Date.now()+'-'+(++serial),q={operation:op,resources:resourceFolder,dataFolder:folder};Object.keys(body||{}).forEach(function(k){q[k]=body[k];});write(prefix+'.json',JSON.stringify(q));
  ['out','err'].forEach(function(ext){$.NSFileManager.defaultManager.createFileAtPathContentsAttributes($(prefix+'.'+ext),$.NSData.data,$({}));});
  var out=$.NSFileHandle.fileHandleForWritingAtPath($(prefix+'.out')),err=$.NSFileHandle.fileHandleForWritingAtPath($(prefix+'.err'));
  task=$.NSTask.alloc.init;task.launchPath=$('/usr/bin/osascript');task.arguments=$(['-l','JavaScript',resourceFolder+'/reminders-bridge.js',prefix+'.json']);task.standardOutput=out;task.standardError=err;job={op:op,prefix:prefix,out:out,err:err,at:Date.now()};task.launch;update({status:op==='probe'?'验证提醒事项连接中':'同步中',running:true,error:null});return true;
 }
 api.setup=function(){
  (0,eval)(read(resourceFolder+'/reminders-sync.js'));RM=NNReminders;
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(folder+'/reminders-jobs'),true,$({}),null);
  if(!state.remindersSync)state.remindersSync={enabled:false};status=json(folder+'/reminders-status.json',status);status.running=false;status.status=state.remindersSync.enabled?'等待同步':'未连接';due=Date.now()+2000;
 };
 api.changed=function(){if(state.remindersSync.enabled)due=Date.now()+1200;};
 api.enable=function(accountId){accounts=[];return start('probe',accountId?{accountId:accountId}:{});};
 api.sync=function(s){strategy=s||null;due=0;lastScan=Date.now();return start('scan',{});};
 api.disable=function(){if(task)throw Error('请等待当前同步结束再停用');state.remindersSync.enabled=false;persist();update({status:'已停用',running:false});};
 function merge(result){
  if(!state.remindersSync.enabled)return;
  var p=RM.plan(state,result,new Date(),strategy);strategy=null;
  if(p.conflicts.length){update({status:'有同步冲突',running:false,conflicts:p.conflicts,error:'同一任务两边都有修改，请选择保留方向'});due=0;return;}
  if(JSON.stringify(state.tasks)!==JSON.stringify(p.state.tasks)){state=p.state;persist();publish();}
  due=0;
  if(!p.ops.length&&JSON.stringify(p.meta)===JSON.stringify(result.meta)){lastScan=Date.now();update({status:'已同步',running:false,error:null,errorCode:null,conflicts:[],lastSyncedAt:new Date().toISOString()});return;}
  start('write',{expectedRevision:result.meta.revision,plan:{meta:p.meta,ops:p.ops}});
 }
 function poll(){
  if(!task)return;if(task.isRunning){if(Date.now()-job.at>90000){task.terminate;update({status:'同步超时',running:false,error:'提醒事项未及时响应，请检查授权'});}return;}
  job.out.closeFile;job.err.closeFile;var result=json(job.prefix+'.out',null),op=job.op;['json','out','err'].forEach(function(ext){remove(job.prefix+'.'+ext);});task=null;job=null;
  if(!result||!result.ok){accounts=result&&result.accounts||[];update({status:'同步未完成',running:false,error:result?result.error:'提醒事项未返回有效结果',errorCode:result&&result.code});lastScan=Date.now();return;}
  try{
   if(op==='probe'){
    write(folder+'/tasks-before-reminders.json',JSON.stringify(state,null,2));
    state.remindersSync={enabled:true,accountName:result.meta.accountName};state.notesSync.direction='archive';
    persist();remove(folder+'/reminders-activate.request');update({status:'连接验证通过',running:false,error:null,conflicts:[]});merge(result);
   }else if(op==='scan')merge(result);
   else if(op==='write'){lastScan=Date.now();update({status:'已同步',running:false,error:null,conflicts:[],lastSyncedAt:result.meta.lastSyncedAt,errorCode:null});}
  }catch(e){update({status:'同步需确认',running:false,error:String(e.message||e)});}
 }
 api.tick=function(notesBusy){
  poll();if(!task&&!notesBusy&&read(folder+'/reminders-activate.request')){remove(folder+'/reminders-activate.request');api.enable();return;}
  if(!task&&state.remindersSync.enabled&&!status.conflicts.length&&((due&&Date.now()>=due)||Date.now()-lastScan>15000)){due=0;lastScan=Date.now();start('scan',{});}
 };
 api.snapshot=function(){return {accounts:accounts,enabled:!!state.remindersSync.enabled,status:status.status,running:status.running,error:status.error||null,conflicts:status.conflicts||[],lastSyncedAt:status.lastSyncedAt||null};};
 api.handle=function(m){switch(m.type){case 'remindersEnable':api.enable();return true;case 'remindersSync':api.sync();return true;case 'remindersDisable':api.disable();return true;case 'remindersResolve':api.sync(m.strategy);return true;case 'openReminders':$.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath($('/System/Applications/Reminders.app')));return true;default:return false;}};
 return api;
})();
