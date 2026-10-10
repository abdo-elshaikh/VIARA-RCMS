import {describe,it,expect} from 'vitest';
import {findExactReportMatch} from '../reportLookup';
describe('exact report lookup',()=>{
 const rows=[{exam_id:'a',order_number:'ORD-20261010-AAA111'},{exam_id:'b',invoice_number:'INV-20261010-BBB222'}];
 it('never opens the first item for an unknown reference',()=>expect(findExactReportMatch(rows,'UNKNOWN')).toBeUndefined());
 it('selects the matching item even if another case comes first',()=>expect(findExactReportMatch(rows,'INV-20261010-BBB222')).toBe(rows[1]));
 it('supports scanner QR URLs and rejects MRN-only QR codes',()=>{expect(findExactReportMatch(rows,'https://portal.example.test/patient/login?mrn=MRN-1&orderNumber=ORD-20261010-AAA111')).toBe(rows[0]);expect(findExactReportMatch(rows,'https://portal.example.test/patient/login?mrn=MRN-1')).toBeUndefined();});
});
