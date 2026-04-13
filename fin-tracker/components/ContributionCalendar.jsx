import React, { useState, useEffect } from 'react';
import { paymentAPI } from '../services/api';
import { formatCurrency } from '../utils/currency';

// Status config
const STATUS = {
  paid:     { bg: 'rgba(52,211,153,0.25)',  border: 'rgba(52,211,153,0.6)',  text: '#34d399', symbol: '✓', label: 'Paid'     },
  partial:  { bg: 'rgba(245,158,11,0.2)',   border: 'rgba(245,158,11,0.55)', text: '#fbbf24', symbol: '◑', label: 'Partial'  },
  missed:   { bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.45)',  text: '#f87171', symbol: '✗', label: 'Missed'   },
  current:  { bg: 'rgba(99,102,241,0.25)',  border: 'rgba(99,102,241,0.7)',  text: '#a5b4fc', symbol: '►', label: 'Today'    },
  upcoming: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#475569', symbol: '·', label: 'Upcoming' },
};

function CalendarCell({ slot, onClick }) {
  const s = STATUS[slot.status] || STATUS.upcoming;
  const isCurrent = slot.status === 'current';

  return (
    <button
      onClick={() => onClick(slot)}
      title={`Day ${slot.periodNumber} · ${slot.date}\n${formatCurrency(slot.paidAmount)} / ${formatCurrency(slot.required)}`}
      style={{
        width: '100%', aspectRatio: '1', border: `1px solid ${s.border}`,
        borderRadius: 6, background: s.bg, color: s.text,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, fontFamily: 'monospace', transition: 'all 0.15s',
        boxShadow: isCurrent ? `0 0 12px ${s.border}` : 'none',
        outline: isCurrent ? `1px solid ${s.border}` : 'none',
        outlineOffset: 2,
      }}
    >
      <span style={{ fontSize: 'clamp(8px,1.5vw,13px)', lineHeight: 1 }}>{s.symbol}</span>
      <span style={{ fontSize: 'clamp(7px,1vw,10px)', opacity: 0.75, marginTop: 2 }}>{slot.periodNumber}</span>
    </button>
  );
}

function TooltipPanel({ slot, onClose }) {
  if (!slot) return null;
  const s = STATUS[slot.status] || STATUS.upcoming;
  const percent = slot.required > 0 ? Math.min(100, (slot.paidAmount / slot.required) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      background: 'rgba(8,13,26,0.98)', border: `1px solid ${s.border}`,
      borderRadius: 14, padding: '20px 24px', width: 260,
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      animation: 'fadeInUp 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ color: s.text, fontFamily: 'monospace', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {s.symbol} Day {slot.periodNumber}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>{slot.date}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: 'monospace', fontSize: 13 }}>
        <span style={{ color: '#64748b' }}>Paid</span>
        <span style={{ color: '#f1f5f9' }}>{formatCurrency(slot.paidAmount)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontFamily: 'monospace', fontSize: 13 }}>
        <span style={{ color: '#64748b' }}>Required</span>
        <span style={{ color: '#f1f5f9' }}>{formatCurrency(slot.required)}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: s.border, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: '#475569', marginTop: 6 }}>{percent.toFixed(0)}% paid</div>
    </div>
  );
}

export default function ContributionCalendar({ userId }) {
  const [calendar, setCalendar]   = useState([]);
  const [planType, setPlanType]   = useState('daily');
  const [rate, setRate]           = useState(0);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await paymentAPI.getCalendar(userId);
        setCalendar(res.data.calendar);
        setPlanType(res.data.planType);
        setRate(res.data.ratePerPeriod);
      } catch (e) {
        console.error('Calendar fetch failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const counts = calendar.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
  const displayed = filter === 'all' ? calendar : calendar.filter(s => s.status === filter);
  const paidTotal = calendar.filter(s => s.status === 'paid').length;
  const missedTotal = calendar.filter(s => s.status === 'missed').length;

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ background: 'rgba(10,15,28,0.9)', borderRadius: 16, padding: 28, border: '1px solid rgba(255,255,255,0.07)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: 20, fontWeight: 700 }}>
            Contribution Calendar
          </h2>
          <p style={{ margin: '4px 0 0', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>
            {planType === 'daily' ? 'Daily' : 'Weekly'} plan · {formatCurrency(rate)} per {planType === 'weekly' ? 'week' : 'day'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', 'paid', 'missed', 'upcoming', 'current'].map(f => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                background: active ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: active ? '#fbbf24' : '#475569', fontFamily: 'monospace', fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
              }}>{f}{counts[f] ? ` (${counts[f]})` : ''}</button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: v.bg, border: `1px solid ${v.border}` }} />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{v.symbol} {v.label}</span>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Paid', value: paidTotal, color: '#34d399' },
          { label: 'Missed', value: missedTotal, color: '#f87171' },
          { label: 'Completion', value: `${Math.round((paidTotal / Math.max(calendar.length,1)) * 100)}%`, color: '#a5b4fc' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(32px,1fr))', gap: 4 }}>
        {displayed.map(slot => (
          <CalendarCell key={slot.periodNumber} slot={slot} onClick={setSelected} />
        ))}
      </div>

      <TooltipPanel slot={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
