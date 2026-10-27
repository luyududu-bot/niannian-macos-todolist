ObjC.import('Cocoa');
ObjC.import('WebKit');
ObjC.import('QuartzCore');
ObjC.import('CoreGraphics');
var application,panel,orb,web,badge,statusItem,menu,bridge,actions,timer,ui;
var state,folder,resourceFolder,dataPath,logPath,interaction,layout;
var integration=null;
var cloudSetupActive=false;
var layoutEditing=false,geometryDirty=false,lastGeometryAt=0,materials=[];
var started=false,storageLocked=false,webReady=false,lastDate='',menuTracking=false,openedAt=0;
var W=390,H=510,S=76,O=96,M=10;
var modeTopItem,modeDesktopItem,unpinItem,mainAppMenu,orbDragSession=null,lostFocusAt=0;
function read(path){var v=$.NSString.stringWithContentsOfFileEncodingError($(path),$.NSUTF8StringEncoding,null);return v?ObjC.unwrap(v):null;}
function write(path,value){return $(value).writeToFileAtomicallyEncodingError($(path),true,$.NSUTF8StringEncoding,null);}
function log(value){if(logPath)write(logPath,((read(logPath)||'')+new Date().toISOString()+' '+value+'\n').slice(-262144));}
function defaults(){return {version:1,tasks:[],listName:'XX’s to do list',pinned:false,pinMode:'top',appearance:'glass',opacity:.78,showDock:true,panelSize:{width:390,height:510},orbPosition:null,panelPosition:null};}
function valid(v){return v&&v.version===1&&Array.isArray(v.tasks)&&v.tasks.every(function(t){return t&&typeof t.id==='string'&&typeof t.title==='string'&&(t.kind==='daily'||t.kind==='long');});}
function load(){
 var raw=read(dataPath);if(!raw)return defaults();
 try{var v=JSON.parse(raw);if(valid(v))return v;}catch(e){}
 try{var b=JSON.parse(read(dataPath+'.backup'));if(valid(b)){write(dataPath+'.damaged',raw);return b;}}catch(e){}
 storageLocked=true;return defaults();
}
function persist(){
 if(storageLocked)throw Error('数据无法读取，已暂停保存。请检查资料文件夹。');
 if(integration&&integration.ready)integration.beforePersist();
 var previous=read(dataPath);if(previous){try{if(valid(JSON.parse(previous)))write(dataPath+'.backup',previous);}catch(e){}}
 if(!write(dataPath,JSON.stringify(state,null,2)))throw Error('保存失败，请检查资料文件夹权限。');
 if(integration&&integration.ready)integration.afterPersist();
}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function remaining(){var d=today();return state.tasks.filter(function(t){return t.kind==='daily'&&!t.completedAt&&t.day<=d;}).length;}
function js(code){if(web&&webReady)web.evaluateJavaScriptCompletionHandler($(code),function(result,error){});}
function publish(){
 var name=Nian.listName(state.listName);panel.title=$(name);orb.title=$(name+' · 悬浮球');
 var count=remaining();badge.stringValue=$(count>99?'99+':String(count));
 orb.contentView.toolTip=$(name+' · 今天剩余 '+count+' 项。单击展开，拖动移动，右键菜单。');
 statusItem.button.toolTip=$(name+' · 今天剩余 '+count+' 项');
 if(modeTopItem){modeTopItem.state=ui.pinned&&ui.pinMode==='top'?1:0;modeDesktopItem.state=ui.pinned&&ui.pinMode==='desktop'?1:0;unpinItem.state=ui.pinned?0:1;if(mainAppMenu){mainAppMenu.itemAtIndex(4).state=unpinItem.state;mainAppMenu.itemAtIndex(5).state=modeTopItem.state;mainAppMenu.itemAtIndex(6).state=modeDesktopItem.state;}}
 js('window.receiveNative('+JSON.stringify({state:state,storageLocked:storageLocked,presentation:ui.view,editingLayout:layoutEditing,integration:integration&&integration.ready?integration.snapshot():null})+')');
}
function clampPoint(point,width,height){
 var screens=$.NSScreen.screens,best=$.NSScreen.mainScreen.visibleFrame,nearest=Infinity;
 for(var i=0;i<screens.count;i++){var f=screens.objectAtIndex(i).visibleFrame;var dx=Math.max(f.origin.x-point.x,0,point.x-f.origin.x-f.size.width),dy=Math.max(f.origin.y-point.y,0,point.y-f.origin.y-f.size.height);if(dx*dx+dy*dy<nearest){nearest=dx*dx+dy*dy;best=f;}}
 return $.NSMakePoint(Math.max(best.origin.x+8,Math.min(point.x,best.origin.x+best.size.width-width-8)),Math.max(best.origin.y+8,Math.min(point.y,best.origin.y+best.size.height-height-8)));
}
function savePositions(which){
 if(!which||which==='orb'){var o=orb.frame.origin;state.orbPosition={x:o.x,y:o.y};}
 if(!which||which==='panel'){var p=panel.frame.origin;state.panelPosition={x:p.x,y:p.y};state.panelSize={width:W,height:H};}
 try{persist();}catch(e){log(e);}
}
function panelPosition(){
 if(state.panelPosition)panel.setFrameOrigin(clampPoint(state.panelPosition,W,H));
 else{var f=orb.frame;panel.setFrameOrigin(clampPoint({x:f.origin.x-W-12,y:f.origin.y+O-H},W,H));}
}
function transition(action){
 if(!started)return;
 var previous=ui;ui=interaction.reduce(ui,action);
 state.pinned=ui.pinned;state.pinMode=ui.pinMode;
 if(previous.pinned!==ui.pinned||previous.pinMode!==ui.pinMode)persist();
 panel.level=ui.pinned&&ui.pinMode==='desktop'&&!ui.raised?$.CGWindowLevelForKey($.kCGDesktopIconWindowLevelKey)+1:$.NSFloatingWindowLevel+1;
 panel.collectionBehavior=ui.pinned&&ui.pinMode==='desktop'?1|16|64:1|256;
 if(ui.view!=='panel')layoutEditing=false;
 if(ui.view==='panel'){
  orb.orderOut(null);if(previous.view!=='panel')panelPosition();
  if(ui.pinned&&ui.pinMode==='desktop'&&!ui.raised)panel.orderFrontRegardless;
  else if(previous.view!=='panel'||action.type==='open'||action.type==='setMode'){panel.makeKeyAndOrderFront(null);application.activateIgnoringOtherApps(true);}
  openedAt=Date.now();lostFocusAt=0;
 }else{
  if(previous.view==='panel')savePositions('panel');panel.orderOut(null);
  if(ui.view==='orb')orb.orderFrontRegardless;else orb.orderOut(null);
 }
 publish();
}
function showPanel(){transition({type:'open'});}
function beginLayout(){layoutEditing=true;transition({type:'open'});}
function finishLayout(){layoutEditing=false;savePositions('panel');if(ui.pinned&&ui.pinMode==='desktop')transition({type:'restore'});else publish();}
function resizePanel(width,height){
 var screen=panel.screen||$.NSScreen.mainScreen,f=screen.visibleFrame,s=layout.size(width,height,f.size),frame=panel.frame;
 var origin=clampPoint({x:frame.origin.x,y:frame.origin.y+frame.size.height-s.height},s.width,s.height);
 panel.setFrameDisplay($.NSMakeRect(origin.x,origin.y,s.width,s.height),true);
 W=s.width;H=s.height;state.panelSize=s;geometryDirty=true;lastGeometryAt=Date.now();
}
function applyAppearance(){
 var look=layout.appearance(state.appearance,state.opacity);state.appearance=look.style;state.opacity=look.opacity;
 var appearance=$.NSAppearance.appearanceNamed(look.style==='dark'?$.NSAppearanceNameDarkAqua:$.NSAppearanceNameAqua);
 materials.forEach(function(m){m.root.appearance=appearance;m.glass.appearance=appearance;m.glass.hidden=look.style==='dark';m.dark.hidden=look.style!=='dark';m.glass.alphaValue=look.opacity;m.dark.needsDisplay=true;});if(web)web.appearance=appearance;
}

function quitApp(){savePositions(ui.view==='panel'?undefined:'orb');application.terminate(null);}
function handle(message){
 try{if(integration&&integration.ready&&integration.handle(message))return;switch(message.type){
 case 'cloudSetupVisible':cloudSetupActive=!!message.value;break;
 case 'ready':webReady=true;publish();break;
 case 'save':
  if(!Array.isArray(message.tasks)||message.tasks.length>10000)throw Error('任务数据无效');
  var next=JSON.parse(JSON.stringify(state));next.tasks=message.tasks;if(!valid(next))throw Error('任务格式无效');
  var old=state;state=next;try{persist();}catch(e){state=old;throw e;}publish();js('window.saveAcknowledged()');break;
 case 'listName':var oldName=state.listName;state.listName=Nian.listName(message.value);try{persist();}catch(e){state.listName=oldName;throw e;}publish();break;
 case 'pin':transition({type:'pin'});break;
 case 'setPinMode':transition({type:'setMode',mode:message.mode});break;
 case 'collapse':transition({type:'close'});break;
 case 'hide':transition({type:'hide'});break;
 case 'beginLayout':beginLayout();break;
 case 'finishLayout':finishLayout();break;
 case 'resize':resizePanel(message.width,message.height);break;
 case 'movePanel':var frame=panel.frame;panel.setFrameOrigin(clampPoint({x:frame.origin.x+Number(message.dx||0),y:frame.origin.y+Number(message.dy||0)},W,H));savePositions('panel');break;
 case 'resizePreset':beginLayout();resizePanel(message.width,message.height);savePositions('panel');break;
 case 'appearance':var look=layout.appearance(message.style,message.opacity);state.appearance=look.style;state.opacity=look.opacity;applyAppearance();persist();publish();break;
 case 'showDock':state.showDock=!!message.value;application.setActivationPolicy(state.showDock?0:1);persist();publish();break;
 case 'openData':$.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath($(folder)));break;
 case 'quit':quitApp();break;
 }}catch(e){log(e);js('window.nativeError('+JSON.stringify(String(e))+')');}
}
ObjC.registerSubclass({name:'NNPanel',superclass:'NSWindow',methods:{
 canBecomeKeyWindow:{types:['bool',[]],implementation:function(){return true;}},
 canBecomeMainWindow:{types:['bool',[]],implementation:function(){return true;}}
}});
ObjC.registerSubclass({name:'NNOrbWindow',superclass:'NSWindow',methods:{
 canBecomeKeyWindow:{types:['bool',[]],implementation:function(){return true;}},
 canBecomeMainWindow:{types:['bool',[]],implementation:function(){return false;}}
}});
ObjC.registerSubclass({name:'NNBridge',superclass:'NSObject',methods:{
 'userContentController:didReceiveScriptMessage:':{types:['void',['id','id']],implementation:function(c,m){handle(ObjC.deepUnwrap(m.body));}}
}});
ObjC.registerSubclass({name:'NNWebView',superclass:'WKWebView',methods:{
 'acceptsFirstMouse:':{types:['bool',['id']],implementation:function(event){return true;}}
}});
ObjC.registerSubclass({name:'NNDragStrip',superclass:'NSView',methods:{
 'mouseDown:':{types:['void',['id']],implementation:function(event){if(ui.pinned&&ui.pinMode==='desktop'&&!ui.raised)beginLayout();this.window.performWindowDragWithEvent(event);this.window.setFrameOrigin(clampPoint(this.window.frame.origin,W,H));savePositions('panel');}},
 'acceptsFirstMouse:':{types:['bool',['id']],implementation:function(){return true;}}
}});
ObjC.registerSubclass({name:'NNOrb',superclass:'NSView',methods:{
 'mouseDownCanMoveWindow':{types:['bool',[]],implementation:function(){return false;}},
 'acceptsFirstResponder':{types:['bool',[]],implementation:function(){return true;}},
 'rightMouseDown:':{types:['void',['id']],implementation:function(event){menu.popUpMenuPositioningItemAtLocationInView($(),$.NSMakePoint(S/2,S/2),this);}},
 'acceptsFirstMouse:':{types:['bool',['id']],implementation:function(){return true;}},
 'accessibilityPerformPress':{types:['bool',[]],implementation:function(){log('orb accessibility press');showPanel();return true;}},
 'mouseDown:':{types:['void',['id']],implementation:function(event){
  application.activateIgnoringOtherApps(true);
  this.window.makeKeyWindow;
  this.window.makeFirstResponder(this);
  var p=this.window.convertPointToScreen(event.locationInWindow),o=this.window.frame.origin;
  log('orb mouse down');
  orbDragSession={start:{x:p.x,y:p.y},origin:{x:o.x,y:o.y},dragged:false};
 }},
 'mouseDragged:':{types:['void',['id']],implementation:function(event){
  if(!orbDragSession)return;
  var d=interaction.drag(orbDragSession.start,this.window.convertPointToScreen(event.locationInWindow),orbDragSession.dragged);if(d.dragged&&!orbDragSession.dragged)log('orb drag threshold');orbDragSession.dragged=d.dragged;
  if(d.dragged)this.window.setFrameOrigin($.NSMakePoint(orbDragSession.origin.x+d.dx,orbDragSession.origin.y+d.dy));
 }},
 'mouseUp:':{types:['void',['id']],implementation:function(event){
  if(!orbDragSession)return;
  var session=orbDragSession;orbDragSession=null;
  log('orb mouse up');
  var d=interaction.drag(session.start,this.window.convertPointToScreen(event.locationInWindow),session.dragged);
  if(d.dragged){this.window.setFrameOrigin(clampPoint(this.window.frame.origin,O,O));state.panelPosition=null;savePositions('orb');}
  else showPanel();
 }}
}});
ObjC.registerSubclass({name:'NNActions',superclass:'NSObject',methods:{
 'applicationShouldHandleReopen:hasVisibleWindows:':{types:['bool',['id','bool']],implementation:function(app,visible){if(started)showPanel();return true;}},
 'applicationDidBecomeActive:':{types:['void',['id']],implementation:function(notification){if(started&&ui.view==='hidden')showPanel();}},
 'applicationShouldTerminateAfterLastWindowClosed:':{types:['bool',['id']],implementation:function(app){return false;}},
 'windowDidBecomeKey:':{types:['void',['id']],implementation:function(notification){lostFocusAt=0;if(started&&ui.view==='panel'&&ui.pinned&&ui.pinMode==='desktop'&&!ui.raised)showPanel();}},
 'windowDidResize:':{types:['void',['id']],implementation:function(notification){if(!started)return;var size=panel.frame.size;W=size.width;H=size.height;state.panelSize={width:W,height:H};geometryDirty=true;lastGeometryAt=Date.now();}},
 'windowDidMove:':{types:['void',['id']],implementation:function(notification){if(started){geometryDirty=true;lastGeometryAt=Date.now();}}},
 'windowWillStartLiveResize:':{types:['void',['id']],implementation:function(notification){if(started&&ui.pinned&&ui.pinMode==='desktop')beginLayout();}},
 'windowDidEndLiveResize:':{types:['void',['id']],implementation:function(notification){if(started)savePositions('panel');}},
 'windowDidResignKey:':{types:['void',['id']],implementation:function(notification){lostFocusAt=Date.now();}},
 'tick:':{types:['void',['id']],implementation:function(){if(started){try{if(integration&&integration.ready)integration.tick();}catch(e){log('集成：'+e);}if(lastDate!==today()){lastDate=today();publish();}if(geometryDirty&&Date.now()-lastGeometryAt>400){geometryDirty=false;savePositions('panel');}if(ui.view==='panel'&&!layoutEditing&&!cloudSetupActive&&lostFocusAt&&(!ui.pinned||ui.pinMode==='desktop'&&ui.raised)&&!menuTracking&&Date.now()-lostFocusAt>200&&!panel.isKeyWindow){lostFocusAt=0;transition({type:'blur'});}}}},
 'menuWillOpen:':{types:['void',['id']],implementation:function(){menuTracking=true;}},
 'menuDidClose:':{types:['void',['id']],implementation:function(){menuTracking=false;openedAt=Date.now();lostFocusAt=0;}},
 'open:':{types:['void',['id']],implementation:function(){showPanel();}},
 'editLayout:':{types:['void',['id']],implementation:function(){beginLayout();}},
 'toggle:':{types:['void',['id']],implementation:function(){transition({type:'toggle'});}},
 'showOrb:':{types:['void',['id']],implementation:function(){transition({type:'showOrb'});}},
 'hideAll:':{types:['void',['id']],implementation:function(){transition({type:'hide'});}},
 'top:':{types:['void',['id']],implementation:function(){transition({type:'setMode',mode:'top'});}},
 'desktop:':{types:['void',['id']],implementation:function(){transition({type:'setMode',mode:'desktop'});}},
 'unpin:':{types:['void',['id']],implementation:function(){transition({type:'unpin'});}},
 'reset:':{types:['void',['id']],implementation:function(){var f=$.NSScreen.mainScreen.visibleFrame;orb.setFrameOrigin(clampPoint({x:f.origin.x+f.size.width-O-18,y:f.origin.y+f.size.height/2},O,O));state.panelPosition=null;savePositions('orb');transition({type:'showOrb'});}},
 'data:':{types:['void',['id']],implementation:function(){$.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath($(folder)));}},
 'quitApp:':{types:['void',['id']],implementation:function(){quitApp();}}
}});
function makeWindow(rect,isOrb){
 var cls=isOrb?$.NNOrbWindow:$.NNPanel;
 var p=cls.alloc.initWithContentRectStyleMaskBackingDefer(rect,isOrb?0:8,$.NSBackingStoreBuffered,false);
 p.opaque=false;p.backgroundColor=$.NSColor.clearColor;p.hasShadow=false;
 if(!isOrb){p.minSize=$.NSMakeSize(320,320);p.maxSize=$.NSMakeSize(1100,1300);}
 p.level=$.NSFloatingWindowLevel;p.hidesOnDeactivate=false;p.collectionBehavior=1|256;p.releasedWhenClosed=false;
 return p;
}
ObjC.registerSubclass({name:'NNDarkBackdrop',superclass:'NSView',methods:{
 'hitTest:':{implementation:function(point){return $();}},
 'drawRect:':{implementation:function(rect){var b=this.bounds,r=b.size.width===S&&b.size.height===S?S/2:28;$.NSColor.colorWithWhiteAlpha(.065,state.opacity||.78).setFill;$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(b,r,r).fill;}}
}});
function makeGlass(frame,radius,content){
 var root=$.NSView.alloc.initWithFrame(frame),bounds=$.NSMakeRect(0,0,frame.size.width,frame.size.height),glass;
 if($.NSClassFromString('NSGlassEffectView')){
  glass=$.NSGlassEffectView.alloc.initWithFrame(bounds);glass.cornerRadius=radius;glass.style=0;glass.tintColor=$.NSColor.colorWithSRGBRedGreenBlueAlpha(.42,.51,.66,.06);
 }else{
  glass=$.NSVisualEffectView.alloc.initWithFrame(bounds);glass.material=7;glass.blendingMode=0;glass.state=1;
  var mask=$.NSImage.alloc.initWithSize(frame.size);mask.lockFocus;$.NSColor.whiteColor.setFill;$.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(bounds,radius,radius).fill;mask.unlockFocus;glass.maskImage=mask;
 }
 var dark=$.NNDarkBackdrop.alloc.initWithFrame(bounds);
 root.appearance=$.NSAppearance.appearanceNamed($.NSAppearanceNameDarkAqua);root.autoresizingMask=18;glass.autoresizingMask=18;dark.autoresizingMask=18;content.autoresizingMask=18;
 root.addSubview(glass);root.addSubview(dark);content.frame=bounds;root.addSubview(content);materials.push({root:root,glass:glass,dark:dark});return root;
}
function setup(){
 application=$.NSApplication.sharedApplication;
 var bundle=ObjC.unwrap($.NSBundle.mainBundle.bundlePath);resourceFolder=bundle+'/Contents/Resources';
 folder=ObjC.unwrap($(bundle).stringByDeletingLastPathComponent)+'/念念资料';
 $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(folder),true,$({}),null);
 dataPath=folder+'/tasks.json';logPath=folder+'/运行.log';state=load();if(!state.pinMode)state.pinMode='top';if(typeof state.showDock!=='boolean')state.showDock=true;application.setActivationPolicy(state.showDock?0:1);
 eval(read(resourceFolder+'/interaction.js'));interaction=NNInteraction;eval(read(resourceFolder+'/layout.js'));layout=NNLayout;var savedSize=layout.size(state.panelSize&&state.panelSize.width,state.panelSize&&state.panelSize.height,$.NSScreen.mainScreen.visibleFrame.size);W=savedSize.width;H=savedSize.height;var look=layout.appearance(state.appearance,state.opacity);state.appearance=look.style;state.opacity=look.opacity;
 eval(read(resourceFolder+'/integration.js'));integration=NNIntegration;integration.setup();state.listName=Nian.listName(state.listName);
 ui={view:'hidden',pinned:!!state.pinned,pinMode:state.pinMode,raised:false};
 bridge=$.NNBridge.alloc.init;actions=$.NNActions.alloc.init;
 var visible=$.NSScreen.mainScreen.visibleFrame,pos=state.orbPosition||{x:visible.origin.x+visible.size.width-O-18,y:visible.origin.y+visible.size.height/2};
 orb=makeWindow($.NSMakeRect(pos.x,pos.y,O,O),true);orb.title=$('念念 · 悬浮球');orb.setFrameOrigin(clampPoint(pos,O,O));
 var orbRoot=$.NSView.alloc.initWithFrame($.NSMakeRect(0,0,O,O));
 var orbContent=$.NSView.alloc.initWithFrame($.NSMakeRect(0,0,S,S));
 var icon=$.NSImageView.alloc.initWithFrame($.NSMakeRect(22,35,32,29));
 icon.image=$.NSImage.imageWithSystemSymbolNameAccessibilityDescription($('checklist'),$('念念'));
 icon.imageScaling=3;icon.contentTintColor=$.NSColor.labelColor;orbContent.addSubview(icon);
 badge=$.NSTextField.labelWithString($('0'));badge.frame=$.NSMakeRect(10,9,56,25);badge.font=$.NSFont.monospacedDigitSystemFontOfSizeWeight(19,0.35);badge.alignment=1;badge.textColor=$.NSColor.labelColor;orbContent.addSubview(badge);
 var orbHit=$.NNOrb.alloc.initWithFrame($.NSMakeRect(0,0,S,S));orbHit.setAccessibilityElement(true);orbHit.setAccessibilityRole($('AXButton'));orbHit.setAccessibilityLabel($('展开念念清单'));orbContent.addSubview(orbHit);
 orbRoot.addSubview(makeGlass($.NSMakeRect(M,M,S,S),S/2,orbContent));orb.contentView=orbRoot;
 panel=makeWindow($.NSMakeRect(visible.origin.x+visible.size.width-W-O-28,visible.origin.y+visible.size.height-H-50,W,H),false);panel.title=$('念念 · 今天与长期');panel.maxSize=$.NSMakeSize(Math.max(320,Math.min(1100,visible.size.width-16)),Math.max(320,Math.min(1300,visible.size.height-16)));panel.delegate=actions;panelPosition();
 var content=$.NSView.alloc.initWithFrame($.NSMakeRect(0,0,W,H)),config=$.WKWebViewConfiguration.alloc.init;
 config.userContentController.addScriptMessageHandlerName(bridge,$('native'));
 web=$.NNWebView.alloc.initWithFrameConfiguration($.NSMakeRect(0,0,W,H),config);web.setValueForKey(false,$('drawsBackground'));web.autoresizingMask=18;content.addSubview(web);
 var drag=$.NNDragStrip.alloc.initWithFrame($.NSMakeRect(0,H-78,W-104,78));drag.autoresizingMask=10;drag.toolTip=$('拖动移动清单');content.addSubview(drag);
 panel.contentView=makeGlass($.NSMakeRect(0,0,W,H),28,content);
 web.loadFileURLAllowingReadAccessToURL($.NSURL.fileURLWithPath($(resourceFolder+'/index.html')),$.NSURL.fileURLWithPath($(resourceFolder+'/')));
 statusItem=$.NSStatusBar.systemStatusBar.statusItemWithLength(-1);statusItem.button.image=$.NSImage.imageWithSystemSymbolNameAccessibilityDescription($('checklist'),$('念念'));statusItem.button.title=$(' 念念');statusItem.button.imagePosition=2;
 menu=$.NSMenu.alloc.initWithTitle($('念念'));menu.delegate=actions;
 function item(title,selector,key){var e=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(title),selector,$(key||''));e.target=actions;menu.addItem(e);return e;}
 item('展开清单','open:','l');item('收起为悬浮球','showOrb:','');item('隐藏球和清单','hideAll:','');
 menu.addItem($.NSMenuItem.separatorItem);unpinItem=item('不固定 · 点外面收起','unpin:','');modeTopItem=item('固定 · 始终置顶','top:','');modeDesktopItem=item('固定 · 贴在桌面','desktop:','');
 menu.addItem($.NSMenuItem.separatorItem);item('调整大小和位置','editLayout:','');item('找回悬浮球位置','reset:','');item('打开本地资料','data:','');menu.addItem($.NSMenuItem.separatorItem);item('退出念念','quitApp:','q');statusItem.menu=menu;
 var mainMenu=$.NSMenu.alloc.initWithTitle($('念念')),appRoot=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($('念念'),'',$(''));
 mainAppMenu=menu.copy;appRoot.submenu=mainAppMenu;mainMenu.addItem(appRoot);
 var editRoot=$.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($('编辑'),'',$('')),editMenu=$.NSMenu.alloc.initWithTitle($('编辑'));
 [['撤销','undo:','z'],['剪切','cut:','x'],['复制','copy:','c'],['粘贴','paste:','v'],['全选','selectAll:','a']].forEach(function(row){editMenu.addItem($.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(row[0]),row[1],$(row[2])));});editRoot.submenu=editMenu;mainMenu.addItem(editRoot);application.mainMenu=mainMenu;
 application.delegate=actions;applyAppearance();started=true;var hint=read(folder+'/agent-launch.request');transition({type:hint?'showOrb':'open'});if(hint)$.NSFileManager.defaultManager.removeItemAtPathError($(folder+'/agent-launch.request'),null);log('启动成功 · 1.6.0');
}
function run(){try{setup();timer=$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.25,actions,'tick:',$(),true);application.run;}catch(e){log(e);var a=$.NSAlert.alloc.init;a.messageText=$('念念无法启动');a.informativeText=$(String(e));a.runModal;}}
function reopen(){if(started)showPanel();}
