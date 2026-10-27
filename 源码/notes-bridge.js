ObjC.import('Foundation');
function readJSON(path){var s=$.NSString.stringWithContentsOfFileEncodingError($(path),$.NSUTF8StringEncoding,null);if(!s)throw Error('同步请求无法读取');return JSON.parse(ObjC.unwrap(s));}
function run(args){
 var written=[],savedFolderId=null;
 try{
  var request=readJSON(args[0]),notes=Application('com.apple.Notes');
  if(request.archiveMode){var policy=$.NSString.stringWithContentsOfFileEncodingError($(request.resources+'/storage.js'),$.NSUTF8StringEncoding,null);if(!policy)throw Error('无法读取存储策略');(0,eval)(ObjC.unwrap(policy));}
  var accounts=notes.accounts(),account=null;
  if(request.operation==='accounts')return JSON.stringify({ok:true,accounts:accounts.map(function(a){var name=a.name();return {id:a.id(),name:name,isICloud:/icloud/i.test(name)};})});
  for(var i=0;i<accounts.length;i++)if(accounts[i].id()===request.accountId)account=accounts[i];
  if(!account)throw Error('未找到所选备忘录账户，请重新连接');
  if(!/icloud/i.test(account.name()))throw Error('请选择 iCloud 备忘录账户，才能同步到 iPhone');
  var folders=account.folders(),folder=null;
  for(var j=0;j<folders.length;j++)if(request.folderId?folders[j].id()===request.folderId:folders[j].name()==='念念')folder=folders[j];
  if(folder&&folder.shared())throw Error('念念同步文件夹需要是私人文件夹');
  if(!folder&&request.folderId)throw Error('原同步文件夹已不存在；为保留现有笔记，请在念念中重新连接');
  if(request.operation==='scan'){
   var all=folder?folder.notes():[],byId={};all.forEach(function(n){byId[n.id()]=n;});var changed=[],missing=[];
   Object.keys(request.months||{}).forEach(function(m){
    var info=request.months[m],note=byId[info.noteId];if(!note){missing.push(m);return;}
    if(note.passwordProtected())throw Error(m+' 的同步备忘录已锁定，请在备忘录中解锁后同步');
    var modified=note.modificationDate().toISOString(),plain=note.plaintext();
    if(modified!==info.modifiedAt||plain!==info.plain)changed.push({month:m,noteId:info.noteId,plain:plain,modifiedAt:modified,attachments:note.attachments().length});
   });
   return JSON.stringify({ok:true,folderId:folder?folder.id():null,changed:changed,missing:missing});
  }
  if(request.operation==='write'){
   if(!folder)folder=notes.make({new:'folder',at:account,withProperties:{name:'念念'}});
   savedFolderId=folder.id();
   var existing=folder.notes(),index={};existing.forEach(function(n){index[n.id()]=n;});written=[];
   (request.documents||[]).forEach(function(doc){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(doc.month))throw Error('月份格式无效');
    var note=doc.noteId?index[doc.noteId]:null;
    if(doc.noteId&&!note)throw Error(doc.month+' 的备忘录已被移走或删除，已暂停覆盖');
    if(note&&doc.expectedPlain!==undefined&&note.plaintext()!==doc.expectedPlain)throw Error('备忘录刚刚发生变化，将在下一次同步时重新合并');
    if(note&&doc.expectedModifiedAt&&note.modificationDate().toISOString()!==doc.expectedModifiedAt)throw Error('备忘录刚刚发生变化，将在下一次同步时重新合并');
    if(note&&note.passwordProtected())throw Error('请先解锁同步备忘录');
    if(note&&note.attachments().length)throw Error('同步区域包含附件，已暂停改写以保留附件');
    var html=doc.html;
    if(note){
     var previous=note.body();
     if(request.archiveMode){
      $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(request.backupFolder),true,$({}),null);
      if(doc.initialMigration){var permanent=ObjC.unwrap($(request.backupFolder).stringByDeletingLastPathComponent)+'/notes-before-reminders';$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(permanent),true,$({}),null);var original=permanent+'/'+doc.month+'.json';if(!$.NSFileManager.defaultManager.fileExistsAtPath($(original))&&!$(JSON.stringify({noteId:note.id(),body:previous,plain:note.plaintext()})).writeToFileAtomicallyEncodingError($(original),true,$.NSUTF8StringEncoding,null))throw Error('原始记录备份失败，未改写备忘录');}
     var backup=request.backupFolder+'/'+doc.month+'-'+Date.now()+'.json';
      if(!$(JSON.stringify({noteId:note.id(),body:previous,plain:note.plaintext(),at:new Date().toISOString()})).writeToFileAtomicallyEncodingError($(backup),true,$.NSUTF8StringEncoding,null))throw Error('归档前备份失败，未改写备忘录');
     }else{
     var marker='—— 念念任务区结束 ——',at=previous.indexOf(marker);
     if(at<0)throw Error('同步结束标记被修改，已保留备忘录原文');
     var suffix=previous.slice(at+marker.length),close=suffix.search(/<\/(?:div|p)>/i);
     if(close>=0){var closing=suffix.slice(close).match(/^<\/(?:div|p)>/i)[0];html+=suffix.slice(close+closing.length);}
     }
     note.body=html;
    }else note=notes.make({new:'note',at:folder,withProperties:{body:html}});
    if(request.archiveMode){
     var backupNames=$.NSFileManager.defaultManager.contentsOfDirectoryAtPathError($(request.backupFolder),null),rolling=[];
     if(backupNames)for(var bi=0;bi<backupNames.count;bi++){var bn=ObjC.unwrap(backupNames.objectAtIndex(bi));if(/^\d{4}-\d{2}-\d{13}\.json$/.test(bn))rolling.push(bn);}
     NNStorage.oldBackups(rolling).forEach(function(name){$.NSFileManager.defaultManager.removeItemAtPathError($(request.backupFolder+'/'+name),null);});
    }
    written.push({month:doc.month,noteId:note.id(),modifiedAt:note.modificationDate().toISOString(),plain:note.plaintext()});
   });
   return JSON.stringify({ok:true,folderId:folder.id(),written:written});
  }
  throw Error('未知的备忘录操作');
 }catch(e){return JSON.stringify({ok:false,error:String(e.message||e),code:e.errorNumber||e.number||null,written:written,folderId:savedFolderId});}
}
