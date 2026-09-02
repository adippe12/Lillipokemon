import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

export const SUPABASE_URL = url;
export const MON_IMAGES_BUCKET = "mon-images";

export const supabase = createClient(
  url || "http://placeholder.invalid",
  anonKey || "public-anon-key-placeholder",
  {
    realtime: { params: { eventsPerSecond: 8 } },
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

export function publicImageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${MON_IMAGES_BUCKET}/${path}`;
}
