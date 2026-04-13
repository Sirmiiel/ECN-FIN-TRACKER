import React, { useState, useEffect } from 'react';
import { paymentAPI, dashboardAPI, userAPI } from '../services/api';
import { format } from 'date-fns';
import { formatCurrency } from '../utils/currency';

export default function AdminPanel() {
  const [pendingPayments, setPendingPayments] = useState([]);
  const [planRequests, setPlanRequests] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(null);
  const [reviewingRequest, setReviewingRequest] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [paymentsRes, analyticsRes, requestsRes] = await Promise.all([
        paymentAPI.getPending(),
        dashboardAPI.getAdminAnalytics(),
        userAPI.getPlanChangeRequests(),
      ]);
      setPendingPayments(paymentsRes.data.payments);
      setAnalytics(analyticsRes.data);
      setPlanRequests((requestsRes.data.requests || []).filter((request) => request.status === 'pending'));
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (paymentId, status, notes = '') => {
    try {
      setVerifying(paymentId);
      await paymentAPI.verify(paymentId, status, notes);
      await fetchData();
      alert(`Payment ${status} successfully!`);
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${status} payment`);
    } finally {
      setVerifying(null);
    }
  };

  const handleReviewPlanRequest = async (requestId, status) => {
    try {
      setReviewingRequest(requestId);
      await userAPI.reviewPlanChange(requestId, status);
      await fetchData();
      alert(`Plan change request ${status}.`);
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${status} plan request`);
    } finally {
      setReviewingRequest(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>

      {/* Analytics Overview */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Payment Stats</h3>
            <div className="space-y-2">
              {analytics.paymentStats.map((stat) => (
                <div key={stat.status} className="flex justify-between text-sm">
                  <span className="capitalize">{stat.status}:</span>
                  <span className="font-semibold">{stat.count} ({formatCurrency(stat.totalAmount)})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Top Contributors</h3>
            <div className="space-y-2">
              {analytics.topContributors.slice(0, 5).map((user, idx) => (
                <div key={user.uniqueUserId} className="flex justify-between text-sm">
                  <span>{idx + 1}. {user.name}</span>
                  <span className="font-semibold text-green-600">{formatCurrency(user.balance)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Plan Distribution</h3>
            <div className="space-y-2">
              {analytics.planStats.map((plan) => (
                <div key={plan.planType} className="flex justify-between text-sm">
                  <span className="capitalize">{plan.planType}:</span>
                  <span className="font-semibold">{plan.memberCount} members</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attention Needed */}
      {analytics?.attentionNeeded.length > 0 && (
        <div className="card bg-yellow-50 border border-yellow-200">
          <h2 className="text-xl font-semibold text-yellow-900 mb-4">
            ⚠️ Attention Needed
          </h2>
          <p className="text-sm text-yellow-700 mb-3">
            The following users have payments pending for more than 24 hours:
          </p>
          <div className="space-y-2">
            {analytics.attentionNeeded.map((user) => (
              <div key={user.uniqueUserId} className="bg-white rounded p-3 flex justify-between items-center">
                <div>
                  <span className="font-medium">{user.name}</span>
                  <span className="text-sm text-gray-600 ml-2">({user.uniqueUserId})</span>
                </div>
                <span className="text-sm text-yellow-700">
                  {user.pendingCount} pending since {format(new Date(user.oldestPending), 'MMM dd')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Payments */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Pending Plan Requests ({planRequests.length})
          </h2>
        </div>

        {planRequests.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No pending plan requests</p>
        ) : (
          <div className="space-y-4">
            {planRequests.map((request) => (
              <div key={request.request_id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{request.user_name}</h3>
                      <span className="text-sm text-gray-600">({request.unique_user_id})</span>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Current Plan:</span>
                        <span className="ml-2 font-medium capitalize">{request.current_plan}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Requested Plan:</span>
                        <span className="ml-2 font-medium capitalize">{request.requested_plan}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-600">Reason:</span>
                        <span className="ml-2">{request.reason || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2 ml-4">
                    <button
                      onClick={() => handleReviewPlanRequest(request.request_id, 'approved')}
                      disabled={reviewingRequest === request.request_id}
                      className="btn-success text-sm"
                    >
                      {reviewingRequest === request.request_id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReviewPlanRequest(request.request_id, 'rejected')}
                      disabled={reviewingRequest === request.request_id}
                      className="btn-danger text-sm"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Pending Payments ({pendingPayments.length})
          </h2>
          <button onClick={fetchData} className="btn-secondary text-sm">
            Refresh
          </button>
        </div>

        {pendingPayments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No pending payments</p>
        ) : (
          <div className="space-y-4">
            {pendingPayments.map((payment) => (
              <div key={payment.payment_id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{payment.user_name}</h3>
                      <span className="text-sm text-gray-600">({payment.unique_user_id})</span>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Amount:</span>
                        <span className="ml-2 font-semibold text-lg text-gray-900">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Method:</span>
                        <span className="ml-2 font-medium">
                          {payment.payment_method || 'Not specified'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Submitted:</span>
                        <span className="ml-2">
                          {format(new Date(payment.payment_date), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2 ml-4">
                    <button
                      onClick={() => handleVerify(payment.payment_id, 'verified')}
                      disabled={verifying === payment.payment_id}
                      className="btn-success text-sm"
                    >
                      {verifying === payment.payment_id ? 'Processing...' : 'Verify'}
                    </button>
                    <button
                      onClick={() => {
                        const notes = prompt('Rejection reason (optional):');
                        if (notes !== null) {
                          handleVerify(payment.payment_id, 'rejected', notes);
                        }
                      }}
                      disabled={verifying === payment.payment_id}
                      className="btn-danger text-sm"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
