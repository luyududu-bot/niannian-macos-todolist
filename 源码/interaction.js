(function(root){
  'use strict';
  function reduce(current, action){
    var next={view:current.view,pinned:current.pinned,pinMode:current.pinMode,raised:!!current.raised};
    switch(action.type){
      case 'open': next.view='panel';next.raised=current.pinned&&current.pinMode==='desktop';break;
      case 'restore':next.view='panel';next.raised=false;break;
      case 'toggle': next.view=current.view==='panel'?'orb':'panel';next.raised=next.view==='panel'&&current.pinned&&current.pinMode==='desktop';break;
      case 'close': case 'showOrb': next.view='orb';next.raised=false;break;
      case 'hide': next.view='hidden';next.raised=false;break;
      case 'blur': next.raised=false;if(!current.pinned&&current.view==='panel')next.view='orb';break;
      case 'pin': next.pinned=!current.pinned;next.raised=false;break;
      case 'setMode':
        if(action.mode==='top'||action.mode==='desktop'){
          next.pinMode=action.mode;next.pinned=true;next.view='panel';next.raised=false;
        }break;
      case 'unpin':next.pinned=false;next.raised=false;break;
    }
    return next;
  }
  function drag(start, point, wasDragged){
    var dx=point.x-start.x,dy=point.y-start.y;
    return {dx:dx,dy:dy,dragged:!!wasDragged||dx*dx+dy*dy>=36};
  }
  var api={reduce:reduce,drag:drag};
  if(typeof module!=='undefined')module.exports=api;else root.NNInteraction=api;
})(this);
