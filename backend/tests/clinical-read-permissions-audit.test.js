const express=require('express');const request=require('supertest');
jest.mock('../src/middleware/authMiddleware',()=>({authenticateToken:(req,_res,next)=>{req.user={role:'Receptionist',user_id:'synthetic-user'};next();},authorizeRole:()=> (_req,_res,next)=>next()}));
jest.mock('../src/middleware/auditRead',()=>()=> (_req,_res,next)=>next());
jest.mock('../src/services/securityEventService',()=>({logSecurityEvent:jest.fn().mockResolvedValue()}));
jest.mock('../src/services/notificationJobService',()=>({triggerEventForRole:jest.fn().mockResolvedValue(),triggerEvent:jest.fn().mockResolvedValue()}));
const routes=require('../src/routes/clinicalExamRoutes');
const examId='11111111-1111-4111-8111-111111111111';
function fixture(permissions){
 const db={query:jest.fn(async(sql,values=[])=>{
  if(sql.includes('FROM role_permissions')){
   const reportCheck=sql.includes("p.name = 'VIEW_REPORTS'");
   const granted=reportCheck?permissions.includes('VIEW_REPORTS'):permissions.includes(values[1]);
   return {rows:granted?[{name:reportCheck?'VIEW_REPORTS':values[1]}]:[]};
  }
  return {rows:[{exam_id:examId,order_number:'ORD-TEST',report_content:'Sensitive report',report_sections:{findings:'Sensitive'},findings:'Sensitive',impression:'Sensitive',prior_report_content:'Prior sensitive',digital_signature_hash:'signature',clinical_indication:'Clinical history',provisional_diagnosis:'Diagnosis'}]};
 })};
 const app=express();app.use('/api',routes(db,{}));app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message}));return {app,db};
}
test('revoked VIEW_EXAMS denies direct API reads before any clinical query',async()=>{
 const {app,db}=fixture([]);await request(app).get(`/api/exams/${examId}`).expect(403);expect(db.query.mock.calls.every(([sql])=>!sql.includes('SELECT e.*'))).toBe(true);
});
test('operational examination reads omit current/prior reports and unnecessary clinical history',async()=>{
 const {app}=fixture(['VIEW_EXAMS']);const {body}=await request(app).get(`/api/exams/${examId}`).expect(200);expect(body.order_number).toBe('ORD-TEST');
 for(const field of ['report_content','report_sections','findings','impression','prior_report_content','digital_signature_hash','clinical_indication','provisional_diagnosis'])expect(body[field]).toBeUndefined();
});
test('case report lists and exact lookup require VIEW_REPORTS on the server',async()=>{
 const {app}=fixture(['VIEW_EXAMS']);await request(app).get('/api/case-reports').expect(403);await request(app).get('/api/case-reports/lookup?code=ORD-TEST').expect(403);
});
