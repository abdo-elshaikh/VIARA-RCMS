const express = require('express');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
jest.mock('../src/middleware/rateLimiters', () => ({ publicCaseStatusLimiter: (_req,_res,next)=>next() }));
const { lookupCaseReport } = require('../src/controllers/examController');
const { validateQuery } = require('../src/middleware/validateRequest');
const { getRequestQuery } = require('../src/utils/requestQuery');
const publicRoutes = require('../src/routes/publicLandingRoutes');

test('Express 5 lookup passes the exact reference; unknown codes cannot return the first case', async () => {
    const cases = [
        {exam_id:'e1',order_number:'ORD-20261010-AAA111',receipt_number:'RCT-20261010-AAA111'},
        {exam_id:'e2',order_number:'ORD-20261010-BBB222',invoice_number:'INV-20261010-BBB222'}
    ];
    const db={query:jest.fn(async(sql,values)=>{
        expect(sql).toContain('pay.receipt_number = $1');
        expect(values.slice(1)).toEqual([1,0]);
        return {rows:cases.filter(row=>Object.values(row).includes(values[0]))};
    })};
    const app=express();app.use((req,_res,next)=>{req.user={role:'Developer',user_id:'test'};next();});app.get('/lookup',lookupCaseReport(db));
    for(const [code,id] of [['ORD-20261010-AAA111','e1'],['INV-20261010-BBB222','e2'],['e2','e2'],['RCT-20261010-AAA111','e1']]) {
        const result=await request(app).get('/lookup').query({code,search:'untrusted',limit:100}).expect(200);
        expect(result.body.items.map(row=>row.exam_id)).toEqual([id]);
    }
    const qr='https://patients.example.test/patient/login?mrn=MRN-1&orderNumber=ORD-20261010-BBB222';
    expect((await request(app).get('/lookup').query({code:qr}).expect(200)).body.items[0].exam_id).toBe('e2');
    expect((await request(app).get('/lookup').query({code:'UNKNOWN'}).expect(200)).body.items).toEqual([]);
});
test('Express 5 query coercion, defaults and stripping reach consumers', async()=>{
    const app=express();app.get('/',validateQuery(z.object({limit:z.coerce.number().default(17)})),(req,res)=>res.json(getRequestQuery(req)));
    expect((await request(app).get('/').expect(200)).body).toEqual({limit:17});
    expect((await request(app).get('/?limit=5&secret=ignored').expect(200)).body).toEqual({limit:5});
    await request(app).get('/?limit=oops').expect(400);
});
test('actual public router registers verify/status/booking and invalid report tokens terminate promptly',async()=>{
    const app=express();app.use(express.json());app.use('/api/public',publicRoutes({query:jest.fn()}));
    for(const endpoint of ['case-status/verify','case-status/status','appointment-requests'])await request(app).post('/api/public/'+endpoint).send({}).expect(400);
    await request(app).post('/api/public/final-report').send({accessToken:'invalid'}).timeout({response:1500}).expect(401);
    await request(app).get('/api/public/final-report/invalid').timeout({response:1500}).expect(401);
    expect(fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8')).toContain("app.use('/api/public', publicLandingRoutes(pool))");
});
