// Keep this compatibility entry point for extensionless imports, but target the
// TypeScript implementation explicitly. Without the extension this module
// resolves back to itself in Vite and exposes no named exports.
export { exportReportToWord } from './exportReportToWord.ts';
