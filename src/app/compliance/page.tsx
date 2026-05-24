import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";

const dpiaItems = [
  "Define monitoring sources and authorised staff roles.",
  "Record lawful basis under Article 6.",
  "Record Article 9 condition for special category risk.",
  "Document data minimisation rules and redaction defaults.",
  "Assess risks to accessibility group members and festival customers.",
  "Confirm retention periods and deletion workflow.",
  "Approve escalation handling for medical and safeguarding terms.",
];

const liaItems = [
  "Purpose test: operational safety and accessibility support.",
  "Necessity test: use minimal extracts, not profile harvesting.",
  "Balancing test: restrict visibility and avoid covert collection.",
  "Optics test: no hidden scraper, fake login or platform bypass.",
  "Review cadence: daily during event and after-event debrief.",
];

export default function CompliancePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              Governance
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              Compliance setup
            </h1>
          </div>
          <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" href="/">
            Live monitor
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Checklist title="DPIA checklist" items={dpiaItems} />
          <Checklist title="Legitimate interests assessment" items={liaItems} />
        </div>

        <Card className="mt-5">
          <CardHeader title="Special category warning" />
          <div className="space-y-3 p-4 text-sm leading-6 text-slate-700">
            <p>
              Accessibility, disability, medical and safeguarding wording can
              reveal health information. Treat original post text and report text
              as restricted operational data.
            </p>
            <p>
              Do not build private Facebook bots, fake-login scrapers or hidden
              collection flows. Use the Chrome extension only with authorised
              users viewing approved pages.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-2 p-4">
        {items.map((item) => (
          <label
            key={item}
            className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
          >
            <input type="checkbox" className="mt-1" />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}
