import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing. Multi-device mode will not work until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set."
  );
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
