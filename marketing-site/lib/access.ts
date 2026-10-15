export function matchesAdmin(email:string, configured:string|undefined) {
 return !!configured?.trim() && !!email.trim() && email.trim().toLowerCase() === configured.trim().toLowerCase();
}
