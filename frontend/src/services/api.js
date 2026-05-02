import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

let unauthorizedHandler = null;
let handlingUnauthorized = false;

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      if (!handlingUnauthorized) {
        handlingUnauthorized = true;
        try {
          if (typeof unauthorizedHandler === 'function') unauthorizedHandler();
        } finally {
          setTimeout(() => { handlingUnauthorized = false; }, 0);
        }
      }
    }
    return Promise.reject(error);
  }
);

// Error handler helper
export const formatApiError = (error) => {
  const detail = error?.response?.data?.detail;
  if (detail == null) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(e => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).filter(Boolean).join(' ');
  }
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
};

// Auth APIs
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Users APIs
export const usersAPI = {
  getAll: () => api.get('/users'),
  getSalesReps: () => api.get('/users/sales-reps'),
  getRecruiters: () => api.get('/users/recruiters'),
};

// Leads APIs
export const leadsAPI = {
  getAll: (params) => api.get('/leads', { params }),
  getOne: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  import: (fileOrForm) => {
    const formData = fileOrForm instanceof FormData
      ? fileOrForm
      : (() => {
          const fd = new FormData();
          fd.append('file', fileOrForm);
          return fd;
        })();
    return api.post('/leads/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

// Activities APIs
export const activitiesAPI = {
  getAll: (params) => api.get('/activities', { params }),
  create: (data) => api.post('/activities', data),
};

// Tasks APIs
export const tasksAPI = {
  getAll: (params) => api.get('/tasks', { params }),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
};

// Reminders APIs
export const remindersAPI = {
  getAll: (params) => api.get('/reminders', { params }),
  create: (data) => api.post('/reminders', data),
  delete: (id) => api.delete(`/reminders/${id}`),
  sendEmail: (id) => api.post(`/reminders/${id}/send-email`),
};

// Jobs APIs
export const jobsAPI = {
  getAll: (params) => api.get('/jobs', { params }),
  getOne: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  delete: (id) => api.delete(`/jobs/${id}`),
};

// Candidates APIs
export const candidatesAPI = {
  getAll: (params) => api.get('/candidates', { params }),
  getOne: (id) => api.get(`/candidates/${id}`),
  create: (data) => api.post('/candidates', data),
  update: (id, data) => api.put(`/candidates/${id}`, data),
  delete: (id) => api.delete(`/candidates/${id}`),
  getPipeline: (params) => api.get('/candidates/pipeline', { params }),

  // Resume — upload file to Google Drive via backend
  uploadResume: (candidateId, file, onProgress) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/candidates/${candidateId}/resume`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(Math.round((e.loaded * 100) / e.total))
        : undefined,
    });
  },

  // Resume — delete from Google Drive + clear in Supabase
  deleteResume: (candidateId) => api.delete(`/candidates/${candidateId}/resume`),

  // ATS Match — score candidates against a job description
  atsMatch: (jd_text, candidate_type = 'domestic') =>
    api.post('/candidates/ats-match', { jd_text, candidate_type }),
};

// Interviews APIs
export const interviewsAPI = {
  getAll: (params) => api.get('/interviews', { params }),
  create: (data) => api.post('/interviews', data),
  update: (id, data) => api.put(`/interviews/${id}`, data),
};

// Dashboard APIs
export const dashboardAPI = {
  getSales: () => api.get('/dashboard/sales'),
  getRecruitment: () => api.get('/dashboard/recruitment'),
};

// Imports APIs
export const importsAPI = {
  getAll: () => api.get('/imports'),
};

export default api;

// Candidate Submissions APIs
export const submissionsAPI = {
  getAll:  (params) => api.get('/submissions', { params }),
  create:  (data)   => api.post('/submissions', data),
  update:  (id,data)=> api.put(`/submissions/${id}`, data),
  delete:  (id)     => api.delete(`/submissions/${id}`),
};

// CEO Dashboard API
export const ceoDashboardAPI = {
  get: () => api.get('/dashboard/ceo'),
};

// Audit Logs API
export const auditLogsAPI = {
  getAll: (params) => api.get('/audit-logs', { params }),
};

// Expenses API
export const expensesAPI = {
  getSummary: (year) => api.get('/expenses/summary', { params: year ? { year } : {} }),
  getAll: (params) => api.get('/expenses', { params }),
  create: (formData) => api.post('/expenses', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// Timesheet APIs
export const timesheetAPI = {
  getCurrent:    ()                   => api.get('/timesheets/me/current'),
  getWeek:       (week_start)         => api.get('/timesheets/me/week', { params: { week_start } }),
  getMyAll:      ()                   => api.get('/timesheets/me'),
  saveEntries:   (id, entries)        => api.put(`/timesheets/${id}/entries`, { entries }),
  submit:        (id)                 => api.post(`/timesheets/${id}/submit`),
  getAll:        (params)             => api.get('/timesheets/all', { params }),
  getDetail:     (id)                 => api.get(`/timesheets/${id}`),
  review:        (id, action, note)   => api.post(`/timesheets/${id}/review`, { action, note }),
  yearlySummary: (year)               => api.get('/timesheet/yearly-summary', { params: { year } }),
};
