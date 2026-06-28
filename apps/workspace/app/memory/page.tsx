import { Header } from "@/components/Shell";
import { MemoryPanel } from "@/components/MemoryPanel";
import { getPlan } from "@/lib/plan";
import { getMemoryStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const plan = getPlan();
  const store = getMemoryStore();
  await store.ensureReady();
  const docs = await store.loadIndex();

  return (
    <div className="min-h-screen">
      <Header plan={plan} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Memory & knowledge</h1>
        <p className="mb-8 text-nemo-muted">
          Indexed documents power research and citations. Add notes or seed from the default template.
        </p>
        <MemoryPanel initialTotal={docs.length} />
      </main>
    </div>
  );
}
