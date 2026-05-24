import Link from "next/link";
import { PublicReportForm } from "@/components/public-report-form";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const locations = await getStore().listLocations();

  return (
    <main className="min-h-screen bg-background px-4 py-5">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              Accessibility campsite
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              Tell KSS about an issue now
            </h1>
          </div>
          <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" href="/">
            Control room
          </Link>
        </div>

        <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
          <PublicReportForm locations={locations} />
        </section>
      </div>
    </main>
  );
}
