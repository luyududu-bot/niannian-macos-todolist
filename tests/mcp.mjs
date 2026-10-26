import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,readdir,rename,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),Agent=require('../源码/agent.js'),Model=require('../源码/model.js');
const data=await mkdtemp(path.join(os.tmpdir(),'niannian-mcp-test-'));
await mkdir(path.join(data,'agent-requests'));await mkdir(path.join(data,'agent-replies'));
let fixture={version:1,tasks:[]};
async function atomic(file,v){const t=file+'.tmp';await writeFile(t,JSON.stringify(v));await rename(t,file);}
await atomic(path.join(data,'tasks.json'),fixture);await atomic(path.join(data,'agent-heartbeat.json'),{at:Date.now(),pid:process.pid});
const child=spawn(process.execPath,[fileURLToPath(new URL('../MCP/server.mjs',import.meta.url)),'--data-dir',data,'--app-path',path.join(data,'not-a-real-app.app')],{stdio:['pipe','pipe','pipe']});
let sequence=0,buffer='',stderr='',pending=new Map(),busy=false;
child.stderr.on('data',x=>stderr+=x);
child.stdout.on('data',x=>{buffer+=x;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let value;try{value=JSON.parse(line);}catch{assert.fail('MCP stdout must contain only JSON');}pending.get(value.id)?.(value);pending.delete(value.id);}});
function rpc(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timed out: '+method));},10000);pending.set(id,v=>{clearTimeout(timer);resolve(v);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function call(name,args={}){const r=await rpc('tools/call',{name:'niannian_'+name,arguments:args});assert(!r.error,JSON.stringify(r));assert(!r.result.isError,JSON.stringify(r));return r.result.structuredContent;}
// An isolated fixture writer exercises the request/reply transport without touching a user's Mac app or Notes.
const writer=setInterval(async()=>{if(busy)return;busy=true;try{await atomic(path.join(data,'agent-heartbeat.json'),{at:Date.now(),pid:process.pid});for(const file of await readdir(path.join(data,'agent-requests'))){if(!file.endsWith('.json'))continue;const request=JSON.parse(await readFile(path.join(data,'agent-requests',file),'utf8'));let reply;try{const a=Agent.apply(fixture,request.operation,request.params,Model,new Date());fixture=a.state;await atomic(path.join(data,'tasks.json'),fixture);reply={ok:true,result:a.result};}catch(e){reply={ok:false,error:e.message};}await atomic(path.join(data,'agent-replies',file),reply);await rm(path.join(data,'agent-requests',file),{force:true});}}finally{busy=false;}},20);
try{
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'isolated-tests',version:'1'},capabilities:{}});assert.equal(init.result.protocolVersion,'2025-11-25');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 assert.equal((await rpc('tools/list')).result.tools.length,11);
 assert.equal((await rpc('resources/list')).result.resources.length,2);
 assert.equal((await rpc('resources/templates/list')).result.resourceTemplates.length,1);
 assert.equal((await call('list_tasks',{scope:'all'})).total,0);
 const bad=await rpc('tools/call',{name:'niannian_create_task',arguments:{title:'invalid',unknown:true}});assert(bad.result.isError);
 const goal=(await call('create_task',{title:'Example goal',kind:'long'})).task;
 const step=(await call('plan_step',{goal_id:goal.id,title:'Example step'})).task;assert.equal(step.parentId,goal.id);
 await call('update_task',{id:step.id,title:'Renamed example'});await call('complete_task',{id:step.id});
 assert((await call('list_tasks',{scope:'all',completed:true})).tasks.some(t=>t.id===step.id&&t.title==='Renamed example'));
 await call('delete_task',{id:step.id});assert(!(await call('list_tasks',{scope:'all'})).tasks.some(t=>t.id===step.id));
 await call('restore_task',{id:step.id});assert((await call('list_tasks',{scope:'all'})).tasks.some(t=>t.id===step.id));
 const resource=await rpc('resources/read',{uri:'niannian://tasks'});assert.equal(JSON.parse(resource.result.contents[0].text).total,2);
 assert.equal((await call('get_sync_status')).enabled,false);
 assert((await call('get_monthly_record')).plain.includes('Example goal'));
 assert.equal((await rpc('not/a/method')).error.code,-32601);
 console.log('PASS: isolated MCP discovery, resources, validation, task operations and queued persistence');
}finally{clearInterval(writer);while(busy)await new Promise(r=>setTimeout(r,5));const exited=once(child,'exit');child.stdin.end();child.kill();await exited;await rm(data,{recursive:true,force:true});if(stderr)console.error(stderr);}
