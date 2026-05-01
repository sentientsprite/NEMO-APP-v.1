import { LoginForm } from "@/components/LoginForm";
import { MissingSupabaseConfig } from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  if (!isSupabaseConfigured()) {
    return <MissingSupabaseConfig />;
  }

  return (
    <div className="px-4 py-8">
      <LoginForm />
    </div>
  );
}
