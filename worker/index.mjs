// Public mode is enabled only after the owner explicitly chooses link-based editing.
// Default: closed. No credentials belong in frontend code or this repository.
export function validateTask(value) {
 if (!value || typeof value !== 'object') throw new Error('Некорректная задача');
 const task={};
 for (const [key,max] of Object.entries({title:500,owner:200,due:10,notes:3000})) {
  if (typeof value[key]!=='string' || value[key].length>max) throw new Error('Некорректное поле: '+key);
  task[key]=value[key].trim();
 }
 if (!task.title) throw new Error('Введите название задачи');
 if (task.due && (!/^\d{4}-\d{2}-\d{2}$/.test(task.due) || !Number.isFinite(Date.parse(task.due)) || new Date(task.due).toISOString().slice(0,10)!==task.due)) throw new Error('Некорректный срок');
 if (!['Высокий','Средний','Низкий'].includes(value.priority)) throw new Error('Некорректный приоритет');
 for(const key of ['done','action'])if(typeof value[key]!=='boolean')throw new Error('Некорректный статус');
 return {...task,priority:value.priority,done:value.done,action:value.done?false:value.action};
}
const idOK=id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id);
export default {
 async fetch(request,env) {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  const origin=request.headers.get('Origin');
  if(origin===env.ALLOWED_ORIGIN)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(request.method==='OPTIONS')return origin===env.ALLOWED_ORIGIN?new Response(null,{status:204,headers}):reply(403,{error:'Источник не разрешён'});
  if(env.ACCESS_MODE!=='public')return reply(503,{error:'Общий список пока не открыт для доступа'});
  if(origin && origin!==env.ALLOWED_ORIGIN)return reply(403,{error:'Источник не разрешён'});
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/tasks(?:\/([a-zA-Z0-9_-]{1,100}))?$/);
  if(!match)return reply(404,{error:'Не найдено'});
  const id=match[1];
  try {
   if(request.method==='GET'&&!id){
    const result=await env.DB.prepare('SELECT id,payload,revision,updated_at FROM tasks WHERE deleted=0 ORDER BY rowid').all();
    return reply(200,{tasks:result.results.map(row=>({...JSON.parse(row.payload),id:row.id,revision:row.revision,updatedAt:row.updated_at}))});
   }
   if(!['POST','PUT','DELETE'].includes(request.method))return reply(405,{error:'Метод не поддерживается'});
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,{error:'Нужен JSON'});
   const text=await request.text();if(text.length>16000)return reply(413,{error:'Слишком большой запрос'});
   let body;try{body=JSON.parse(text)}catch{return reply(400,{error:'Некорректный JSON'})}
   if(request.method==='POST'&&!id){
    const task=validateTask(body.task),newId=body.task.id||crypto.randomUUID();
    if(!idOK(newId))return reply(400,{error:'Некорректный идентификатор'});
    const now=new Date().toISOString();
    const result=await env.DB.prepare('INSERT OR IGNORE INTO tasks(id,payload,revision,updated_at) VALUES(?,?,1,?)').bind(newId,JSON.stringify(task),now).run();
    if(!result.meta.changes)return reply(409,{error:'Задача с таким идентификатором уже существует. Обновите список.'});
    return reply(201,{task:{...task,id:newId,revision:1,updatedAt:now}});
   }
   if(!id)return reply(405,{error:'Нужен идентификатор задачи'});
   if(!Number.isSafeInteger(body.revision)||body.revision<1)return reply(400,{error:'Не указана версия задачи'});
   const now=new Date().toISOString();let result,task;
   if(request.method==='PUT'){
    task=validateTask(body.task);
    result=await env.DB.prepare('UPDATE tasks SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted=0').bind(JSON.stringify(task),now,id,body.revision).run();
   }else if(request.method==='DELETE'){
    result=await env.DB.prepare('UPDATE tasks SET deleted=1,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND deleted=0').bind(now,id,body.revision).run();
   }else return reply(405,{error:'Метод не поддерживается'});
   if(!result.meta.changes)return reply(409,{error:'Эту задачу уже изменил или удалил другой участник. Обновите список и проверьте новую версию перед сохранением.'});
   return reply(200,request.method==='DELETE'?{deleted:id}:{task:{...task,id,revision:body.revision+1,updatedAt:now}});
  }catch(error){
   if(/Некоррект|Введите/.test(error.message))return reply(400,{error:error.message});
   return reply(500,{error:'Не удалось сохранить изменения. Попробуйте снова.'});
  }
 }
};
