'use strict';
// Prepare a new immutable cache without changing existing release archives.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {pipeline} = require('node:stream/promises');
async function main() {
    for (const key of ['VIARA_RELEASE_PACKAGE_DIR','VIARA_RELEASE_IMAGE_CACHE_DIR']) {
        if (!process.env[key]) throw Error(`${key} is required`);
    }
    const stage = path.resolve(process.env.VIARA_RELEASE_PACKAGE_DIR);
    const cache = path.resolve(process.env.VIARA_RELEASE_IMAGE_CACHE_DIR);
    const reuse = process.env.VIARA_RELEASE_REUSE_IMAGE_CACHE_DIR && path.resolve(process.env.VIARA_RELEASE_REUSE_IMAGE_CACHE_DIR);
    const info = JSON.parse(fs.readFileSync(path.join(stage,'release-info.json'),'utf8'));
    fs.mkdirSync(cache); // Refuse to mutate any existing cache.
    const result = [];
    for (const image of Object.values(info.images)) {
        if (!/^sha256:[a-f0-9]{64}$/.test(image.id)) throw Error('Expected an immutable image ID');
        const filename = image.id.replace(/[^a-zA-Z0-9._-]+/g,'_')+'.tar';
        const target = path.join(cache,filename);
        const [local] = JSON.parse(execFileSync('docker',['image','inspect',image.id],{encoding:'utf8'}));
        if(local.Os!=='linux'||local.Architecture!=='amd64') throw Error('Unsupported image platform');
        if(reuse && fs.existsSync(path.join(reuse,filename))) {
            const digest = crypto.createHash('sha256');
            await pipeline(fs.createReadStream(path.join(reuse,filename)),digest);
            const expected = fs.readFileSync(path.join(reuse,filename+'.sha256'),'utf8').trim().split(/\s+/)[0];
            if(digest.digest('hex')!==expected) throw Error(`Corrupt reusable image: ${filename}`);
            fs.linkSync(path.join(reuse,filename),target);
            fs.copyFileSync(path.join(reuse,filename+'.sha256'),target+'.sha256');
            result.push({image:image.id,reused:true});
        } else {
            execFileSync('docker',['save','--output',target,image.id],{stdio:'inherit',timeout:600000});
            const digest = crypto.createHash('sha256');
            await pipeline(fs.createReadStream(target),digest);
            fs.writeFileSync(target+'.sha256',`${digest.digest('hex')}  ${filename}\n`);
            result.push({image:image.id,reused:false});
        }
    }
    fs.writeFileSync(path.join(cache,'cache-info.json'),JSON.stringify({sourceCommit:info.sourceCommit,images:result},null,2));
    console.log(`Verified ${result.length} image archives: ${cache}`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
