import { PublicReportForm } from "@/components/public-report-form";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const locations = await getStore().listLocations();

  return (
    <main className="flex-1 bg-background px-4 py-5">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              Accessibility campsite
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              Tell KSS about an issue now
            </h1>
          </div>
        </div>

        <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
          <PublicReportForm locations={locations} />
        </section>
      </div>
    </main>
  );
}
