// Executed inside an isolated release-test backend, never on a customer site.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {Client} = require('/app/node_modules/pg');
(async()=>{
    assert.equal(process.env.VIARA_AUDIT_SYNTHETIC,'1');
    const db = new Client({connectionString:process.env.DATABASE_URL});
    await db.connect();
    try {
        const users=await db.query('SELECT email FROM users');
        assert.deepEqual(users.rows.map(row=>row.email),['admin@synthetic.example.test']);
        const source=process.env.ORTHANC_URL;
        const headers={Authorization:'Basic '+Buffer.from(`${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`).toString('base64')};
        const request=async(url,options={})=>{
            const result=await fetch(url,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)});
            if(!result.ok) throw Error(`Synthetic PACS request failed: ${result.status}`);
            return result;
        };
        assert.deepEqual(await (await request(source+'/instances')).json(),[]);
        const created=await (await request(source+'/tools/create-dicom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Tags:{PatientName:'AUDIT^SYNTHETIC',PatientID:'VIARA-AUDIT-ONLY',StudyDescription:'Synthetic backup acceptance',Modality:'OT'}})})).json();
        assert.ok(created.ID);
        const original=Buffer.from(await (await request(`${source}/instances/${created.ID}/file`)).arrayBuffer());
        const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
        const dir=await fs.mkdtemp('/tmp/viara-backup-audit-');
        const uploads=path.join(dir,'source');
        const expected={'documents/synthetic.txt':Buffer.from('VIARA synthetic document acceptance'),'chat/synthetic.bin':crypto.randomBytes(128*1024)};
        for(const [file,buffer] of Object.entries(expected)) {
            await fs.mkdir(path.dirname(path.join(uploads,file)),{recursive:true});
            await fs.writeFile(path.join(uploads,file),buffer);
        }
        process.env.BACKUP_DIR=path.join(dir,'backups');
        process.env.UPLOADS_BACKUP_ROOT=uploads;
        process.env.UPLOADS_BACKUP_ENABLED='true';
        process.env.PACS_BACKUP_ENABLED='true';
        await db.query('CREATE TABLE public.audit_restore_probe(value text NOT NULL)');
        await db.query("INSERT INTO public.audit_restore_probe VALUES ('synthetic-roundtrip')");
        const service=require('/app/src/services/postgresBackupService');
        const backup=await service.createPostgresBackup();
        assert.equal(backup.scope,'database-pacs-and-uploads');
        assert.equal(backup.companions.length,2);
        const dbName='audit_restore_'+crypto.randomBytes(6).toString('hex');
        await db.query(`CREATE DATABASE ${dbName}`);
        const targetUrl=new URL(process.env.DATABASE_URL);targetUrl.pathname='/'+dbName;
        // This archive was confirmed empty before injecting our sole synthetic instance.
        await request(`${source}/instances/${created.ID}`,{method:'DELETE'});
        assert.deepEqual(await (await request(source+'/instances')).json(),[]);
        const targetUploads=path.join(dir,'restored');
        const restored=await service.restorePostgresBackup(backup.filename,{databaseUrl:targetUrl.toString(),uploadsRoot:targetUploads,requireUploads:true,orthancUrl:source,orthancUser:process.env.ORTHANC_USERNAME,orthancPassword:process.env.ORTHANC_PASSWORD});
        assert.equal(restored.verified,true);
        assert.equal(restored.uploads.file_count,2);
        for(const [file,buffer] of Object.entries(expected)) assert.equal(hash(await fs.readFile(path.join(targetUploads,file))),hash(buffer));
        assert.equal(hash(Buffer.from(await (await request(`${source}/instances/${created.ID}/file`)).arrayBuffer())),hash(original));
        const restoredDb=new Client({connectionString:targetUrl.toString()});
        await restoredDb.connect();
        try { assert.equal((await restoredDb.query('SELECT value FROM public.audit_restore_probe')).rows[0].value,'synthetic-roundtrip'); }
        finally { await restoredDb.end(); }
        console.log('AUDIT_BACKUP_RESULT='+JSON.stringify({passed:true,scope:backup.scope,databaseMarker:true,uploads:2,dicomInstances:1,sha256Verified:true,separateDatabase:true,separateHost:false,emptyPacsTarget:true}));
    } finally { await db.end(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
