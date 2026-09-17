import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
 const env={ACCESS_MODE:'public',ALLOWED_ORIGIN:'https://dtufilin-alt.github.io',DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}},async all(){return {results:db.prepare(sql).all(...args)}}}}}};
 const call=async(method,path='',body)=>{const r=await worker.fetch(new Request('https://example.com/api/tasks'+path,{method,headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json()}};
 return {db,env,call};
}
const task={id:'one',title:'Проверка',owner:'Денис',due:'2026-09-18',notes:'',priority:'Средний',done:false,action:true};
test('Two clients share changes; stale edits/deletes cannot overwrite; deleted IDs stay deleted',async()=>{
 const {call,db}=setup();assert.equal((await call('POST','',{task})).status,201);
 const a=(await call('GET')).data.tasks[0],b=(await call('GET')).data.tasks[0];
 assert.equal((await call('PUT','/one',{task:{...a,title:'Обновлено А'},revision:a.revision})).status,200);
 assert.equal((await call('PUT','/one',{task:{...b,title:'Устаревшая Б'},revision:b.revision})).status,409);
 assert.equal((await call('DELETE','/one',{revision:b.revision})).status,409);
 const updated=(await call('GET')).data.tasks[0];assert.equal(updated.title,'Обновлено А');
 assert.equal((await call('DELETE','/one',{revision:updated.revision})).status,200);
 assert.deepEqual((await call('GET')).data.tasks,[]);
 assert.equal((await call('POST','',{task})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM history').get().n,3);db.close();
});
test('Validation, completion status and default closed mode',async()=>{
 const {call,env,db}=setup();assert.equal((await call('POST','',{task:{...task,due:'2026-02-30'}})).status,400);
 const r=await call('POST','',{task:{...task,done:true}});assert.equal(r.data.task.action,false);
 env.ACCESS_MODE='closed';assert.equal((await call('GET')).status,503);db.close();
});
