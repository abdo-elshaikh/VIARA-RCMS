import test from 'node:test';
import assert from 'node:assert/strict';
import { inquirySchema } from '../lib/inquiry.ts';
const valid = {
  id: '6933fe22-93d5-405f-8e40-70b6b63f37db', name: '  مركز تجريبي  ',
  email: 'hello@example.com', phone: '+20 1012345678', organization: 'منشأة تجريبية',
  facility: 'مركز أشعة', branches: 'فرع واحد', interest: 'RIS', plan: 'أساس',
  message: 'طلب عرض توضيحي', consent: true, website: '',
};
test('valid requests are normalized, including Arabic phone digits', () => {
  const result = inquirySchema.parse({ ...valid, phone: '+٢٠ ١٠١٢٣٤٥٦٧٨' });
  assert.equal(result.name, 'مركز تجريبي');
  assert.equal(result.phone, '+20 1012345678');
});
test('invalid contact details, consent, identifiers, scopes and spam are rejected', () => {
  for (const invalid of [
    { email: 'no-email' }, { phone: '-------' }, { phone: 'call-me' }, { consent: false },
    { name: '   ' }, { id: '../other-user' }, { interest: 'INVALID' },
    { website: 'https://spam.test' }, { message: 'a'.repeat(2001) }, { organization: '' },
  ]) assert.equal(inquirySchema.safeParse({ ...valid, ...invalid }).success, false, JSON.stringify(invalid).slice(0,80));
});
