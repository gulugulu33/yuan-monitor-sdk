import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.response.use(
  (res) => {
    if (res.data && res.data.success === false) {
      return Promise.reject(new Error(res.data.message || '请求失败'));
    }
    return res.data;
  },
  (err) => Promise.reject(new Error(err.response?.data?.message || err.message || '网络错误'))
);

export const getApps = () => http.get('/apps').then(r => r.data);

export const getOverview = (params) => http.get('/stats/overview', { params }).then(r => r.data);

export const getPerformance = (params) => http.get('/stats/performance', { params }).then(r => r.data);

export const getResources = (params) => http.get('/performance/resources', { params }).then(r => r.data);

export const getLongTasks = (params) => http.get('/performance/long-tasks', { params }).then(r => r.data);

export const getErrors = (params) => http.get('/errors', { params }).then(r => r.data);

export const getErrorDetail = (id) => http.get(`/errors/${id}`).then(r => r.data);

export const getErrorEvents = (id, params) => http.get(`/errors/${id}/events`, { params }).then(r => r.data);

export const updateErrorStatus = (id, status) => http.patch(`/errors/${id}/status`, { status }).then(r => r.data);

export const getReplays = (params) => http.get('/replays', { params }).then(r => r.data);

export const getReplay = (id) => http.get(`/replays/${id}`).then(r => r.data);

export const getSessionReplay = (appKey, sessionId) =>
  http.get(`/sessions/${sessionId}/replay`, { params: { appKey } }).then(r => r.data);
