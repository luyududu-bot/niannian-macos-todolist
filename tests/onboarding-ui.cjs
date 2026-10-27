const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot(){
 const nodes=new Map(),sent=[];
 function node(id){if(nodes.has(id))return nodes.get(id);let html='';const n={id,hidden:id==='overlay',value:'',textContent:'',scrollTop:0,disabled:false,dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false;}},focus(){},select(){},setAttribute(){},querySelectorAll(){return[];},querySelector(selector){return node(id+':'+selector);},setPointerCapture(){},hasPointerCapture(){return false;}};Object.defineProperty(n,'innerHTML',{get(){return html;},set(v){html=v;for(const m of v.matchAll(/id="([^"]+)"/g))node(m[1]);}});nodes.set(id,n);return n;}
 const document={getElementById:node,body:node('body'),querySelector:node,querySelectorAll(){return[];},addEventListener(){},activeElement:{id:''}};
 const context={document,console,Intl,Date,innerWidth:390,innerHeight:510,setTimeout(){},clearTimeout(){},setInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){},webkit:{messageHandlers:{native:{postMessage(m){sent.push(m);}}}}};context.window=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync('源码/model.js','utf8'),context);vm.runInContext(fs.readFileSync('源码/ui.js','utf8'),context);
 return{node,sent,context};
}
const state={version:1,tasks:[],pinned:false,notesSync:{enabled:false},remindersSync:{enabled:false}},integration={cloud:{mode:'local'},notes:{enabled:false},reminders:{enabled:false}};
let b=boot();b.context.receiveNative({state,integration});assert(b.node('overlay').innerHTML.includes('选择使用方式'));assert(b.node('overlay').innerHTML.includes('仅在本机使用'));b.sent.length=0;b.node('mode-local').onclick();assert.deepEqual(b.sent.map(x=>x.type),['useLocal']);b.context.receiveNative({state:{...state,usageMode:'local',cloudSetupSeen:true},integration});assert.equal(b.node('overlay').hidden,true);assert(!b.sent.some(x=>['cloudConnect','notesAccounts','remindersEnable'].includes(x.type)));
b=boot();b.context.receiveNative({state,integration});b.sent.length=0;b.node('mode-cloud').onclick();assert(b.node('overlay').innerHTML.includes('连接 iPhone / iPad'));assert(!b.sent.some(x=>x.type==='cloudConnect'));b.node('overlay:form').onsubmit({preventDefault(){}});assert(b.sent.some(x=>x.type==='cloudConnect'));
b=boot();b.context.receiveNative({state:{...state,remindersSync:{enabled:true},usageMode:'icloud'},integration:{...integration,cloud:{mode:'icloud'},reminders:{enabled:true}}});assert.equal(b.node('overlay').hidden,true);
console.log('PASS: first run offers local/cloud; local choice sends no cloud request; cloud connection requires explicit submit; existing connected users are not prompted');
