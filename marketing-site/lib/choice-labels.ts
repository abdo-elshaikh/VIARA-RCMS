import type {Locale} from './site-content';
const english:Record<string,string>={'مركز أشعة':'Radiology center','مركز طبي':'Medical center','عيادات تخصصية':'Specialty clinics','مجموعة فروع':'Branch network','فرع واحد':'One branch','2–5 فروع':'2–5 branches','أكثر من 5 فروع':'More than 5 branches','أساس':'Essential','نمو':'Growth','مؤسسات':'Enterprise','لم أحدد بعد':'Not selected'};
export const choiceLabel=(value:string,locale:Locale)=>locale==='en'?english[value]||value:value;
