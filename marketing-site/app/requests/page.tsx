import {requireChatGPTUser} from '../chatgpt-auth';
import {readPublicContent} from '../../lib/site-server';
import {readMyRequests} from '../../lib/my-requests';
import RequestsView from './requests-view';
export const dynamic='force-dynamic';
export const metadata={title:'طلباتي | VIARA',robots:{index:false,follow:false}};
export default async function RequestsPage(){const user=await requireChatGPTUser('/requests');const {content}=await readPublicContent();let records:Awaited<ReturnType<typeof readMyRequests>>=[];let error=false;try{records=await readMyRequests(user.userId);}catch{error=true;}return <RequestsView records={records} loadError={error} content={content} locale="ar"/>;}
