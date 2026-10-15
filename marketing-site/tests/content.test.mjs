import test from 'node:test';
import assert from 'node:assert/strict';
import {siteContentSchema,defaultContent,isOfferActive,cairoDay,offerSchema,L} from '../lib/site-content.ts';
import {reviewSchema} from '../lib/review.ts';
import {matchesAdmin} from '../lib/access.ts';
const copy=()=>structuredClone(defaultContent);
test('default content is bilingual, valid and free of fabricated testimonials or offers',()=>{
 assert.equal(siteContentSchema.safeParse(defaultContent).success,true);
 assert.equal(defaultContent.offers.length,0);
 for(const product of defaultContent.products){assert.ok(product.name.ar&&product.name.en);for(const feature of product.features)assert.ok(feature.ar&&feature.en);}
});
test('content rejects unsafe links, CSS injection and missing language content',()=>{
 for(const alter of [c=>c.contact.facebook='javascript:alert(1)',c=>c.brand.logo='data:image/svg+xml,<svg/>',c=>c.brand.primary='red;display:none',c=>c.hero.title.en='',c=>c.contact.email='invalid',c=>c.contact.phone='-------',c=>c.products.forEach(p=>p.enabled=false),c=>c.plans.forEach(p=>p.enabled=false)]){const content=copy();alter(content);assert.equal(siteContentSchema.safeParse(content).success,false);}
});
test('offers expire at the end of their Cairo calendar day',()=>{
 const offer={id:'6933fe22-93d5-405f-8e40-70b6b63f37db',title:L('عرض حقيقي','Actual offer'),description:L('وصف العرض وشروطه','Offer description and conditions'),badge:L('عرض','Offer'),endDate:'2026-10-14',active:true,plan:'أساس'};
 assert.equal(cairoDay(new Date('2026-10-14T21:00:00Z')),'2026-10-15');
 assert.equal(isOfferActive(offer,new Date('2026-10-14T20:59:59Z')),true);
 assert.equal(isOfferActive(offer,new Date('2026-10-14T21:00:00Z')),false);
 assert.equal(isOfferActive({...offer,active:false},new Date('2026-10-13T00:00:00Z')),false);
 assert.equal(offerSchema.safeParse({...offer,endDate:'2026-02-31'}).success,false);
 assert.equal(offerSchema.safeParse({...offer,title:L('','')}).success,false);
});
test('admin access requires the configured owner and fails closed',()=>{
 assert.equal(matchesAdmin('owner@example.com',undefined),false);
 assert.equal(matchesAdmin('','  '),false);
 assert.equal(matchesAdmin('other@example.com','owner@example.com'),false);
 assert.equal(matchesAdmin('owner@example.com.attacker.test','owner@example.com'),false);
 assert.equal(matchesAdmin(' OWNER@EXAMPLE.COM ','owner@example.com'),true);
});
test('review validation requires consent, real content and a bounded rating, and strips client moderation fields',()=>{
 const review={id:'6933fe22-93d5-405f-8e40-70b6b63f37db',name:'مراجع تجريبي',role:'',organization:'',quote:'هذا نص اختبار لا ينشر على الموقع',rating:5,locale:'ar',consent:true};
 for(const invalid of [{consent:false},{rating:6},{rating:0},{quote:'short'},{locale:'unknown'}])assert.equal(reviewSchema.safeParse({...review,...invalid}).success,false);
 const result=reviewSchema.parse({...review,status:'approved',userId:'another-user'});
 assert.equal('status' in result,false);assert.equal('userId' in result,false);
});
test('existing saved content gains default page imagery without losing customized text',()=>{
 const legacy=copy();delete legacy.imagery;legacy.hero.title.ar='عنوان مخصص محفوظ';
 const parsed=siteContentSchema.parse(legacy);
 assert.equal(parsed.hero.title.ar,'عنوان مخصص محفوظ');
 assert.equal(parsed.imagery.hero,'/assets/scenes/radiology-care.webp');
 assert.equal(parsed.imagery.care,'/assets/scenes/medical-team.webp');
 assert.equal(siteContentSchema.safeParse({...legacy,imagery:{hero:'javascript:alert(1)',care:'/assets/scenes/medical-team.webp'}}).success,false);
});
