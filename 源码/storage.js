(function(root){
 'use strict';
 // Only generated rolling snapshots qualify; original records and migration backups never do.
 function oldBackups(names){return names.filter(function(n){return /^\d{4}-\d{2}-\d{13}\.json$/.test(n);}).sort().reverse().slice(30);}
 function expiredCache(name,modifiedAt,now){return /^(?:\d{13}-\d+\.(?:json|out|err)|[0-9a-f-]{36}\.json)$/.test(name)&&modifiedAt>0&&now-modifiedAt>86400000;}
 var api={oldBackups:oldBackups,expiredCache:expiredCache};if(typeof module!=='undefined')module.exports=api;else root.NNStorage=api;
})(this);
