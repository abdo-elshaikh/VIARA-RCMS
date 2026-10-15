// Run from repository root. Synthetic audit only; no production database writes.
const fs=require('fs'),cp=require('child_process');
fs.mkdirSync('scratch',{recursive:true});
const inspect=name=>JSON.parse(cp.execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
const backend=inspect('VIARA_backend'),ohif=inspect('VIARA_ohif');
const env=Object.fromEntries(backend.Config.Env.map(value=>{const at=value.indexOf('=');return[value.slice(0,at),value.slice(at+1)];}));
const keys={};
for(const key of ['ENCRYPTION_KEY','BACKUP_ENCRYPTION_KEY']) keys[key]={configured:Boolean(env[key]),validHex256:/^[a-f0-9]{64}$/i.test(env[key]||'')};
keys.JWT_SECRET={configured:Boolean(env.JWT_SECRET),strongFormat:Boolean(env.JWT_SECRET&&env.JWT_SECRET.length>=32&&!/replace|change[_ -]?me|placeholder/i.test(env.JWT_SECRET))};
let applicationRole=false;try{applicationRole=new URL(env.DATABASE_URL).username==='rcms_app_user';}catch{}
const finalId=cp.execFileSync('docker',['image','inspect','viara-backend:multibranch-final-20261014','--format','{{.Id}}'],{encoding:'utf8'}).trim();
const result={date:'2026-10-14',readOnly:true,backend:{mode:env.NODE_ENV,status:backend.State.Status,restarting:backend.State.Restarting,restartCount:backend.RestartCount,imageId:backend.Image,isReviewedImage:backend.Image===finalId,applicationRole,keys},ohif:{status:ohif.State.Status,health:ohif.State.Health?.Status}};
fs.writeFileSync('scratch/multibranch-deep-postfix-runtime-evidence-20261014.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
