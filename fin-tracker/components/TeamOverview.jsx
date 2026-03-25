import React, { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { formatCurrency } from '../utils/currency';

export default function TeamOverview() {
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');
  const [order, setOrder] = useState('ASC');

  useEffect(() => {
    fetchTeamData();
  }, [sortBy, order]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const response = await dashboardAPI.getTeamOverview({ sortBy, order, limit: 100 });
      setTeamData(response.data);
    } catch (err) {
      console.error('Failed to fetch team data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setOrder('ASC');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="card">
        <p className="text-gray-500 text-center">No team data available</p>
      </div>
    );
  }

  const { users, totals } = teamData;

  return (
    <div className="space-y-6">
      {/* Team Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Members</h3>
          <p className="text-3xl font-bold text-gray-900">{totals.totalMembers}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Balance</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(totals.totalBalance)}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Daily Plan</h3>
          <p className="text-3xl font-bold text-blue-600">{totals.dailyPlanCount}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Weekly Plan</h3>
          <p className="text-3xl font-bold text-purple-600">{totals.weeklyPlanCount}</p>
        </div>
      </div>

      {/* Team Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Team Members</h2>
          <button 
            onClick={fetchTeamData}
            className="btn-secondary text-sm"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  Name {sortBy === 'name' && (order === 'ASC' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  User ID
                </th>
                <th 
                  onClick={() => handleSort('balance')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  Balance {sortBy === 'balance' && (order === 'ASC' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('plan_type')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                >
                  Plan {sortBy === 'plan_type' && (order === 'ASC' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Payments
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.uniqueUserId}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-green-600">
                    {formatCurrency(user.balance)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`badge ${
                      user.planType === 'daily' ? 'badge-info' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {user.planType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.targetAmount ? (
                      <div className="w-full">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>{user.progressPercentage?.toFixed(0)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-2">
                          <div 
                            className={`rounded-full h-2 ${
                              user.progressPercentage >= 100 ? 'bg-green-500' :
                              user.progressPercentage >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, user.progressPercentage)}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.paymentCount} verified
                    {user.pendingCount > 0 && (
                      <span className="ml-2 text-yellow-600">
                        ({user.pendingCount} pending)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
