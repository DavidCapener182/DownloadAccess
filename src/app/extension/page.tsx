import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";

const controls = [
  "Manual Review Mode",
  "Auto-Send Critical Only",
  "Pause Monitoring",
  "Allowed Facebook group/page URLs",
  "Allowed domains",
  "Dashboard API URL",
  "Source API token",
];

const approvedFacebookGroups = [
  {
    name: "Download Festival Access",
    url: "https://www.facebook.com/groups/downloadfestivalaccess",
  },
];

export default function ExtensionPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              Chrome extension
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              Authorised page monitor
            </h1>
          </div>
          <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted" href="/">
            Live monitor
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader title="Operational limits" />
            <div className="space-y-3 p-4 text-sm leading-6 text-slate-700">
              <p>
                The extension observes only visible page text after an authorised
                monitor enables a page. It does not bypass login, open hidden
                comments, crawl groups, collect profile URLs, or run as a bot.
              </p>
              <p>
                Medium and higher keyword matches are submitted to the API.
                Low matches remain in the extension for optional review. Critical
                matches send immediately and show a Chrome notification.
              </p>
              <p>
                Build the unpacked extension with <code>npm run extension:build</code>
                and load the generated <code>extension/dist</code> folder in Chrome.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Approved Facebook groups" />
            <div className="space-y-3 p-4 text-sm">
              {approvedFacebookGroups.map((group) => (
                <a
                  key={group.url}
                  className="block rounded-md border border-border px-3 py-2 font-medium text-teal-800 hover:bg-muted"
                  href={group.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {group.name}
                </a>
              ))}
              <p className="text-muted-foreground">
                Add more group URLs here and in the extension options only after
                KSS confirms authorised monitoring access.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Controls" />
            <div className="grid gap-2 p-4">
              {controls.map((control) => (
                <div
                  key={control}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  {control}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
