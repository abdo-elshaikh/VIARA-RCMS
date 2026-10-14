import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { matchesAdmin } from './access';
export async function getAdmin() {
  const user = await getChatGPTUser();
  if (!user || !matchesAdmin(user.email, env.VIARA_ADMIN_EMAIL)) return null;
  return user;
}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
