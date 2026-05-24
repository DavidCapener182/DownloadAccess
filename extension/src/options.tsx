import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "./settings";
import type { ExtensionSettings } from "./types";

function Options() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  if (!settings) {
    return <Shell>Loading...</Shell>;
  }

  return (
    <Shell>
      <h1>KSS Accessibility Monitor Options</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await saveSettings(settings);
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
        }}
      >
        <Field label="Dashboard API URL">
          <input
            value={settings.apiUrl}
            onChange={(event) =>
              setSettings({ ...settings, apiUrl: event.target.value })
            }
          />
        </Field>
        <Field label="User API token">
          <input
            type="password"
            value={settings.apiToken}
            onChange={(event) =>
              setSettings({ ...settings, apiToken: event.target.value })
            }
          />
        </Field>
        <Field label="Source id">
          <input
            value={settings.sourceId}
            onChange={(event) =>
              setSettings({ ...settings, sourceId: event.target.value })
            }
          />
        </Field>
        <Field label="Source name">
          <input
            value={settings.sourceName}
            onChange={(event) =>
              setSettings({ ...settings, sourceName: event.target.value })
            }
          />
        </Field>
        <Field label="Allowed domains">
          <textarea
            value={settings.allowedDomains.join("\n")}
            onChange={(event) =>
              setSettings({
                ...settings,
                allowedDomains: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Allowed Facebook group/page URLs">
          <textarea
            value={settings.allowedPageUrls.join("\n")}
            onChange={(event) =>
              setSettings({
                ...settings,
                allowedPageUrls: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Monitoring mode">
          <select
            value={settings.monitoringMode}
            onChange={(event) =>
              setSettings({
                ...settings,
                monitoringMode: event.target.value as ExtensionSettings["monitoringMode"],
              })
            }
          >
            <option value="manual_review">Manual Review Mode</option>
            <option value="auto_send_critical_only">
              Auto-Send Critical Only
            </option>
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.paused}
            onChange={(event) =>
              setSettings({ ...settings, paused: event.target.checked })
            }
          />
          Pause monitoring
        </label>
        <button>Save options</button>
        {saved ? <span className="saved">Saved</span> : null}
      </form>
    </Shell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{styles}</style>
      <main>{children}</main>
    </>
  );
}

const styles = `
  body { margin: 0; color: #102033; background: #f4f7fb; font: 14px system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px; }
  h1 { margin: 0 0 18px; font-size: 22px; }
  form { display: grid; gap: 14px; border: 1px solid #d5dee9; border-radius: 8px; background: white; padding: 18px; }
  label { display: grid; gap: 6px; font-weight: 700; }
  label span { font-size: 13px; }
  input, textarea, select { min-height: 40px; border: 1px solid #d5dee9; border-radius: 6px; padding: 8px 10px; font: inherit; box-sizing: border-box; }
  textarea { min-height: 120px; }
  .check { display: flex; grid-template-columns: auto 1fr; align-items: center; gap: 8px; font-weight: 500; }
  button { min-height: 40px; border: 0; border-radius: 6px; background: #0f766e; color: white; font-weight: 700; cursor: pointer; }
  .saved { color: #0f766e; font-weight: 700; }
`;

createRoot(document.getElementById("root")!).render(<Options />);
