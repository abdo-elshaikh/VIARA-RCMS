'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const yauzl = require('../backend/node_modules/yauzl');
const { isExcluded } = require('./package-client-release');
const zipPath = path.resolve(process.argv[2]);
const manifestPath = zipPath.replace(/viara-rcms-client-/, 'release-manifest-').replace(/\.zip$/, '.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hashFile = file => new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256');const stream=fs.createReadStream(file);stream.on('data',b=>hash.update(b));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));});
async function main() {
    assert.equal(await hashFile(zipPath), manifest.sha256, 'Archive digest mismatch');
    const texts = new Map(), archives = new Map(); let files=0;
    await new Promise((resolve,reject)=>yauzl.open(zipPath,{lazyEntries:true},(error,zip)=>{
        if(error)return reject(error);
        zip.on('error',reject);zip.on('end',resolve);
        zip.on('entry',entry=>{
            try {
                assert(entry.fileName.startsWith('viara-production-package/') && !entry.fileName.includes('../'));
                const name=entry.fileName.slice('viara-production-package/'.length);
                assert(!isExcluded(name), 'Forbidden payload: '+name);
                zip.openReadStream(entry,(err,stream)=>{
                    if(err)return reject(err);
                    const hash=crypto.createHash('sha256'),chunks=[];let bytes=0;
                    stream.on('error',reject);stream.on('data',chunk=>{hash.update(chunk);bytes+=chunk.length;if(entry.uncompressedSize<2000000)chunks.push(chunk);});
                    stream.on('end',()=>{
                        try {
                            assert.equal(bytes,entry.uncompressedSize);
                            files++;
                            if(name.endsWith('.tar')) archives.set(name,hash.digest('hex'));
                            else if(entry.uncompressedSize<2000000) texts.set(name,Buffer.concat(chunks));
                            if(/\.(sh|py)$/.test(name)) assert(!Buffer.concat(chunks).includes(13),'CRLF script: '+name);
                            if(name.endsWith('.sh')) assert((entry.externalFileAttributes>>>16)&0o111,'Script is not executable: '+name);
                            zip.readEntry();
                        }catch(e){zip.close();reject(e);}
                    });
                });
            }catch(e){zip.close();reject(e);}
        });zip.readEntry();
    }));
    assert.equal(files,manifest.file_count);
    assert.equal(archives.size,10);
    for(const [name,digest] of archives) assert.equal(texts.get(name+'.sha256').toString().trim().split(/\s+/)[0],digest,'Image checksum: '+name);
    for(const name of ['setup.sh','scripts/setup-client.py','CLIENT_INSTALLATION_AR.md','release-info.json']) assert(texts.has(name),'Missing '+name);
    const template=texts.get('.env.example').toString();
    for(const key of ['LICENSE_KEY','POSTGRES_PASSWORD','JWT_SECRET','ENCRYPTION_KEY','BACKUP_ENCRYPTION_KEY','BLIND_INDEX_KEY','METRICS_TOKEN','REDIS_PASSWORD','ORTHANC_PASSWORD','PACS_WEBHOOK_SECRET']) assert(new RegExp(`^${key}=\\r?$`,'m').test(template),'Embedded credential: '+key);
    assert.equal(texts.get('setup.sh').toString(),fs.readFileSync(path.join(__dirname,'../viara-production-package/setup.sh'),'utf8').replace(/\r\n/g,'\n'),'Setup differs from final source');
    const startPage='00_ابدأ_من_هنا_START_HERE.html';
    assert(texts.has(startPage),'Missing START HERE page');
    assert.equal(texts.get(startPage).toString(),fs.readFileSync(path.join(__dirname,'../viara-production-package',startPage),'utf8'),'START HERE differs from final source');
    const result={passed:true,files,imageArchives:archives.size,sha256:manifest.sha256,archive:zipPath};
    fs.writeFileSync(zipPath+'.verification.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
