const { paymentIntegrity }=require('../../performance-tests/lib/paymentIntegrity');
const scenario=require('../../performance-tests/scenarios/04_billing_payment');
test('billing load assertion rejects double payment or failed business operations',()=>{
 const first={payment:{payment_id:'p1'}},before={paid_amount:0,payments:[]},after={paid_amount:1,payments:[{payment_id:'p1'}]};
 expect(paymentIntegrity({first,replay:first,before,after,amount:1})).toBe(true);
 expect(paymentIntegrity({first,replay:{},before,after,amount:1})).toBe(false);
 expect(paymentIntegrity({first,replay:first,before,after:{paid_amount:2,payments:[{payment_id:'p1'},{payment_id:'p2'}]},amount:1})).toBe(false);
});
test('an empty invoice fixture explicitly fails rather than skipping payment silently',async()=>{
 const metricsCollector={record:jest.fn()},client={get:jest.fn().mockResolvedValue({ok:true,status:200,data:[],duration:1})};
 await scenario({vuId:0,userPool:{createAuthenticatedClient:async()=>client},metricsCollector});
 expect(metricsCollector.record.mock.calls.some(([record])=>!record.ok&&record.action==='Payable invoice fixture required')).toBe(true);
});
