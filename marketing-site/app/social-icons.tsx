import type {SVGProps} from 'react';
type Props=SVGProps<SVGSVGElement>&{size?:number};
const props=(size=18)=>({width:size,height:size,viewBox:'0 0 24 24','aria-hidden':true as const});
export function Facebook({size,...rest}:Props){return <svg {...props(size)} {...rest} fill="currentColor"><path d="M14 22v-9h3l.5-3H14V8c0-1 .4-1.5 1.6-1.5H18V3.3c-.5-.1-1.7-.3-3-.3-3.1 0-5 1.9-5 5v2H7v3h3v9z"/></svg>;}
export function Instagram({size,...rest}:Props){return <svg {...props(size)} {...rest} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;}
export function Linkedin({size,...rest}:Props){return <svg {...props(size)} {...rest} fill="currentColor"><rect x="3" y="9" width="4" height="12" rx=".4"/><circle cx="5" cy="4.8" r="2.2"/><path d="M10 9h3.8v1.6c.6-1.1 1.8-2 3.6-2 3 0 3.6 2 3.6 5V21h-4v-6.4c0-1.5-.1-2.6-1.6-2.6-1.6 0-1.8 1.4-1.8 2.8V21H10z"/></svg>;}
export function Youtube({size,...rest}:Props){return <svg {...props(size)} {...rest} fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 6 3-6 3z" fill="currentColor" stroke="none"/></svg>;}
