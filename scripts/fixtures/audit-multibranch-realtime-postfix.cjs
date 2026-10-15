// Run from repository root. Synthetic audit only; no production database writes.
const fs=require('fs'),crypto=require('crypto'),{EventEmitter}=require('events');
fs.mkdirSync('scratch',{recursive:true});
process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='test';
const realtime=require('../../backend/src/services/realtimeService');
const listeners=[];
function connect(user){
    const req=new EventEmitter();req.query={token:realtime.createSseSession(user)};req.headers={};
    const res=new EventEmitter(),events=[];
    Object.assign(res,{writableEnded:false,destroyed:false,writeHead:()=>{},write:chunk=>{const value=chunk.trim().replace(/^data: /,'');events.push(JSON.parse(value));},status(){return this;},json(){}});
    realtime.registerClient(req,res);listeners.push(req);return{events};
}
const a=connect({user_id:'synthetic-A',role:'Admin',branch_id:'A',branchIds:['A'],organization_id:'synthetic-org',session_id:'s-A'});
const b=connect({user_id:'synthetic-B',role:'Admin',branch_id:'B',branchIds:['B'],organization_id:'synthetic-org',session_id:'s-B'});
let identityKeys=[];
realtime.broadcastToStaffMatching(c=>{identityKeys=Object.keys(c);return Array.isArray(c.branchIds)&&c.branchIds.includes('A');},'SYNTHETIC_BRANCH_CHANNEL',{branchId:'A'});
realtime.sendToRole('Admin','NEW_NOTIFICATION',{branch_id:'B',content:'SYNTHETIC ONLY'});
const result={syntheticOnly:true,identityKeys,branchChannelReachedA:a.events.some(e=>e.event==='SYNTHETIC_BRANCH_CHANNEL'),branchBNotificationReachedA:a.events.some(e=>e.event==='NEW_NOTIFICATION'&&e.data.branch_id==='B'),branchBNotificationReachedB:b.events.some(e=>e.event==='NEW_NOTIFICATION')};
listeners.forEach(req=>req.emit('close'));
fs.writeFileSync('scratch/multibranch-deep-postfix-realtime-evidence-20261014.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
