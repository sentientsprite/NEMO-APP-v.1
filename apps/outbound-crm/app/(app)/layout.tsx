import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/actions/leads";
import { createClient } from "@/lib/supabase/server";

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <nav className="flex gap-4 text-sm font-semibold">
          <Link href="/queue" className="text-indigo-600">
            Queue
          </Link>
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-slate-600 underline">
            Sign out
          </button>
        </form>
      </header>
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:max-w-2xl lg:max-w-3xl">{children}</div>
    </div>
  );
}
