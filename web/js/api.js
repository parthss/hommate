// Fetch wrapper for the Hommate API.
import { session, clearSession, saveAccount, gate } from './store.js';

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: 'Bearer ' + session.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the house server. Check your connection.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && session.token) {
    clearSession();
    location.hash = '#/welcome';
  }
  // Removed from the house, or an admin reset the password: refresh and go where we belong.
  if (res.status === 403 && (data.code === 'no-house' || data.code === 'must-change')) {
    try { saveAccount(await api('GET', '/account')); } catch { /* offline */ }
    const where = gate();
    if (where && location.hash.split('?')[0] !== where.split('?')[0]) location.hash = where;
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong.', data.code);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);
export const patchApi = (p, b = {}) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p, {});
