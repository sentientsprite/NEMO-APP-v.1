import { redirect } from "next/navigation";

import { MissingSupabaseConfig } from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <MissingSupabaseConfig />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  redirect("/queue");
}
