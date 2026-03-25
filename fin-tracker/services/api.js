import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (uniqueUserId, pin) => 
    api.post('/auth/login', { uniqueUserId, pin }),
  
  register: (userData) => 
    api.post('/auth/register', userData),
  
  getProfile: () => 
    api.get('/auth/profile'),
  
  changePin: (currentPin, newPin) => 
    api.put('/auth/change-pin', { currentPin, newPin }),
};

// Payment APIs
export const paymentAPI = {
  submit: (amount, paymentMethod, idempotencyKey) => 
    api.post('/payments/submit', { amount, paymentMethod, idempotencyKey }),
  
  // Preview how a deposit amount will be allocated across days BEFORE submitting
  getPreview: (amount) =>
    api.get('/payments/preview', { params: { amount } }),

  // Full contribution calendar: which days are paid, missed, upcoming
  getCalendar: (userId) =>
    api.get('/payments/calendar', { params: userId ? { userId } : {} }),
  
  getHistory: (status, limit = 50, offset = 0) => 
    api.get('/payments/history', { params: { status, limit, offset } }),
  
  getPending: () => 
    api.get('/payments/pending'),
  
  verify: (paymentId, status, notes) => 
    api.put(`/payments/${paymentId}/verify`, { status, notes }),
  
  getDetails: (paymentId) => 
    api.get(`/payments/${paymentId}`),
};

// User APIs
export const userAPI = {
  getAll: (params) => 
    api.get('/users', { params }),
  
  getById: (userId) => 
    api.get(`/users/${userId}`),
  
  update: (userId, data) => 
    api.put(`/users/${userId}`, data),
  
  requestPlanChange: (userId, requestedPlan, reason) => 
    api.post(`/users/${userId}/plan-change-request`, { requestedPlan, reason }),
  
  getPlanChangeRequests: () => 
    api.get('/users/plan-change-requests/list'),
  
  reviewPlanChange: (requestId, status) => 
    api.put(`/users/plan-change-requests/${requestId}`, { status }),
};

// Dashboard APIs
export const dashboardAPI = {
  getUserDashboard: () => 
    api.get('/dashboard/user'),
  
  getTeamOverview: (params) => 
    api.get('/dashboard/team', { params }),
  
  getAdminAnalytics: () => 
    api.get('/dashboard/admin'),
};

export default api;
