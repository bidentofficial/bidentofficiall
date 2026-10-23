// Bident reviews backend + site, as a Cloudflare Worker (no Node server needed).
// Needs: a KV binding named REVIEWS (set in wrangler.jsonc) and a secret named ADMIN_TOKEN.
const J=(o,c=200)=>new Response(JSON.stringify(o),{status:c,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const same=(a,b)=>{a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function limit(kv,key,max){const n=+(await kv.get(key)||0);if(n>=max)return false;await kv.put(key,String(n+1),{expirationTtl:3600});return true}
async function load(kv){try{return JSON.parse(await kv.get('reviews')||'[]')}catch{return[]}}
async function handle(request,env){
 if(!env.REVIEWS||!env.ADMIN_TOKEN)return J({error:'Server not configured'},500);
 const url=new URL(request.url),p=url.pathname.replace(/\/+$/,''),m=request.method;
 const ip=request.headers.get('CF-Connecting-IP')||'x';
 if(p==='/api/reviews'&&m==='GET'){const a=await load(env.REVIEWS);return J(a.filter(r=>r.s==='approved'&&r.p).map(({id,n,r,t,d})=>({id,n,r,t,d})))}
 if(p==='/api/reviews'&&m==='POST'){
  let x;try{x=await request.json()}catch{return J({error:'Invalid'},400)}
  const r=+x.r,t=String(x.t||'').trim().slice(0,1000);
  if(!(r>=1&&r<=5)||!t)return J({error:'Invalid'},400);
  if(!(await limit(env.REVIEWS,'rl:'+ip,3)))return J({error:'Too many reviews'},429);
  const a=await load(env.REVIEWS);if(a.length>=500)return J({error:'Full'},503);
  a.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),n:String(x.n||'').slice(0,60),r,t,p:!!x.p,s:'pending',d:new Date().toISOString()});
  await env.REVIEWS.put('reviews',JSON.stringify(a));return J({ok:true},201)}
 const am=p.match(/^\/api\/admin\/reviews(?:\/(\w+)\/(approve|delete))?$/);
 if(am){
  const ok=same(request.headers.get('x-admin-token'),env.ADMIN_TOKEN);
  if(!ok){const n=+(await env.REVIEWS.get('fa:'+ip)||0);if(n>=10)return J({error:'Too many attempts'},429);await env.REVIEWS.put('fa:'+ip,String(n+1),{expirationTtl:3600});return J({error:'Unauthorized'},401)}
  if(!am[1]&&m==='GET')return J(await load(env.REVIEWS));
  if(am[1]&&m==='POST'){let a=await load(env.REVIEWS);
   a=am[2]==='delete'?a.filter(r=>r.id!==am[1]):a.map(r=>r.id===am[1]&&r.p?{...r,s:'approved'}:r);
   await env.REVIEWS.put('reviews',JSON.stringify(a));return J({ok:true})}}
 return J({error:'Not found'},404)}
export default{async fetch(request,env){return new URL(request.url).pathname.startsWith('/api/')?handle(request,env):env.ASSETS.fetch(request)}};
