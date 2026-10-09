'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'dist/client-release/staging-20261009');
const testDir = fs.mkdtempSync(path.join(root, 'scratch/client-container-test-'));
const envFile = path.join(testDir, '.env');
const project = 'viara-release-test-' + crypto.randomBytes(4).toString('hex');
const keys = ['POSTGRES_PASSWORD','JWT_SECRET','ENCRYPTION_KEY','BACKUP_ENCRYPTION_KEY','BLIND_INDEX_KEY','METRICS_TOKEN','REDIS_PASSWORD','ORTHANC_PASSWORD','PACS_WEBHOOK_SECRET'];
const reservePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0,'127.0.0.1',()=>{ const port=server.address().port; server.close(()=>resolve(port)); }); });
let launched = false;
const override = path.join(testDir, 'override.json');
const args = ['compose', '--project-name', project, '--env-file', envFile, '-f', path.join(stage, 'docker-compose.yml'), '-f', override];
const compose = (extra, input) => execFileSync('docker', [...args, ...extra], { encoding:'utf8', input, stdio:[input === undefined ? 'ignore' : 'pipe','pipe','pipe'], timeout:600000 });
async function main() {
    const ports = {};
    for (const name of ['FRONTEND_PORT','BACKEND_PORT','PORTAL_PORT','POSTGRES_PORT','OHIF_PORT','PACS_DICOM_PORT','ORTHANC_REST_PORT']) ports[name] = String(await reservePort());
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve:'prime256v1' });
    const payload = { edition:'enterprise', maxUsers:-1, centerName:'Synthetic Release Test', expiresAt:new Date(Date.now()+86400000).toISOString(), allowedModules:['*'] };
    const signature = crypto.sign('SHA256', Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
    const license = Buffer.from(JSON.stringify({payload,signature})).toString('base64url');
    let env = fs.readFileSync(path.join(stage,'.env.example'),'utf8');
    const values = { ...ports, COMPOSE_PROJECT_NAME:project, LICENSE_KEY:license, CLIENT_URL:'https://clinical.example.test', PORTAL_CLIENT_URL:'https://patients.example.test', ALLOWED_ORIGINS:'https://clinical.example.test,https://patients.example.test', WEBAUTHN_ORIGIN:'https://clinical.example.test', WEBAUTHN_RP_ID:'clinical.example.test', TRUST_PROXY:'loopback,172.31.247.10,172.31.247.11' };
    for (const key of keys) values[key] = crypto.randomBytes(32).toString('hex');
    env=env.replace(/^([A-Z0-9_]+)=.*$/gm,(line,key)=>key in values ? `${key}=${values[key]}` : line);
    fs.writeFileSync(envFile, env, {mode:0o600});
    const worklists=path.join(testDir,'worklists'); fs.mkdirSync(worklists);
    fs.writeFileSync(override, JSON.stringify({
        services:{
            backend:{ environment:{ LICENSE_PUBLIC_KEY:publicKey.export({type:'spki',format:'pem'}) }, volumes:[`${worklists.replaceAll('\\','/')}:/app/pacs-worklists`] },
            orthanc:{ volumes:[`${worklists.replaceAll('\\','/')}:/var/lib/orthanc/worklists`] },
            frontend:{networks:{app:{ipv4_address:'172.31.247.10'}}},
            portal:{networks:{app:{ipv4_address:'172.31.247.11'}}},
            caddy:{networks:{app:{ipv4_address:'172.31.247.5'}}}
        }, networks:{app:{ipam:{config:[{subnet:'172.31.247.0/24'}]}}}
    },null,2));
    launched=true;
    compose(['up','-d','--pull','never','--wait','--wait-timeout','420']);
    const response=await fetch(`http://127.0.0.1:${ports.BACKEND_PORT}/health/ready`);
    if(!response.ok) throw Error('Backend readiness failed');
    const adminScripts = JSON.parse(execFileSync('python', ['-c', "import importlib.util,json; s=importlib.util.spec_from_file_location('admin','viara-production-package/scripts/initialize-admin.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps({'create':m.CREATE,'query':m.QUERY}))"], {cwd:root,encoding:'utf8'}));
    const adminArgs=['exec','-T','backend','node','-e',adminScripts.create];
    const admin={email:'admin@synthetic.example.test',name:'Synthetic Admin',password:'Synthetic-first-admin-password-123'};
    if(!JSON.parse(compose(adminArgs,JSON.stringify(admin))).created) throw Error('Initial Admin was not created');
    if(JSON.parse(compose(adminArgs,JSON.stringify({...admin,password:'A-different-password-123456'}))).created) throw Error('Existing Admin was altered');
    const login=await fetch(`http://127.0.0.1:${ports.BACKEND_PORT}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password:admin.password})});
    if(!login.ok) throw Error('Initial administrator login failed');
    const runtime=await fetch(`http://127.0.0.1:${ports.FRONTEND_PORT}/runtime-config.js`);
    if(!runtime.ok || !(await runtime.text()).includes('https://patients.example.test')) throw Error('Runtime portal origin failed');
    const denied=await fetch(`http://127.0.0.1:${ports.PORTAL_PORT}/api/users`);
    if(denied.status!==404) throw Error('Portal staff isolation failed');
    const auth=await fetch(`http://127.0.0.1:${ports.PORTAL_PORT}/api/portal/profile`);
    if(auth.status!==401) throw Error('Portal did not enforce authentication');
    const statuses=compose(['ps','--format','json']);
    fs.writeFileSync(path.join(testDir,'result.json'),JSON.stringify({passed:true,project,checks:['fresh schema and migrations','container readiness','first administrator creation and login','existing accounts preserved','runtime portal origin','portal staff denial','portal authentication'],testLicensePublicKeyOverride:true,statuses:statuses.trim().split('\n').map(line=>{const s=JSON.parse(line);return {service:s.Service,state:s.State,health:s.Health};})},null,2));
    console.log(`PASS: release container checks; isolated synthetic license and database. Results: ${testDir}`);
}
main().catch(error=>{ console.error(error.message); if(launched){const logs=spawnSync('docker',[...args,'logs','--no-color','--tail','60'],{encoding:'utf8'});fs.writeFileSync(path.join(testDir,'failure.log'),(logs.stdout||'')+(logs.stderr||''));}process.exitCode=1; }).finally(()=>{
    // Delete only resources in the uniquely named synthetic project.
    if(launched) compose(['down','--volumes','--remove-orphans']);
});
