(function(root){
 'use strict';
 function next(flow,snapshot){
  if(flow.mode==='local')return {action:'local',phase:'仅在本机使用'};
  var r=snapshot.reminders||{},n=snapshot.notes||{};
  if(!r.enabled){
   if(r.running)return {action:'wait',phase:'正在连接提醒事项'};
   if(!flow.remindersStarted)return {action:'connectReminders',accountId:flow.remindersAccountId,phase:'正在连接提醒事项'};
   if((r.accounts||[]).length>1)return {action:'selectReminderAccount',phase:'选择用于任务同步的 iCloud 账户'};
   return {action:'error',phase:'提醒事项连接未完成',error:r.error||'请检查 Mac 已登录 iCloud，并开启提醒事项，然后重试。'};
  }
  if(r.error)return {action:'error',phase:'提醒事项需要处理',error:r.error};
  if(r.running||r.status!=='已同步')return {action:'wait',phase:'正在同步任务'};
  if(!flow.notesWanted)return {action:'ready',phase:'已连接'};
  if(n.enabled){
   if(n.error)return {action:'error',phase:'月度备忘录需要处理',error:n.error};
   return n.status==='已归档'?{action:'ready',phase:'已连接'}:{action:'wait',phase:'正在准备月度备忘录'};
  }
  if(!flow.accountsAsked)return {action:'readAccounts',phase:'正在连接备忘录'};
  if(n.running)return {action:'wait',phase:'正在连接备忘录'};
  if(n.error)return {action:'error',phase:'备忘录连接未完成',error:n.error};
  var accounts=(n.accounts||[]).filter(function(a){return a.isICloud;});
  if(accounts.length===1)return {action:'enableNotes',accountId:accounts[0].id,phase:'正在准备月度备忘录'};
  if(accounts.length>1)return {action:'selectAccount',phase:'选择保存月度备忘录的 iCloud 账户'};
  return {action:'error',phase:'未找到 iCloud 备忘录',error:'请在 Mac 的 iCloud 设置中开启备忘录，也可以先只连接提醒事项。'};
 }
 function localState(state){var s=JSON.parse(JSON.stringify(state));s.usageMode='local';s.cloudSetupSeen=true;s.notesSync=Object.assign({},s.notesSync||{},{enabled:false});s.remindersSync=Object.assign({},s.remindersSync||{},{enabled:false});return s;}
 var api={next:next,localState:localState};if(typeof module!=='undefined')module.exports=api;else root.NNCloudSetup=api;
})(this);
