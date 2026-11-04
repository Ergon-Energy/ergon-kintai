import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** サーバー専用。service_role キーを使うので、クライアントコンポーネントから import しないこと */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
