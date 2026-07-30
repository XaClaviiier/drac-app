// ============================================================
// API CLIENT - Dokter AC Mobil
// ============================================================
// Auto-detect API URL:
// - Development (npm run dev): pakai localhost:8000/api atau override via .env
// - Production (build & upload): pakai /api (satu server dengan frontend)
// ============================================================

const API_BASE_URL = (() => {
  // Cek jika ada env variable override (untuk dev)
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  
  // Production: samakan dengan domain frontend
  if (typeof window !== 'undefined') {
    return window.location.origin + '/api';
  }
  return '/api';
})();

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('apiToken') ? { Authorization: `Bearer ${localStorage.getItem('apiToken')}` } : {}),
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Invalid response: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    if (response.status === 401 && !path.includes('/login')) {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('apiToken');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') window.location.assign('/login');
    }
    return data;
  } catch (error: any) {
    console.error('API Error:', url, error);
    return {
      success: false,
      message: 'Koneksi ke server gagal. Cek koneksi internet atau backend API.',
      error: error.message,
    };
  }
}

export const api = {
  // ========== AUTH ==========
  login: async (username: string, password: string) => {
    const response = await request('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (response.success && response.data?.apiToken) localStorage.setItem('apiToken', response.data.apiToken);
    return response;
  },
  logout: () => request('/logout', { method: 'POST' }),

  // ========== ALL DATA ==========
  loadAllData: () => request('/all-data', { method: 'GET' }),
  updateSettings: (data: any) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getAISettings: () => request('/ai-settings', { method: 'GET' }),
  updateAISettings: (apiKey: string, model: string) =>
    request('/ai-settings', { method: 'PUT', body: JSON.stringify({ apiKey, model }) }),
  aiChat: (messages: Array<{ role: string; content: string }>) =>
    request('/ai-chat', { method: 'POST', body: JSON.stringify({ messages }) }),

  // ========== GENERIC CRUD ==========
  get: (resource: string) => request(`/${resource}`, { method: 'GET' }),
  create: (resource: string, data: any) =>
    request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (resource: string, id: string, data: any) =>
    request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (resource: string, id: string) =>
    request(`/${resource}/${id}`, { method: 'DELETE' }),

  // ========== SPECIFIC HELPERS ==========
  addPurchasePayment: (invoiceId: string, payment: any) =>
    request(`/purchase-invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment),
    }),
  createInvoiceFromWorkOrder: (woId: string, payment: number, paymentMethod: 'Tunai' | 'QRIS/Transfer') =>
    request('/sales-invoices/from-work-order', {
      method: 'POST',
      body: JSON.stringify({ woId, payment, paymentMethod }),
    }),
};

export const API_URL = API_BASE_URL;
