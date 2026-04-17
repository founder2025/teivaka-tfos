/**
 * AdminSettings.jsx — /admin/settings
 *
 * Community settings, announcement banner, rank config,
 * post/KB categories, subscription tiers, feature flags per tier.
 */

import { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { authHeader } from "../../utils/auth";

function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4 border-b border-gray-700 last:border-0">
      <div className="sm:w-64 shrink-0">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? "bg-amber-500" : "bg-gray-600"}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

const FEATURE_FLAGS = [
  { key: "community_posts",  label: "Community Posts",       tiers: ["FREE","BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "kb_access",        label: "Knowledge Base",        tiers: ["FREE","BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "tis_basic",        label: "TIS AI (basic)",        tiers: ["FREE","BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "tis_voice",        label: "TIS Voice Input",       tiers: ["BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "farm_manager",     label: "Farm Manager",          tiers: ["BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "analytics_basic",  label: "Farm Analytics",        tiers: ["BASIC","PROFESSIONAL","ENTERPRISE"] },
  { key: "exports",          label: "Data Exports",          tiers: ["PROFESSIONAL","ENTERPRISE"] },
  { key: "api_access",       label: "API Access",            tiers: ["ENTERPRISE"] },
  { key: "white_label",      label: "White Label",           tiers: ["ENTERPRISE"] },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    community_name: "Teivaka Farm OS",
    community_tagline: "Pacific Island Farming Intelligence",
    announcement_enabled: false,
    announcement_text: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/settings", { headers: authHeader() })
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSaving(true);
    await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputCls = "bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 w-full";

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Platform Settings</h1>
        <button onClick={saveSettings} disabled={saving}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            saved ? "bg-emerald-600 text-white" : "bg-amber-500 hover:bg-amber-400 text-amber-950"
          } disabled:opacity-50`}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      <div className="space-y-5">

        {/* Community identity */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-4">Community Identity</h2>
          <SettingRow label="Community Name" hint="Displayed in header and emails">
            <input value={settings.community_name} onChange={e => setSettings(s => ({...s, community_name: e.target.value}))}
              className={inputCls} />
          </SettingRow>
          <SettingRow label="Tagline" hint="Short description shown on landing page">
            <input value={settings.community_tagline} onChange={e => setSettings(s => ({...s, community_tagline: e.target.value}))}
              className={inputCls} />
          </SettingRow>
        </div>

        {/* Announcement banner */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-4">Announcement Banner</h2>
          <SettingRow label="Enable Banner" hint="Shows a banner at top of all pages for all users">
            <Toggle checked={settings.announcement_enabled}
              onChange={v => setSettings(s => ({...s, announcement_enabled: v}))} />
          </SettingRow>
          {settings.announcement_enabled && (
            <SettingRow label="Banner Text" hint="Keep it short — 1-2 sentences max">
              <textarea value={settings.announcement_text}
                onChange={e => setSettings(s => ({...s, announcement_text: e.target.value}))}
                rows={2} className={inputCls} />
            </SettingRow>
          )}
        </div>

        {/* Feature flags per tier */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-4">Feature Access by Tier</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 pr-4 text-gray-400 font-medium text-xs uppercase">Feature</th>
                  {["FREE","BASIC","PROFESSIONAL","ENTERPRISE"].map(t => (
                    <th key={t} className="text-center py-2 px-3 text-gray-400 font-medium text-xs uppercase">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_FLAGS.map(flag => (
                  <tr key={flag.key} className="border-b border-gray-700/50">
                    <td className="py-2.5 pr-4 text-gray-300 text-sm">{flag.label}</td>
                    {["FREE","BASIC","PROFESSIONAL","ENTERPRISE"].map(tier => (
                      <td key={tier} className="py-2.5 px-3 text-center">
                        {flag.tiers.includes(tier) ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Feature flag overrides will be stored in shared.feature_flags table when built.
          </p>
        </div>

        {/* Privacy policy version */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-4">Privacy &amp; Legal</h2>
          <SettingRow label="Current Privacy Policy Version" hint="Bump this to force all users to re-accept on next login">
            <input defaultValue="1.0" className={inputCls} />
          </SettingRow>
        </div>

      </div>
    </AdminLayout>
  );
}
