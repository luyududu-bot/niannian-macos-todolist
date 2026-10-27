ObjC.import('Foundation');
function run(args){
 function read(p){var s=$.NSString.stringWithContentsOfFileEncodingError($(p),$.NSUTF8StringEncoding,null);return s?ObjC.unwrap(s):null;}
 function write(p,v){if(!$(JSON.stringify(v,null,2)).writeToFileAtomicallyEncodingError($(p),true,$.NSUTF8StringEncoding,null))throw Error('提醒事项连接记录保存失败');}
 function json(p,f){var s=read(p);return s?JSON.parse(s):f;}
 var q=json(args[0],{}),R,meta,path,phase="连接账户";
 try{
  (0,eval)(read(q.resources+'/reminders-sync.js'));
  R=Application('/System/Applications/Reminders.app');path=q.dataFolder+'/reminders-sync.json';
  meta=json(path,{revision:0,links:{},base:{},lists:{}});
  function save(){meta.revision=(meta.revision||0)+1;write(path,meta);}
  if(q.accountId){if(meta.accountId&&meta.accountId!==q.accountId)throw Error('现有任务已连接其他账户，已保留原连接');meta.accountId=q.accountId;}
  function account(){var all=R.accounts(),choices=all.filter(function(x){return meta.accountId?x.id()===meta.accountId:/icloud/i.test(x.name());});if(choices.length>1){var e=Error('请选择用于任务同步的 iCloud 账户');e.accounts=choices.map(function(x){return {id:x.id(),name:x.name(),isICloud:true};});throw e;}var a=choices[0];if(!a||!/icloud/i.test(a.name()))throw Error('提醒事项中未找到 iCloud 账户，请先启用 iCloud 提醒事项');return a;}
  var A=account();
  function list(kind,create){
   var found=null,all=A.lists();all.forEach(function(x){if(x.id()===meta.lists[kind])found=x;});
   if(found)return found;
   if(meta.lists[kind]){
    if(kind==='removed'&&create){delete meta.lists.removed;save();}
    else throw Error('念念提醒事项列表已被移走或删除，已暂停同步以保留任务');
   }
   if(!create)return null;
   var name='念念 · '+({daily:'每日',long:'长期',removed:'已移除'}[kind]);
   if(all.some(function(x){return x.name()===name;}))throw Error('已有同名列表“'+name+'”，请先改名以避免混入其他任务');
   found=R.make({new:'list',at:A,withProperties:{name:name}});meta.lists[kind]=found.id();meta.accountId=A.id();meta.accountName=A.name();save();return found;
  }
  function iso(d){try{return d&&isFinite(d.getTime())?d.toISOString():null;}catch(e){return null;}}
  function day(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  function row(r,kind){var p=r.properties(),dt=p.alldayDueDate||p.dueDate;return {remoteId:p.id,title:p.name,kind:kind,day:kind==='daily'?(iso(dt)?day(dt):(iso(p.creationDate)?day(p.creationDate):day(new Date()))):null,completedAt:p.completed?(iso(p.completionDate)||iso(p.modificationDate)||new Date().toISOString()):null,createdAt:iso(p.creationDate)};}
  function scan(){var rows=[];['daily','long'].forEach(function(k){var l=list(k,false);if(l)l.reminders().forEach(function(r){rows.push(row(r,k));});});return {ok:true,meta:meta,rows:rows};}
  function lookup(id){var found=null;['daily','long'].forEach(function(k){var l=list(k,false);if(l)l.reminders().forEach(function(r){if(r.id()===id)found={item:r,kind:k};});});return found;}
  function set(r,f,old){
   if(!old||old.title!==f.title)r.name=f.title;
   if(f.kind==='daily'&&(!old||old.day!==f.day||old.kind!==f.kind)){if(!NNReminders.validDay(f.day))throw Error('日期无效');r.alldayDueDate=new Date(f.day+'T12:00:00');}
   // Preserve any native date/time when moving to Long; the list determines the task type.
   if(!old||old.completed!==f.completed)r.completed=f.completed;
  }
  if(q.operation==='connect'||q.operation==='probe'){
   list('daily',true);list('long',true);
   if(q.operation==='probe'){
    var test=R.make({new:'reminder',at:list('daily',false),withProperties:{name:'念念连接验证（临时）'}}),testId=test.id();
    try{
     phase='设置全天日期';test.alldayDueDate=new Date('2026-10-27T12:00:00');phase='勾选任务';test.completed=true;
     if(!test.completed()||day(test.alldayDueDate())!=='2026-10-27')throw Error('日期或完成状态未通过写入验证');
     phase='改名和取消勾选';test.name='念念连接验证已修改（临时）';test.completed=false;
     if(test.completed()||test.name()!=='念念连接验证已修改（临时）')throw Error('改名或取消勾选未通过验证');
     phase='移动任务';R.move(test,{to:list('long',false)});test=lookup(testId).item;phase='验证移动';
     if(lookup(testId).kind!=='long')throw Error('移动任务未通过验证');
     meta.verifiedAt=new Date().toISOString();save();
    }finally{try{if(test.id()===testId)R.delete(test);}catch(cleanup){throw Error('验证任务未清理，请删除“念念连接验证（临时）”后重试');}}
   }
   return JSON.stringify(scan());
  }
  if(q.operation==='scan')return JSON.stringify(scan());
  if(q.operation==='write'){
   if(meta.revision!==q.expectedRevision)throw Error('连接记录刚刚改变，将重新读取后合并');
   if(!meta.verifiedAt)throw Error('请先完成提醒事项连接验证');
   var planned=q.plan;
   // Import bindings and already-agreed fields before writing; each mutation journals its own base.
   meta.links=planned.meta.links;meta.base=planned.meta.base;save();
   planned.ops.forEach(function(op){phase='写入 '+op.type;
    var found=op.remoteId?lookup(op.remoteId):null;
    if(op.type!=='create'&&(!found||!NNReminders.equal(NNReminders.fields(row(found.item,found.kind)),op.expected)))throw Error('提醒事项刚刚有修改，将重新读取并合并');
    if(op.type==='create'){
     if(meta.links[op.id])throw Error('任务已经建立连接，将重新读取');
     var created=R.make({new:'reminder',at:list(op.desired.kind,false),withProperties:{name:op.desired.title}});
     // Persist the native ID immediately, so a subsequent write failure cannot create a duplicate.
     meta.links[op.id]=created.id();meta.base[op.id]=NNReminders.fields(row(created,op.desired.kind));save();
     set(created,op.desired,null);
     var actual=NNReminders.fields(row(created,op.desired.kind));if(!NNReminders.equal(actual,op.desired))throw Error('新增提醒事项未通过回读验证');meta.base[op.id]=actual;save();
    }else if(op.type==='update'){
     if(found.kind!==op.desired.kind){R.move(found.item,{to:list(op.desired.kind,false)});found=lookup(op.remoteId);}
     set(found.item,op.desired,op.expected);
     var after=NNReminders.fields(row(found.item,op.desired.kind));if(!NNReminders.equal(after,op.desired))throw Error('提醒事项修改未通过回读验证');meta.base[op.id]=after;save();
    }else if(op.type==='remove'){
     // Keep a recoverable copy in our own list, rather than permanently deleting from iCloud.
     R.move(found.item,{to:list('removed',true)});delete meta.links[op.id];delete meta.base[op.id];save();
    }else throw Error('未知的提醒事项写入操作');
   });
   meta.lastSyncedAt=new Date().toISOString();save();return JSON.stringify(scan());
  }
  throw Error('未知的提醒事项操作');
 }catch(e){return JSON.stringify({ok:false,accounts:e.accounts||[],error:phase+'：'+String(e.message||e),code:e.errorNumber||e.number||null});}
}
