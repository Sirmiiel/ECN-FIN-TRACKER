import React, { useState } from 'react';

export default function BankAccountCard({ bankAccount }) {
  const [revealed, setRevealed] = useState(false);
  if (!bankAccount) return null;

  const { accountNumber, iban, sortCode, currency, status, openedAt } = bankAccount;

  const statusColor = {
    active:    { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)', text: '#34d399' },
    pending:   { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
    suspended: { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  text: '#f87171' },
    closed:    { bg: 'rgba(100,116,139,0.15)',border: 'rgba(100,116,139,0.4)',text: '#94a3b8' },
  }[status] || { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' };

  const mask = (str) => str ? `${'·'.repeat(str.length - 4)}${str.slice(-4)}` : '—';
  const fmt  = (str) => str || '—';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(12,18,35,0.97) 0%, rgba(18,26,48,0.97) 100%)',
      border: '1px solid rgba(245,158,11,0.2)', borderRadius: 16, padding: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative circuit lines */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 20px,rgba(245,158,11,1) 20px,rgba(245,158,11,1) 21px),repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(245,158,11,1) 20px,rgba(245,158,11,1) 21px)', pointerEvents: 'none' }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            🏦
          </div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Linked Bank Account</div>
            <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: 11, marginTop: 2 }}>Auto-created on registration</div>
          </div>
        </div>
        <div style={{ background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 20, padding: '4px 12px' }}>
          <span style={{ color: statusColor.text, fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ● {status || 'pending'}
          </span>
        </div>
      </div>

      {/* Account details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Account Number', value: revealed ? fmt(accountNumber) : mask(accountNumber) },
          { label: 'Currency', value: currency || 'USD' },
          { label: 'IBAN', value: revealed ? fmt(iban) : (iban ? `${iban.slice(0,4)}···${iban.slice(-6)}` : '—') },
          { label: 'Sort Code', value: revealed ? fmt(sortCode) : (sortCode ? '··-··-··' : '—') },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 12px', letterSpacing: '0.08em' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Opened date */}
      {openedAt && (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155', marginBottom: 16 }}>
          Opened: {new Date(openedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      )}

      {/* Reveal toggle */}
      <button
        onClick={() => setRevealed(r => !r)}
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '8px 16px', color: '#64748b', fontFamily: 'monospace',
          fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          transition: 'all 0.2s',
        }}
      >
        <span>{revealed ? '🙈' : '👁️'}</span>
        {revealed ? 'Hide account details' : 'Reveal account details'}
      </button>

      {/* Info note */}
      {status === 'pending' && (
        <div style={{ marginTop: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#92400e' }}>
          ⏳ Bank account provisioning is in progress. This typically takes a few minutes.
        </div>
      )}
    </div>
  );
}
