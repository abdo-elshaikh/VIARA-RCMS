import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import {getAdmin} from '../../lib/admin-auth';
import {readContent} from '../../lib/site-server';
import AdminClient from './admin-client';
export const dynamic='force-dynamic';
export const metadata={title:'إدارة الموقع | VIARA',robots:{index:false,follow:false}};
export default async function AdminPage(){
 const user=await requireChatGPTUser('/admin');
 if(!await getAdmin())return <main className="admin-denied"><span className="admin-access-mark">V.</span><h1>استخدم حساب مالك الموقع للدخول</h1><p>لوحة الإدارة متاحة للحساب الذي أنشأ VIARA. لا تحتاج إلى كلمة مرور منفصلة.</p><p>Signed in as: <bdi>{user.email}</bdi></p><a className="button" href={chatGPTSignOutPath('/admin')} target="_top">تبديل الحساب / Switch account</a><a className="text-link" href="/">العودة للموقع / Return to website</a></main>;
 try{const initial=await readContent();return <AdminClient initial={initial} name={user.displayName}/>;}catch{return <main className="admin-denied"><h1>تعذر تحميل لوحة الإدارة</h1><p>Content could not be loaded. Refresh this page to try again.</p><a href="/admin" className="button">إعادة المحاولة / Retry</a></main>;}
}
