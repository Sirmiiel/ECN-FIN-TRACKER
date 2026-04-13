import React, { useState, useEffect, useCallback, useRef } from 'react';
import { paymentAPI } from '../services/api';
import { formatCurrency } from '../utils/currency';

const PAYMENT_METHODS = [
  { value: '', label: 'Select method' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash' },
  { value: 'mobile_money',  label: 'Mobile Money' },
  { value: 'check',         label: 'Check / Cheque' },
  { value: 'other',         label: 'Other' },
];

function SlotChip({ slot, index }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), index * 55);
    return () => clearTimeout(t);
  }, [index]);

  const cfg = {
    past:    { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.5)', text: '#fbbf24', icon: '↩' },
    current: { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.5)', text: '#34d399', icon: '★' },
    future:  { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.5)', text: '#38bdf8', icon: '→' },
  }[slot.slotType] || {};

  return (
    <div
      style={{
        background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6,
        padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'monospace', fontSize: 12, color: cfg.text,
        transform: show ? 'scale(1)' : 'scale(0.7)', opacity: show ? 1 : 0,
        transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      <span>{slot.date}</span>
      {slot.fullyCovered && <span style={{ color: '#4ade80', fontSize: 10 }}>✓</span>}
    </div>
  );
}

function AllocationPreview({ preview }) {
  const { slots = [], summary, missedPeriodsCovered, futurePeriodsCovered,
          currentPeriodCovered, remainderUnallocated, ratePerPeriod, planType } = preview;

  const missed  = slots.filter(s => s.slotType === 'past');
  const today   = slots.filter(s => s.slotType === 'current');
  const future  = slots.filter(s => s.slotType === 'future');

  return (
    <div style={{
      background: 'rgba(8,13,26,0.97)', border: '1px solid rgba(245,158,11,0.2)',
      borderRadius: 14, padding: '22px 24px', marginTop: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 10px #f59e0b', display: 'block' }} />
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#f59e0b', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Auto-Allocation Preview
        </span>
      </div>

      {/* Summary */}
      <div style={{ background: 'rgba(245,158,11,0.07)', borderLeft: '3px solid #f59e0b', borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: 18 }}>
        <p style={{ margin: 0, color: '#e2e8f0', fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.65 }}>{summary}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Missed Days', value: missedPeriodsCovered, color: '#fbbf24' },
          { label: 'Today', value: currentPeriodCovered ? '✓' : '—', color: '#34d399' },
          { label: 'Future Days', value: futurePeriodsCovered, color: '#38bdf8' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Slot groups */}
      {missed.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'monospace', fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ↩ Catching Up — {missed.length} missed {planType === 'weekly' ? 'weeks' : 'days'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {missed.map((slot, i) => <SlotChip key={slot.date} slot={slot} index={i} />)}
          </div>
        </div>
      )}
      {today.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'monospace', fontSize: 11, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ★ Today's Contribution
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {today.map((slot, i) => <SlotChip key={slot.date} slot={slot} index={i} />)}
          </div>
        </div>
      )}
      {future.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'monospace', fontSize: 11, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            → Pre-Paying Ahead — {future.length} future {planType === 'weekly' ? 'weeks' : 'days'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {future.map((slot, i) => <SlotChip key={slot.date} slot={slot} index={i + missed.length + today.length} />)}
          </div>
        </div>
      )}

      {remainderUnallocated > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px' }}>
          <span style={{ color: '#fca5a5', fontFamily: 'monospace', fontSize: 12 }}>
            ⚠ {formatCurrency(remainderUnallocated)} exceeds remaining campaign periods — held as balance surplus.
          </span>
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
        <span>Rate: {formatCurrency(ratePerPeriod)}</span>
        <span>Fully covered: {slots.filter(s => s.fullyCovered).length} period(s)</span>
      </div>
    </div>
  );
}

export default function SubmitPayment({ onSuccess }) {
  const [amount, setAmount]       = useState('');
  const [method, setMethod]       = useState('');
  const [preview, setPreview]     = useState(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const timer                     = useRef(null);

  const fetchPreview = useCallback(async (val) => {
    const n = parseFloat(val);
    if (!n || n <= 0) { setPreview(null); return; }
    setPrevLoading(true);
    try {
      const res = await paymentAPI.getPreview(n);
      setPreview(res.data.preview);
    } catch { setPreview(null); }
    finally   { setPrevLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    setPreview(null);
    setConfirmed(false);
    if (amount) timer.current = setTimeout(() => fetchPreview(amount), 650);
    return () => clearTimeout(timer.current);
  }, [amount]);

  const handleSubmit = async () => {
    if (!confirmed) { setError('Confirm the allocation before submitting.'); return; }
    setError(''); setSuccess(''); setSubmitting(true);
    try {
      const key = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await paymentAPI.submit(parseFloat(amount), method, key);
      setSuccess('✓ Payment submitted and queued for verification.');
      setAmount(''); setMethod(''); setPreview(null); setConfirmed(false);
      if (onSuccess) setTimeout(onSuccess, 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed.');
    } finally { setSubmitting(false); }
  };

  const inp = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '14px 18px', color: '#f1f5f9', fontSize: 15,
    fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#070c1a', padding: '40px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 660 }}>
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>
            Submit Payment
          </h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>
            Any amount is automatically distributed across missed & upcoming contribution days
          </p>
        </div>

        <div style={{ background: 'rgba(15,20,35,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28 }}>
          {/* Alerts */}
          {error && <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 16px', color: '#fca5a5', fontFamily: 'monospace', fontSize: 13, marginBottom: 18 }}>⚠ {error}</div>}
          {success && <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 10, padding: '12px 16px', color: '#6ee7b7', fontFamily: 'monospace', fontSize: 13, marginBottom: 18 }}>{success}</div>}

          {/* Amount */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: '#64748b', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Amount (NGN)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 16, fontFamily: 'monospace' }}>₦</span>
              <input
                type="number" step="0.01" min="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{ ...inp, paddingLeft: 32 }}
                placeholder="Enter amount…"
              />
              {prevLoading && (
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#f59e0b', fontSize: 11, fontFamily: 'monospace', animation: 'pulse 1s infinite' }}>
                  Calculating...
                </span>
              )}
            </div>
          </div>

          {/* Method */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: '#64748b', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Payment Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value} style={{ background: '#0d1526' }}>{m.label}</option>)}
            </select>
          </div>

          {/* Preview */}
          {preview && <AllocationPreview preview={preview} />}

          {/* Confirm toggle */}
          {preview && (
            <div
              onClick={() => setConfirmed(c => !c)}
              style={{ cursor: 'pointer', marginTop: 18, background: 'rgba(245,158,11,0.05)', border: `1px solid ${confirmed ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s' }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${confirmed ? '#f59e0b' : '#334155'}`, background: confirmed ? '#f59e0b' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                {confirmed && <span style={{ color: '#000', fontSize: 13, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
                I confirm this allocation for <strong style={{ color: '#f1f5f9' }}>{formatCurrency(amount || 0)}</strong>
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount}
            style={{
              width: '100%', marginTop: 20, padding: '16px', borderRadius: 12, border: 'none',
              background: (!amount || submitting) ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg,#f59e0b,#d97706)',
              color: (!amount || submitting) ? '#475569' : '#000',
              fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: (!amount || submitting) ? 'not-allowed' : 'pointer',
              boxShadow: (!amount || submitting) ? 'none' : '0 4px 20px rgba(245,158,11,0.3)',
              transition: 'all 0.2s',
            }}
          >
            {submitting ? '⟳ Processing…' : '↑ Submit Payment'}
          </button>

          <p style={{ textAlign: 'center', color: '#334155', fontSize: 11, fontFamily: 'monospace', marginTop: 14 }}>
            Held as pending until admin verifies · Your linked bank account is updated automatically
          </p>
        </div>
      </div>
    </div>
  );
}
