declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    VIARA_ADMIN_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
