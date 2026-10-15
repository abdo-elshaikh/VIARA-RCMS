import ViaraSite from './viara-site';
import {readPublicContent,readPublishedReviews} from '../lib/site-server';
export const dynamic='force-dynamic';
export async function generateMetadata(){const {content}=await readPublicContent();return {title:content.seo.title.ar,description:content.seo.description.ar,alternates:{canonical:'/',languages:{ar:'/',en:'/en'}},openGraph:{title:content.seo.title.ar,description:content.seo.description.ar,locale:'ar_EG'}};}
export default async function Home(){const [{content},reviews]=await Promise.all([readPublicContent(),readPublishedReviews()]);return <ViaraSite content={content} reviews={reviews} locale="ar"/>;}
