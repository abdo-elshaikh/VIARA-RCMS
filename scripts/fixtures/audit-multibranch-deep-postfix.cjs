// Run from repository root. Synthetic audit only; no production database writes.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
fs.mkdirSync('scratch',{recursive:true});
const name='viara-deep-audit-'+process.pid, envFile='scratch/deep-audit-'+process.pid+'.env';
const run=(args,input)=>cp.execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function main(){
    const password=crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(envFile,'POSTGRES_PASSWORD='+password+'\n');
    let owner,app;
    const evidence={date:'2026-10-14',syntheticOnly:true,isolatedDatabase:true,checks:{}};
    try {
        run(['run','-d','--name',name,'--tmpfs','/var/lib/postgresql/data','--env-file',envFile,'-p','127.0.0.1::5432','postgres:15-alpine']);
        for(let i=0;i<80;i++){try{run(['exec',name,'pg_isready','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,250));}}
        await new Promise(r=>setTimeout(r,1500));
        const port=run(['port',name,'5432']).trim().split(':').at(-1);
        for(const key of ['JWT_SECRET','BRANCH_CONTEXT_SECRET','APP_DB_PASSWORD','BACKUP_DB_PASSWORD','ENCRYPTION_KEY','BLIND_INDEX_KEY']) process.env[key]=crypto.randomBytes(32).toString('hex');
        process.env.REDIS_URL='';
        process.env.NODE_ENV='production';process.env.DATABASE_URL=`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
        const {Pool}=require('../../backend/node_modules/pg');
        owner=new Pool({connectionString:process.env.DATABASE_URL});
        const {runMigrations,MIGRATION_FILES}=require('../../database/migrate');
        await runMigrations(owner,{fresh:true});
        const org=id(0),A=id(1),B=id(2),user=id(100),patient=id(200),appointment=id(300),exam=id(400);
        await owner.query(`INSERT INTO users(user_id,full_name,email,password_hash,role,organization_id,is_org_admin) VALUES($1,'Synthetic Audit','audit@example.invalid','not-a-password','Receptionist',$2,FALSE)`,[user,org]);
        await owner.query(`INSERT INTO financial_branches(branch_id,code,name,is_active) VALUES($1,'AUDIT-B','Synthetic B',TRUE)`,[B]);
        await owner.query(`INSERT INTO branches(id,organization_id,code,name) VALUES($1,$2,'AUDIT-B','Synthetic B') ON CONFLICT(id) DO NOTHING`,[B,org]);
        await owner.query(`INSERT INTO user_branch_memberships(user_id,branch_id,role,is_active,is_default) VALUES($1,$2,'Admin',TRUE,TRUE),($1,$3,'Receptionist',TRUE,FALSE)`,[user,A,B]);
        await owner.query(`INSERT INTO patients(patient_id,mrn,first_name_enc,last_name_enc) VALUES($1,'SYNTHETIC-AUDIT','synthetic','synthetic')`,[patient]);
        await owner.query(`INSERT INTO appointments(appointment_id,patient_id,branch_id,start_time,end_time) VALUES($1,$2,$3,NOW(),NOW()+interval '1 hour')`,[appointment,patient,A]);
        await owner.query(`INSERT INTO examinations(exam_id,appointment_id,patient_id,branch_id,original_branch_id) VALUES($1,$2,$3,$4,$4)`,[exam,appointment,patient,A]);
        app=new Pool({connectionString:`postgresql://rcms_app_user:${process.env.APP_DB_PASSWORD}@127.0.0.1:${port}/postgres`});
        const {signBranchContext}=require('../../backend/src/utils/branchContextProof');
        const scoped=async(callback,actorId=user)=>{
            const proof=signBranchContext(A,actorId);
            const client=await app.connect();try{await client.query('BEGIN');await client.query('SELECT set_branch_context($1,$2,FALSE,$3,$4,$5)',[A,actorId,proof.signature,proof.expires,'Staff']);return await callback(client);}finally{await client.query('ROLLBACK');client.release();}
        };
        evidence.checks.baseline=await scoped(async c=>({visibleExams:(await c.query('SELECT count(*)::int AS n FROM examinations')).rows[0].n}));
        const makeResponse=()=>({statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
        const {requireBranchContext}=require('../../backend/src/middleware/branchContextMiddleware');
        const {authorizeRole,authenticateToken,configureAuthDatabase}=require('../../backend/src/middleware/authMiddleware');
        await owner.query("UPDATE users SET role='Admin' WHERE user_id=$1",[user]);
        await owner.query("UPDATE user_branch_memberships SET is_default=FALSE,role=CASE WHEN branch_id=$2 THEN 'Receptionist' ELSE 'Nurse' END WHERE user_id=$1",[user,A]);
        const optionalReq={user:{user_id:user,role:'Admin',organization_id:org,is_org_admin:false},headers:{},query:{},body:{},method:'GET',path:'/api/rbac/roles'};
        let optionalAllowed=false;const optionalRes=makeResponse();
        await requireBranchContext(app,{requireBranch:false,allowAllBranchesForOrgAdmin:true})(optionalReq,optionalRes,()=>{optionalAllowed=true;});
        let adminRoleAllowed=false;authorizeRole(['Admin'])(optionalReq,optionalRes,()=>{adminRoleAllowed=true;});
        evidence.checks.optionalBranchRole={allowed:optionalAllowed,branchId:optionalReq.branchContext?.branchId,role:optionalReq.user.role,memberRoles:optionalReq.branchContext?.branches.map(b=>b.branch_role),adminRoleAllowed};
        await owner.query("UPDATE users SET role='Receptionist' WHERE user_id=$1",[user]);
        await owner.query("UPDATE user_branch_memberships SET is_default=(branch_id=$2),role=CASE WHEN branch_id=$2 THEN 'Admin' ELSE 'Receptionist' END WHERE user_id=$1",[user,A]);
        const emergencyReq={user:{user_id:user,role:'EmergencyClinicalViewer',identity_role:'Radiologist',organization_id:org},branchContext:{branchId:B,branchRole:'EmergencyClinicalViewer',isEmergency:true},headers:{},method:'GET'};
        let emergencyRouteAllowed=false;const emergencyRes=makeResponse();
        authorizeRole(['Receptionist','Admin','Radiologist','Technician','Nurse'])(emergencyReq,emergencyRes,()=>{emergencyRouteAllowed=true;});
        evidence.checks.emergencyRoleRoute={allowed:emergencyRouteAllowed,status:emergencyRes.statusCode};
        const session=crypto.randomUUID(),passwordForAudit=crypto.randomBytes(20).toString('hex');
        const bcrypt=require('../../backend/node_modules/bcrypt');
        await owner.query("UPDATE users SET role='Technician',password_hash=$2,current_session_id=$3 WHERE user_id=$1",[user,await bcrypt.hash(passwordForAudit,4),session]);
        await owner.query("UPDATE user_branch_memberships SET role='Radiologist' WHERE user_id=$1 AND branch_id=$2",[user,A]);
        const breakReq={user:{user_id:user,role:'Radiologist',identity_role:'Technician',organization_id:org,is_org_admin:false,session_id:session},branchContext:{branchId:A,branchRole:'Radiologist'},body:{reason:'Synthetic urgent clinical audit justification only',currentPassword:passwordForAudit},headers:{},get:()=>'',ip:'127.0.0.1',method:'POST',originalUrl:'/api/rbac/break-glass'};
        const breakRes=makeResponse();let breakError;
        await require('../../backend/src/controllers/rbacController').requestBreakGlass(app)(breakReq,breakRes,e=>{breakError=e;});
        if(breakRes.body?.token){
            const claims=require('../../backend/node_modules/jsonwebtoken').decode(breakRes.body.token);
            const authRes=makeResponse();let allowed=false;configureAuthDatabase(app);
            await authenticateToken({headers:{authorization:'Bearer '+breakRes.body.token},method:'GET',originalUrl:'/api/rbac/my-permissions'},authRes,()=>{allowed=true;});
            evidence.checks.emergencyTokenIdentity={accountRole:'Technician',tokenRole:claims.role,allowed,status:authRes.statusCode,code:authRes.body?.code};
        }else evidence.checks.emergencyTokenIdentity={handlerError:breakError?.message||breakRes.body};
        await owner.query("UPDATE users SET role='Receptionist' WHERE user_id=$1",[user]);
        await owner.query("UPDATE user_branch_memberships SET role='Admin' WHERE user_id=$1 AND branch_id=$2",[user,A]);
        await owner.query("INSERT INTO permissions(name,module) VALUES('AUDIT_SYNTHETIC_READ','Audit'),('MANAGE_ROLES','Audit') ON CONFLICT(name) DO NOTHING");
        await owner.query("INSERT INTO role_permissions(role_name,permission_id) SELECT 'Nurse',permission_id FROM permissions WHERE name='AUDIT_SYNTHETIC_READ' ON CONFLICT DO NOTHING");
        await owner.query("INSERT INTO role_permissions(role_name,permission_id) SELECT 'Admin',permission_id FROM permissions WHERE name='MANAGE_ROLES' ON CONFLICT DO NOTHING");
        const roleReq={user:{user_id:user,role:'Admin',identity_role:'Receptionist',is_org_admin:false,organization_id:org},branchContext:{branchId:A,branchRole:'Admin'},params:{role:'Nurse'},body:{permissionIds:[]},headers:{},get:()=>'',ip:'127.0.0.1'};
        const roleRes=makeResponse();let permissionPassed=false;let roleError;
        await require('../../backend/src/middleware/rbacMiddleware').hasPermission(app,'MANAGE_ROLES')(roleReq,roleRes,()=>{permissionPassed=true;});
        await require('../../backend/src/controllers/rbacController').updateRolePermissions(app)(roleReq,roleRes,e=>{roleError=e;});
        evidence.checks.branchAdminGlobalRbac={permissionPassed,status:roleRes.statusCode,error:roleError?.message,remainingNursePermissions:(await owner.query("SELECT count(*)::int AS n FROM role_permissions WHERE role_name='Nurse'")).rows[0].n};
        const otherOrg=id(500),otherUser=id(501),otherBranch=id(502);
        await owner.query("INSERT INTO organizations(id,code,name) VALUES($1,'AUDIT-ORG','Synthetic organization')",[otherOrg]);
        await owner.query("INSERT INTO branches(id,organization_id,code,name) VALUES($1,$2,'AUDIT-ORG-B','Synthetic organization branch')",[otherBranch,otherOrg]);
        await owner.query("INSERT INTO users(user_id,full_name,email,password_hash,role,organization_id) VALUES($1,'Synthetic other user','other-audit@example.invalid','not-a-password','Receptionist',$2)",[otherUser,otherOrg]);
        await owner.query("INSERT INTO user_branch_memberships(user_id,branch_id,role,is_active,is_default) VALUES($1,$2,'Receptionist',TRUE,TRUE)",[otherUser,otherBranch]);
        const {getUserBranches}=require('../../backend/src/services/branchService');
        evidence.checks.nonDefaultOrganization={implicitOrganizationBranches:(await getUserBranches(app,otherUser,false)).branches.length,explicitOrganizationBranches:(await getUserBranches(app,otherUser,false,otherOrg)).branches.length};
        const notified=await require('../../backend/src/services/notificationService').sendInApp('Synthetic role audience','Synthetic audit','Synthetic content only',app,{audienceType:'Staff',audienceRole:'Admin',branchId:B,eventType:'AUDIT_SYNTHETIC_BRANCH'});
        evidence.checks.notificationBranchPersistence={requestedBranch:B,result:notified,persistedBranches:(await owner.query("SELECT branch_id FROM notifications WHERE event_type='AUDIT_SYNTHETIC_BRANCH'")).rows.map(r=>r.branch_id)};
        try { await scoped(c=>c.query("SELECT license_quota_usage('patients')"));evidence.checks.patientQuota={works:true}; }
        catch(e){evidence.checks.patientQuota={works:false,code:e.code,error:e.message};}
        try { await scoped(c=>c.query('UPDATE examinations SET branch_id=$1 WHERE exam_id=$2',[B,exam]));evidence.checks.branchTransfer={works:true}; }
        catch(e){evidence.checks.branchTransfer={works:false,code:e.code,error:e.message,bothBranchMemberships:true};}
        const admin=crypto.randomUUID();
        await owner.query(`INSERT INTO users(user_id,full_name,email,password_hash,role,organization_id,is_org_admin) VALUES($1,'Synthetic Admin','admin-audit@example.invalid','not-a-password','Admin',$2,TRUE)`,[admin,org]);
        await owner.query("UPDATE examinations SET current_station='Nurse',queue_stage='Prep Pending' WHERE exam_id=$1",[exam]);
        await owner.query("UPDATE user_branch_memberships SET role='Nurse' WHERE user_id=$1 AND branch_id=$2",[user,A]);
        const {assignTask}=require('../../backend/src/services/clinicalTaskAssignmentService');
        try{
            await scoped(c=>assignTask(c,{examId:exam,targetUserId:user,actor:{user_id:admin,role:'Admin',is_org_admin:true,organization_id:org},reason:'Synthetic audit'}),admin);
            evidence.checks.branchClinicalAssignment={eligibleBranchRoleAccepted:true};
        }catch(e){evidence.checks.branchClinicalAssignment={eligibleBranchRoleAccepted:false,branchRole:'Nurse',accountRole:'Receptionist',code:e.code||e.details?.code,error:e.message};}
        await owner.query("UPDATE users SET role='Nurse' WHERE user_id=$1",[user]);
        await owner.query("UPDATE user_branch_memberships SET role='Receptionist' WHERE user_id=$1 AND branch_id=$2",[user,A]);
        try{
            const assigned=await scoped(c=>assignTask(c,{examId:exam,targetUserId:user,actor:{user_id:admin,role:'Admin',is_org_admin:true,organization_id:org},reason:'Synthetic audit'}),admin);
            evidence.checks.branchClinicalAssignment.ineligibleBranchRoleAssigned={succeeded:true,branchRole:'Receptionist',assignedRole:assigned.task_role};
        }catch(e){evidence.checks.branchClinicalAssignment.ineligibleBranchRoleAssigned={succeeded:false,code:e.code||e.details?.code,error:e.message};}
        await owner.query("UPDATE users SET role='Receptionist' WHERE user_id=$1",[user]);
        await owner.query("UPDATE user_branch_memberships SET role='Admin' WHERE user_id=$1 AND branch_id=$2",[user,A]);
        const allProof=signBranchContext(null,admin);
        await scoped(async c=>{
            await c.query('SELECT set_branch_context(NULL,$1,TRUE,$2,$3,$4)',[admin,allProof.signature,allProof.expires,'Staff']);
            await c.query('UPDATE examinations SET branch_id=$1 WHERE exam_id=$2',[B,exam]);
            evidence.checks.branchTransfer.allBranchesAdminCanTransfer=true;
        });
        evidence.checks.databasePrivileges=(await owner.query(`SELECT has_table_privilege('rcms_app_user','appointments','TRUNCATE') AS can_truncate,
            has_table_privilege('rcms_app_user','branch_context_signing_key','SELECT') AS can_read_context_secret,
            has_table_privilege('rcms_app_user','user_branch_memberships','UPDATE') AS can_edit_memberships`)).rows[0];
        await owner.query(`INSERT INTO appointments(patient_id,branch_id,start_time,end_time)
            SELECT $1,CASE WHEN n%2=0 THEN $2::uuid ELSE $3::uuid END,NOW()+n*interval '2 hours',NOW()+n*interval '2 hours'+interval '1 hour'
            FROM generate_series(1,6000) n`,[patient,A,B]);
        const elapsed=async f=>{const start=performance.now();const result=await f();return{ms:Math.round((performance.now()-start)*100)/100,rows:result.rows[0]?.n};};
        evidence.checks.performance={samples:[],datasetRows:6001};
        for(let i=0;i<3;i++) evidence.checks.performance.samples.push({owner:await elapsed(()=>owner.query('SELECT count(*)::int AS n FROM appointments')),rls:await elapsed(()=>scoped(c=>c.query('SELECT count(*)::int AS n FROM appointments')))});
        const plan=await scoped(c=>c.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM appointments'));
        evidence.checks.performance.plan=plan.rows[0]['QUERY PLAN'][0];
        evidence.checks.beforeRestore=(await owner.query(`SELECT has_table_privilege('rcms_app_user','appointments','SELECT') AS appointments_read,
            has_table_privilege('rcms_app_user','branch_context_signing_key','SELECT') AS context_secret_read,
            has_table_privilege('rcms_app_user','portal_appointment_acl','UPDATE') AS portal_acl_write`)).rows[0];
        run(['exec',name,'pg_dump','-U','postgres','--format=custom','--no-owner','--no-privileges','--file=/tmp/audit.dump','postgres']);
        run(['exec',name,'pg_restore','-U','postgres','--no-owner','--no-privileges','--clean','--if-exists','-d','postgres','/tmp/audit.dump']);
        evidence.checks.afterRestore=(await owner.query(`SELECT has_table_privilege('rcms_app_user','appointments','SELECT') AS appointments_read,
            has_table_privilege('rcms_app_user','branch_context_signing_key','SELECT') AS context_secret_read,
            has_table_privilege('rcms_app_user','portal_appointment_acl','UPDATE') AS portal_acl_write`)).rows[0];
        await runMigrations(owner);
        evidence.checks.afterRestoreAndMigrate=(await owner.query(`SELECT has_table_privilege('rcms_app_user','appointments','SELECT') AS appointments_read,
            has_table_privilege('rcms_app_user','branch_context_signing_key','SELECT') AS context_secret_read,
            has_table_privilege('rcms_app_user','portal_appointment_acl','UPDATE') AS portal_acl_write`)).rows[0];
        const forgedClient=await app.connect();
        try{
            await forgedClient.query('BEGIN');
            const key=(await forgedClient.query('SELECT secret FROM branch_context_signing_key WHERE singleton=TRUE')).rows[0].secret;
            const expires=Math.floor(Date.now()/1000)+60;
            const forgedSignature=crypto.createHmac('sha256',key).update(`|${admin}|${expires}|Staff`).digest('hex');
            await forgedClient.query('SELECT set_branch_context(NULL,$1,FALSE,$2,$3,$4)',[admin,forgedSignature,expires,'Staff']);
            evidence.checks.afterRestoreForgedContext={succeeded:true,visibleAppointments:(await forgedClient.query('SELECT count(*)::int AS n FROM appointments')).rows[0].n};
        }catch(e){evidence.checks.afterRestoreForgedContext={succeeded:false,code:e.code};}
        finally{await forgedClient.query('ROLLBACK');forgedClient.release();}
        evidence.migrations=MIGRATION_FILES.length;
        fs.writeFileSync('scratch/multibranch-deep-postfix-db-evidence-20261014.json',JSON.stringify(evidence,null,2));
        console.log(JSON.stringify({completed:true,migrations:evidence.migrations,checks:evidence.checks}));
    }finally{await app?.end();await owner?.end();try{run(['rm','-f',name]);}catch{}if(fs.existsSync(envFile))fs.unlinkSync(envFile);}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
