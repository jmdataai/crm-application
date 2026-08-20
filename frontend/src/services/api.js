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
  getAllBatched: async (params = {}, batchSize = 1000) => {
    const allLeads = [];
    let skip = Number(params.skip) || 0;
    const requestedLimit = params.limit == null ? Infinity : Math.max(Number(params.limit) || 0, 0);
    let total = null;

    while (allLeads.length < requestedLimit) {
      const nextLimit = requestedLimit === Infinity
        ? batchSize
        : Math.min(batchSize, requestedLimit - allLeads.length);
      const res = await api.get('/leads', {
        params: { ...params, skip, limit: nextLimit }
      });
      const leads = Array.isArray(res.data?.leads) ? res.data.leads : [];
      total = Number.isFinite(res.data?.total) ? res.data.total : total;
      allLeads.push(...leads);

      if (!leads.length) break;
      skip += leads.length;
      if (total != null && allLeads.length >= total) break;
      if (leads.length < nextLimit) break;
    }

    return { data: { ...(typeof total === 'number' ? { total } : {}), leads: allLeads } };
  },
  getOne: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  getEmailDates: () => api.get('/leads/email-dates'),
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
  // Fetch large candidate lists in batches — Supabase caps every response at
  // 1000 rows, so a single limit=5000 request would silently return only 1000.
  getAllBatched: async (params = {}, batchSize = 1000) => {
    const allCandidates = [];
    let skip = Number(params.skip) || 0;
    const requestedLimit = params.limit == null ? Infinity : Math.max(Number(params.limit) || 0, 0);
    let total = null;

    while (allCandidates.length < requestedLimit) {
      const nextLimit = requestedLimit === Infinity
        ? batchSize
        : Math.min(batchSize, requestedLimit - allCandidates.length);
      const res = await api.get('/candidates', {
        params: { ...params, skip, limit: nextLimit }
      });
      const candidates = Array.isArray(res.data?.candidates) ? res.data.candidates : [];
      total = Number.isFinite(res.data?.total) ? res.data.total : total;
      allCandidates.push(...candidates);

      if (!candidates.length) break;
      skip += candidates.length;
      if (total != null && allCandidates.length >= total) break;
      if (candidates.length < nextLimit) break;
    }

    return { data: { ...(typeof total === 'number' ? { total } : {}), candidates: allCandidates } };
  },
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

  // Resume — download masked version (phone/email redacted)
  downloadMaskedResume: (candidateId) =>
    api.get(`/candidates/${candidateId}/resume/masked`, { responseType: 'blob' }),

  // ATS Match — score candidates against a job description (existing DB candidates)
  atsMatch: (jd_text, candidate_type = 'domestic') =>
    api.post('/candidates/ats-match', { jd_text, candidate_type }),

  // ATS Resume Upload — parse JD once, then score each uploaded resume file
  parseJDForScoring: (jd_text) =>
    api.post('/candidates/parse-jd-for-scoring', { jd_text }),

  scoreResumeUpload: (file, jdMeta) => {
    const fd = new FormData();
    fd.append('resume', file);
    fd.append('jd_skills', JSON.stringify(jdMeta));
    return api.post('/candidates/score-resume-upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Bulk resume ZIP upload
  bulkUploadZip: (zipFile) => {
    const fd = new FormData();
    fd.append('zip_file', zipFile);
    return api.post('/candidates/bulk-upload-zip', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },
  bulkUploadStatus: (jobId) => api.get(`/candidates/bulk-upload-status/${jobId}`),
};


// ── Sales Tracker API ──────────────────────────────────────────
export const salesTrackerAPI = {
  getDashboard:       (params)     => api.get('/sales/tracker/dashboard', { params }),
  getTrackerUsers:    ()           => api.get('/sales/tracker/users'),
  getLogs:            (params)     => api.get('/sales/tracker/log', { params }),
  submitLog:          (data)       => api.post('/sales/tracker/log', data),
  getSummary:         (params, config = {}) => api.get('/sales/tracker/summary', { params, ...config }),
  getInsights:        (params, config = {}) => api.get('/sales/tracker/insights', { params, ...config }),
  generateInsights:   (params, config = {}) => api.post('/sales/tracker/insights/generate', null, { params, ...config }),
  getPipeline:        ()           => api.get('/sales/tracker/pipeline'),
  createDeal:         (data)       => api.post('/sales/tracker/pipeline', data),
  updateDeal:         (id, data)   => api.put(`/sales/tracker/pipeline/${id}`, data),
  deleteDeal:         (id)         => api.delete(`/sales/tracker/pipeline/${id}`),
  submitWeeklyReview: (data)       => api.post('/sales/tracker/weekly-review', data),
  getWeeklyReviews:   ()           => api.get('/sales/tracker/weekly-review'),
  submitMonthlyRollup:(data)       => api.post('/sales/tracker/monthly-rollup', data),
  getMonthlyRollups:  ()           => api.get('/sales/tracker/monthly-rollup'),
};

export const integrationsAPI = {
  getStatus:    (config = {})         => api.get('/integrations/status', config),
  getDashboard: (params, config = {}) => api.get('/integrations/dashboard', { params, ...config }),
  sync:         (params)              => api.post('/integrations/sync', null, { params }),
};

export const callCadenceAPI = {
  getLists: (params) => api.get('/call-lists', { params }),
  createList: (body) => api.post('/call-lists', body),
  getList: (id) => api.get(`/call-lists/${id}`),
  addContacts: (id, contacts) => api.post(`/call-lists/${id}/contacts`, contacts),
  logOutcome: (contactId, body) => api.patch(`/call-contacts/${contactId}`, body),
  getDueCallbacks: (params) => api.get('/call-lists/callbacks/due', { params }),
  archiveList: (id) => api.delete(`/call-lists/${id}`),
  getStats: (params) => api.get('/call-lists/stats/summary', { params }),
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

// Email Compose API (single email via Microsoft Graph)
export const emailAPI = {
  compose: (data) => api.post('/email/compose', data),
};

// Bulk Email API
export const bulkEmailAPI = {
  getRecipients: () => api.get('/bulk-email/recipients'),
  send:          (data) => api.post('/bulk-email/send', data),
  sendTest:      (data) => api.post('/bulk-email/test-send', data),
  getSent:       () => api.get('/bulk-email/sent'),
};

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

// Onboarding API (Feature 15 — Contractor Onboarding Tracker)
export const onboardingAPI = {
  getChecklist:   (candidateId)               => api.get(`/candidates/${candidateId}/onboarding`),
  createChecklist:(candidateId)               => api.post(`/candidates/${candidateId}/onboarding`),
  updateStep:     (candidateId, stepIndex, completed) =>
    api.patch(`/candidates/${candidateId}/onboarding/step`, { step_index: stepIndex, completed }),
};

// Email Tracking API (Feature 1 — Email Open & Click Tracking)
export const emailTrackingAPI = {
  getStats:    () => api.get('/email-events/stats'),
  getEventsMap:() => api.get('/email-events/map'),   // { email → { open_count, last_opened } }
};

// Email Replies API (Feature 3 — Two-Way Email Sync)
export const emailRepliesAPI = {
  getAll:       ()     => api.get('/email-replies'),
  markHandled:  (id)   => api.patch(`/email-replies/${id}`, { handled: true }),
  triggerSync:  ()     => api.post('/email-replies/sync'),
};

// Sequences API (Feature 2 — Email Sequences & Automated Follow-ups)
export const sequencesAPI = {
  getAll:          ()           => api.get('/sequences'),
  getOne:          (id)         => api.get(`/sequences/${id}`),
  create:          (data)       => api.post('/sequences', data),
  update:          (id, data)   => api.patch(`/sequences/${id}`, data),
  delete:          (id)         => api.delete(`/sequences/${id}`),
  getEnrollments:  (params)     => api.get('/sequence-enrollments', { params }),
  enroll:          (data)       => api.post('/sequence-enrollments', data),
  unenroll:        (id)         => api.delete(`/sequence-enrollments/${id}`),
  pauseEnrollment: (id)         => api.patch(`/sequence-enrollments/${id}`, { status: 'paused' }),
};

// Job Publish API (Feature 8 — Job Board Publishing)
export const jobPublishAPI = {
  getAll:    ()                    => api.get('/job-posts'),
  getByJob:  (jobId)               => api.get(`/job-posts/${jobId}`),
  publish:   (jobId, data)         => api.post(`/jobs/${jobId}/publish`, data),
  unpublish: (jobId, platform)     => api.post(`/jobs/${jobId}/unpublish`, { platform }),
};

// Audit Logs API
export const auditLogsAPI = {
  getAll:          (params) => api.get('/audit-logs', { params }),
  getUserActivity: (params) => api.get('/audit-logs/user-activity', { params }),
  logEvent:        (body)   => api.post('/audit/log', body),
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
