import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, dashboardAPI } from '../services/api';
import { format } from 'date-fns';
import BankAccountCard from './BankAccountCard';
import ContributionCalendar from './ContributionCalendar';
import { formatCurrency } from '../utils/currency';

const statusBadge = (status) => {
  const map = {
    verified: { bg: '#064e3b', text: '#34d399', label: 'Verified' },
    pending:  { bg: '#451a03', text: '#fbbf24', label: 'Pending' },
    rejected: { bg: '#450a0a', text: '#f87171', label: 'Rejected' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>
      {s.label}
    </span>
  );
};

export default function Dashboard() {
  const { user }                      = useAuth();
  const [data, setData]               = useState(null);
  const [bankAccount, setBankAccount] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('overview');
  const [error, setError]             = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [dashRes, profileRes] = await Promise.all([
          dashboardAPI.getUserDashboard(),
          authAPI.getProfile(),
        ]);
        setData(dashRes.data);
        setBankAccount(profileRes.data.bankAccount);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ width: 48, height: 48, border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 24 }}>
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 20, color: '#fca5a5', fontFamily: 'monospace' }}>{error}</div>
    </div>
  );

  const { user: u, campaign, stats, recentPayments } = data;
  const campaignPct = Math.round((campaign.daysElapsed / campaign.totalDays) * 100);
  const balancePct  = u.targetAmount ? Math.min(100, (u.balance / u.targetAmount) * 100) : 0;
  const trackPct    = Math.min(100, stats.progressPercentage).toFixed(0);

  const card = (children, style = {}) => (
    <div style={{ background: 'rgba(15,20,35,0.9)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 22, ...style }}>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#070c1a', padding: '32px 16px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Hey, {u.name.split(' ')[0]} 👋
          </h1>
          <p style={{ margin: '4px 0 0', color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>
            User ID: {u.uniqueUserId} · {u.planType === 'daily' ? 'Daily' : 'Weekly'} plan
          </p>
        </div>

        {/* ── Campaign banner ── */}
        {card(
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                  ● Campaign Progress
                </div>
                <div style={{ color: '#f1f5f9', fontSize: 16 }}>
                  Day <strong style={{ fontSize: 22 }}>{campaign.daysElapsed}</strong> of <strong>{campaign.totalDays}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1 }}>
                  {campaign.daysRemaining}
                </div>
                <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>days left</div>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 100, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${campaignPct}%`, height: '100%', background: 'linear-gradient(90deg,#f59e0b,#d97706)', borderRadius: 100, transition: 'width 1s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'monospace', fontSize: 11, color: '#334155' }}>
              <span>{format(new Date(campaign.startDate), 'dd MMM yyyy')}</span>
              <span>{format(new Date(campaign.endDate), 'dd MMM yyyy')}</span>
            </div>
          </>,
          { background: 'linear-gradient(135deg, rgba(20,28,52,0.98) 0%, rgba(12,18,38,0.98) 100%)', border: '1px solid rgba(245,158,11,0.18)', marginBottom: 20 }
        )}

        {/* ── Stats grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
          {[
            {
              label: 'Current Balance',
              value: formatCurrency(u.balance),
              sub: u.targetAmount ? `Target: ${formatCurrency(u.targetAmount)}` : 'No target set',
              color: '#34d399', pct: balancePct,
            },
            {
              label: 'Verified Payments',
              value: stats.verifiedPayments,
              sub: `Total: ${formatCurrency(stats.totalVerified)}`,
              color: '#38bdf8', pct: null,
            },
            {
              label: 'Plan Track',
              value: `${trackPct}%`,
              sub: stats.progressPercentage >= 100 ? 'On track ✓' : `${formatCurrency(stats.expectedAmount - stats.totalVerified)} behind`,
              color: stats.progressPercentage >= 100 ? '#34d399' : stats.progressPercentage >= 75 ? '#fbbf24' : '#f87171',
              pct: Math.min(100, stats.progressPercentage),
            },
            {
              label: 'Pending',
              value: stats.pendingPayments,
              sub: 'Awaiting verification',
              color: '#fbbf24', pct: null,
            },
          ].map(s => card(
            <>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: s.color, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>{s.sub}</div>
              {s.pct !== null && (
                <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.07)', borderRadius: 100, height: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: 100 }} />
                </div>
              )}
            </>,
            { key: s.label }
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {[
            { id: 'overview',  label: '📊 Overview' },
            { id: 'calendar',  label: '📅 Calendar' },
            { id: 'bank',      label: '🏦 Bank Account' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: activeTab === t.id ? 'rgba(245,158,11,0.18)' : 'transparent',
              color: activeTab === t.id ? '#fbbf24' : '#475569',
              fontFamily: 'monospace', fontSize: 13, transition: 'all 0.2s',
              outline: activeTab === t.id ? '1px solid rgba(245,158,11,0.35)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {activeTab === 'overview' && (
          <div>
            {card(
              <>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                  Recent Payments
                </div>
                {recentPayments.length === 0
                  ? <p style={{ color: '#334155', fontFamily: 'monospace', textAlign: 'center', padding: '32px 0' }}>No payments yet</p>
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Date', 'Amount', 'Status'].map(h => (
                              <th key={h} style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 12px 12px 0' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {recentPayments.map(p => (
                            <tr key={p.payment_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '12px 12px 12px 0', fontFamily: 'monospace', fontSize: 13, color: '#94a3b8' }}>
                                {format(new Date(p.payment_date), 'dd MMM yyyy, HH:mm')}
                              </td>
                              <td style={{ padding: '12px 12px 12px 0', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                                {formatCurrency(p.amount)}
                              </td>
                              <td style={{ padding: '12px 0' }}>
                                {statusBadge(p.status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <ContributionCalendar />
        )}

        {activeTab === 'bank' && (
          <BankAccountCard bankAccount={bankAccount} />
        )}

      </div>
    </div>
  );
}
