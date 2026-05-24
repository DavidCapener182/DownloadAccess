"use client";

import { CheckCircle2, Loader2, Send, Upload } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { SiteLocation } from "@/lib/types";

const issueTypes = [
  "Mobility access",
  "Accessible toilet",
  "Accessible shower",
  "Transport or shuttle",
  "Parking or blue badge",
  "Viewing platform",
  "Medical or welfare",
  "Information request",
  "Other",
];

export function PublicReportForm({ locations }: { locations: SiteLocation[] }) {
  const [submittedCase, setSubmittedCase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        setError(null);
        setSubmittedCase(null);
        const form = new FormData(formElement);
        const payload = {
          issue_type: form.get("issue_type"),
          location_id: form.get("location_id") || null,
          report_text: form.get("report_text"),
          assistance_required_now:
            form.get("assistance_required_now") === "on",
          callback_required: form.get("callback_required") === "on",
          contact_name: form.get("contact_name") || null,
          contact_phone: form.get("contact_phone") || null,
          consent_given: form.get("consent_given") === "on",
        };

        startTransition(async () => {
          const response = await fetch("/api/public-report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await response.json();

          if (!response.ok) {
            setError(data.error ?? "Report could not be submitted.");
            return;
          }

          setSubmittedCase(data.case.id);
          formElement.reset();
        });
      }}
    >
      {submittedCase ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            Report received
          </div>
          <p className="mt-1">Case reference: {submittedCase}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          {error}
        </div>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">Issue type</span>
        <select
          required
          name="issue_type"
          className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select issue
          </option>
          {issueTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Location</span>
        <select
          name="location_id"
          className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
          defaultValue=""
        >
          <option value="">Not sure</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">What happened?</span>
        <textarea
          required
          name="report_text"
          minLength={3}
          className="mt-1 min-h-32 w-full rounded-md border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-md border border-border bg-white p-3 text-sm">
          <input name="assistance_required_now" type="checkbox" className="mt-1" />
          <span>Assistance required now</span>
        </label>
        <label className="flex items-start gap-3 rounded-md border border-border bg-white p-3 text-sm">
          <input name="callback_required" type="checkbox" className="mt-1" />
          <span>Callback required</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Contact name optional</span>
          <input
            name="contact_name"
            className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact phone optional</span>
          <input
            name="contact_phone"
            inputMode="tel"
            className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Photo optional</span>
        <div className="mt-1 flex min-h-11 items-center gap-2 rounded-md border border-dashed border-border bg-white px-3 text-sm text-muted-foreground">
          <Upload aria-hidden className="h-4 w-4" />
          <input name="photo" type="file" accept="image/*" className="text-sm" />
        </div>
      </label>

      <label className="flex items-start gap-3 rounded-md border border-border bg-white p-3 text-sm">
        <input required name="consent_given" type="checkbox" className="mt-1" />
        <span>
          I consent to KSS using this report to respond to the issue.{" "}
          <Link href="/privacy" className="font-medium text-teal-800 underline">
            Privacy notice
          </Link>
        </span>
      </label>

      <Button className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <Send aria-hidden className="h-4 w-4" />
        )}
        Submit report
      </Button>
    </form>
  );
}
