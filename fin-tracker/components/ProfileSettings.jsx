import React, { useEffect, useState } from 'react';
import { authAPI, userAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function ProfileSettings() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [requestedPlan, setRequestedPlan] = useState('');
  const [reason, setReason] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileRes, requestsRes] = await Promise.all([
        authAPI.getProfile(),
        userAPI.getPlanChangeRequests(),
      ]);

      const profileData = profileRes.data.user;
      setProfile(profileData);
      setName(profileData.name || '');
      setTargetAmount(profileData.targetAmount ?? '');
      setRequestedPlan(profileData.planType === 'daily' ? 'weekly' : 'daily');
      setRequests(requestsRes.data.requests || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProfileUpdate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSavingProfile(true);

    try {
      const payload = {
        name,
        targetAmount: targetAmount === '' ? null : targetAmount,
      };
      const res = await userAPI.update(user.id, payload);
      const updated = res.data.user;
      updateUser({ name: updated.name });
      setMessage('Profile updated successfully.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePinChange = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setChangingPin(true);

    try {
      await authAPI.changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setMessage('PIN changed successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change PIN');
    } finally {
      setChangingPin(false);
    }
  };

  const handlePlanRequest = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmittingRequest(true);

    try {
      await userAPI.requestPlanChange(user.id, requestedPlan, reason);
      setReason('');
      setMessage('Plan change request submitted.');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to request plan change');
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Profile & Settings</h1>

      {error && <div className="card border border-red-300 text-red-700">{error}</div>}
      {message && <div className="card border border-green-300 text-green-700">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Update Profile</h2>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Amount (NGN)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
            <button className="btn-primary" disabled={savingProfile} type="submit">
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Change PIN</h2>
          <form onSubmit={handlePinChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current PIN</label>
              <input
                className="input"
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                required
                minLength="4"
                maxLength="8"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New PIN</label>
              <input
                className="input"
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                required
                minLength="4"
                maxLength="8"
              />
            </div>
            <button className="btn-primary" disabled={changingPin} type="submit">
              {changingPin ? 'Updating...' : 'Change PIN'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Plan Change Request</h2>
        <p className="text-sm text-gray-600 mb-4">
          Current Plan: <span className="font-semibold">{profile?.planType}</span>
        </p>
        <form onSubmit={handlePlanRequest} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Requested Plan</label>
            <select
              className="input"
              value={requestedPlan}
              onChange={(e) => setRequestedPlan(e.target.value)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
            <input
              className="input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you want to switch plans?"
            />
          </div>
          <div>
            <button className="btn-primary" disabled={submittingRequest} type="submit">
              {submittingRequest ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Request History</h3>
          {requests.length === 0 ? (
            <p className="text-gray-500">No plan change requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr key={request.request_id}>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{request.current_plan}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{request.requested_plan}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`badge ${
                          request.status === 'approved'
                            ? 'badge-success'
                            : request.status === 'rejected'
                              ? 'badge-danger'
                              : 'badge-warning'
                        }`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {new Date(request.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}