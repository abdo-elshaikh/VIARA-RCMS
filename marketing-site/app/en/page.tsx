import ViaraSite from '../viara-site';
import {readPublicContent,readPublishedReviews} from '../../lib/site-server';
export const dynamic='force-dynamic';
export async function generateMetadata(){const {content}=await readPublicContent();return {title:content.seo.title.en,description:content.seo.description.en,alternates:{canonical:'/en',languages:{ar:'/',en:'/en'}},openGraph:{title:content.seo.title.en,description:content.seo.description.en,locale:'en_GB'}};}
export default async function EnglishHome(){const [{content},reviews]=await Promise.all([readPublicContent(),readPublishedReviews()]);return <ViaraSite content={content} reviews={reviews} locale="en"/>;}
