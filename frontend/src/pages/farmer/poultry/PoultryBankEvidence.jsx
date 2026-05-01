/**
 * PoultryBankEvidence — Phase 6.10-1.
 *
 * Month picker → POST-style download of /api/v1/poultry/bank-evidence?period=YYYY-MM.
 * Returns a binary PDF; we surface the audit hash from the response header on success.
 * No QueryClientProvider — single fetch, no caching.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const C = {
  soil: '#5C4033', cream: '#F8F3E9', green: '#6AA84F', amber: '#BF9000',
  red: '#A32D2D', border: '#E6DED0', muted: '#8A8678',
};

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PoultryBankEvidence() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(thisMonth());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastDownload, setLastDownload] = useState(null);

  const generatePDF = async () => {
    setError(null);
    setGenerating(true);
    try {
      const token = localStorage.getItem('tfos_access_token');
      const res = await fetch(`/api/v1/poultry/bank-evidence?period=${encodeURIComponent(period)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = `Could not generate PDF (HTTP ${res.status}).`;
        try {
          const errText = await res.text();
          const parsed = JSON.parse(errText);
          if (parsed?.detail?.error?.message) msg = parsed.detail.error.message;
          else if (parsed?.error?.message) msg = parsed.error.message;
          else if (parsed?.message) msg = parsed.message;
        } catch (_) { /* leave default */ }
        throw new Error(msg);
      }
      const auditHash = res.headers.get('X-Audit-Hash') || '';
      const anchorHash = res.headers.get('X-Anchor-Hash') || '';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `bank-evidence-${period}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastDownload({
        period,
        hash: auditHash,
        anchorHash,
        ts: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: `Bank evidence ready · ${auditHash}`, type: 'success' },
      }));
    } catch (e) {
      const msg = e?.message || 'Could not generate PDF.';
      setError(msg);
      window.dispatchEvent(new CustomEvent('tfos:toast', {
        detail: { message: msg, type: 'error' },
      }));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b"
           style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate('/farm/poultry')} className="text-sm" style={{ color: C.muted }}>
          ← Back
        </button>
        <h1 className="text-base font-semibold">Bank evidence</h1>
        <div className="w-12" />
      </div>

      <div className="px-4 py-4 max-w-md mx-auto space-y-4">
        <div className="px-3 py-3 rounded-md border text-sm" style={{ background: '#fff', borderColor: C.border }}>
          Generate a verifiable monthly PDF of your poultry activity. Each export is anchored to your tenant audit chain — banks and buyers can verify the document hasn't been altered.
        </div>

        <div className="px-3 py-3 rounded-md border" style={{ background: '#fff', borderColor: C.border }}>
          <label className="block text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            Period
          </label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={generating}
            className="w-full px-3 py-2 rounded-md border text-sm"
            style={{ borderColor: C.border, color: C.soil, background: C.cream }}
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-md text-sm border"
               style={{ background: '#FDECEA', color: C.red, borderColor: C.red }}>
            {error}
          </div>
        )}

        <button
          onClick={generatePDF}
          disabled={generating || !period}
          className="w-full px-3 py-3 rounded-md text-sm font-semibold"
          style={{
            background: generating ? C.muted : C.green,
            color: '#fff',
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? 'Generating…' : 'Generate PDF'}
        </button>

        {lastDownload && (
          <div className="px-3 py-3 rounded-md border space-y-1" style={{ background: '#fff', borderColor: C.border }}>
            <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Last generated</div>
            <div className="text-sm font-medium">{lastDownload.period}</div>
            <div className="text-xs" style={{ color: C.muted }}>
              Hash: <span style={{ color: C.soil, fontFamily: 'monospace' }}>{lastDownload.hash}</span>
            </div>
            <div className="text-xs" style={{ color: C.muted }}>
              {new Date(lastDownload.ts).toLocaleString()}
            </div>
          </div>
        )}

        <div className="px-3 py-3 rounded-md border text-xs space-y-1"
             style={{ background: '#fff', borderColor: C.border, color: C.muted }}>
          <div className="font-semibold" style={{ color: C.soil }}>What's in the PDF</div>
          <div>· Period summary (8 KPIs: flocks, birds, eggs, mortality, revenue, feed cost)</div>
          <div>· Active flock list with placement + current counts</div>
          <div>· Activity log (up to 30 events)</div>
          <div>· Audit chain anchor + verify URL (self-referential proof)</div>
        </div>
      </div>
    </div>
  );
}
