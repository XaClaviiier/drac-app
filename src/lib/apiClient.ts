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
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Invalid response: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
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
  login: (username: string, password: string) =>
    request('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // ========== ALL DATA ==========
  loadAllData: () => request('/all-data', { method: 'GET' }),
  updateSettings: (data: any) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

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
};

export const API_URL = API_BASE_URL;
