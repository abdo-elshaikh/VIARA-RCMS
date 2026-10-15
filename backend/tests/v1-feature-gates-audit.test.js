const express=require('express'),request=require('supertest');
jest.mock('../src/services/licenseService',()=>({getLicense:jest.fn()}));
const {getLicense}=require('../src/services/licenseService');
const routes=require('../src/routes/v1');
test.each([['backups','backup'],['import','import'],['pacs','pacs']])('v1 %s rejects a missing %s license feature',async(endpoint,feature)=>{
 getLicense.mockReturnValue({edition:'standard',allowedModules:[]});
 const app=express();app.use('/api/v1',routes({query:jest.fn()},(_req,_res,next)=>next(),()=> (_req,_res,next)=>next()));
 const result=await request(app).get('/api/v1/'+endpoint).expect(403);expect(result.body.feature).toBe(feature);
});
