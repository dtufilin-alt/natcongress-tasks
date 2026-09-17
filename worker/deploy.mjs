import {readFileSync,writeFileSync} from 'node:fs';
const base='https://api.cloudflare.com/client/v4';
async function cf(path,method='GET',body){
 const headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
 const response=await fetch(base+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok||!data.success)throw Error('Cloudflare '+method+' '+path+' HTTP '+response.status+' codes '+(data.errors||[]).map(x=>x.code).join(','));
 return data.result;
}
const accounts=await cf('/accounts');
if(accounts.length!==1)throw Error('Expected exactly one accessible Cloudflare account, found '+accounts.length);
const prefix='/accounts/'+accounts[0].id;
let db=(await cf(prefix+'/d1/database?name=natcongress-tasks')).find(x=>x.name==='natcongress-tasks');
if(!db)db=await cf(prefix+'/d1/database','POST',{name:'natcongress-tasks'});
await cf(prefix+'/d1/database/'+db.uuid+'/query','POST',{sql:readFileSync('worker/schema.sql','utf8')});
let sub;try{sub=await cf(prefix+'/workers/subdomain')}catch(error){if(!error.message.includes('HTTP 404 codes 10007'))throw error;sub={}}
if(!sub.subdomain)sub=await cf(prefix+'/workers/subdomain','PUT',{subdomain:'natcongress-'+accounts[0].id.slice(0,8)});
const metadata={main_module:'index.mjs',compatibility_date:'2026-09-01',bindings:[{type:'d1',name:'DB',id:db.uuid},{type:'plain_text',name:'ACCESS_MODE',text:'public'},{type:'plain_text',name:'ALLOWED_ORIGIN',text:'https://dtufilin-alt.github.io'}]};
const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('index.mjs',new Blob([readFileSync('worker/index.mjs')],{type:'application/javascript+module'}),'index.mjs');
await cf(prefix+'/workers/scripts/natcongress-tasks-api','PUT',form);
await cf(prefix+'/workers/scripts/natcongress-tasks-api/subdomain','POST',{enabled:true});
const url='https://natcongress-tasks-api.'+sub.subdomain+'.workers.dev';
writeFileSync('config.js','window.NATCONGRESS_API_BASE = '+JSON.stringify(url)+';\n');
console.log('Backend deployed: '+url);
const origin='https://dtufilin-alt.github.io';
async function request(method,path='',body){const r=await fetch(url+'/api/tasks'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,headers:r.headers,data:await r.json()}}
let ready=false;for(let i=0;i<12;i++){try{if((await request('GET')).status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,5000))}if(!ready)throw Error('Public API not available yet');
const testId='smoke-'+crypto.randomUUID();let revision;
try{
 const created=await request('POST','',{task:{id:testId,title:'Тест синхронизации (автоудаление)',owner:'',due:'',notes:'',priority:'Низкий',done:false,action:false}});
 if(created.status!==201)throw Error('Create failed');revision=created.data.task.revision;
 const a=(await request('GET')).data.tasks.find(t=>t.id===testId),b=(await request('GET')).data.tasks.find(t=>t.id===testId);
 const updated=await request('PUT','/'+testId,{task:{...a,title:'Обновлённая тестовая задача'},revision:a.revision});
 if(updated.status!==200)throw Error('Update failed');revision=updated.data.task.revision;
 const stale=await request('PUT','/'+testId,{task:b,revision:b.revision});if(stale.status!==409)throw Error('Conflict protection failed');
 const second=await request('GET');if(second.data.tasks.find(t=>t.id===testId).title!=='Обновлённая тестовая задача')throw Error('Second client missing update');
 if(second.headers.get('access-control-allow-origin')!==origin)throw Error('CORS failed');
 console.log('Live checks passed: create, two client reads, update, stale edit rejection, CORS');
}finally{if(revision){const removed=await request('DELETE','/'+testId,{revision});if(removed.status!==200)throw Error('Test cleanup failed');console.log('Test task deleted')}}
