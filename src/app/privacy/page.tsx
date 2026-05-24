import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-border bg-white p-6 shadow-sm">
        <Link className="text-sm font-medium text-teal-800" href="/report">
          Back to report
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Privacy notice placeholder</h1>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <p>
            KSS uses accessibility reports to identify and respond to operational
            issues at Download Festival. Reports should include only information
            needed to respond.
          </p>
          <p>
            Contact details are optional unless a callback is requested. Medical,
            safeguarding, disability or health information may be special category
            data and is restricted in the dashboard.
          </p>
          <p>
            Replace this placeholder with the approved KSS privacy notice,
            retention period, lawful basis, Article 9 condition, and data subject
            contact route before production use.
          </p>
        </div>
      </div>
    </main>
  );
}
