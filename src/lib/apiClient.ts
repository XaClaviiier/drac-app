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
      credentials: 'include',
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
    const isSessionError = response.status === 401
      && /sesi\s+(login|berakhir)|sesi.*(tidak valid|kedaluwarsa)/i.test(String(data?.message || ''));
    if (isSessionError && !path.includes('/login')) {
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
    // Login baru memakai cookie HttpOnly. Token lama dibersihkan setelah cookie
    // berhasil diterbitkan, sehingga tidak dapat lagi dibaca oleh JavaScript.
    if (response.success) localStorage.removeItem('apiToken');
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
  getReceiptAISettings: () => request('/receipt-ai-settings', { method: 'GET' }),
  updateReceiptAISettings: (apiKey: string, model: string) =>
    request('/receipt-ai-settings', { method: 'PUT', body: JSON.stringify({ apiKey, model }) }),
  aiChat: (messages: Array<{ role: string; content: string }>) =>
    request('/ai-chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  readReceipt: (image: string) =>
    request('/receipt-ocr', { method: 'POST', body: JSON.stringify({ image }) }),
  previewDataMaintenance: (from: string, to: string, branchId: string) =>
    request(`/data-maintenance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&branchId=${encodeURIComponent(branchId)}`, { method: 'GET' }),
  purgeDataMaintenance: (from: string, to: string, branchId: string, confirmation: string) =>
    request(`/data-maintenance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&branchId=${encodeURIComponent(branchId)}`, {
      method: 'POST', body: JSON.stringify({ confirmation }),
    }),
  exportTransactionBackup: () => request('/transaction-backup', { method: 'GET' }),
  previewTransactionRestore: (sheets: Record<string, any[]>) => request('/transaction-backup/preview', { method: 'POST', body: JSON.stringify({ sheets }) }),
  importTransactionRestore: (sheets: Record<string, any[]>, mode: 'insert' | 'upsert') => request('/transaction-backup/import', { method: 'POST', body: JSON.stringify({ sheets, mode }) }),

  // ========== GENERIC CRUD ==========
  get: <T = any>(resource: string) => request<T>(`/${resource}`, { method: 'GET' }),
  create: (resource: string, data: any) =>
    request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (resource: string, id: string, data: any) =>
    request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (resource: string, id: string) =>
    request(`/${resource}/${id}`, { method: 'DELETE' }),
  removeWithReason: (resource: string, id: string, reason: string) =>
    request(`/${resource}/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  deleteVehicleCatalogItem: (id: string, entity: 'brand' | 'model' | 'color') =>
    request(`/vehicle-catalog/${id}`, { method: 'DELETE', body: JSON.stringify({ entity }) }),

  deleteCustomerPaymentsForInvoice: (invoiceId: string) =>
    request(`/customer-payments/invoice/${invoiceId}`, { method: 'DELETE' }),

  // ========== SPECIFIC HELPERS ==========
  addPurchasePayment: (invoiceId: string, payment: any) =>
    request(`/purchase-invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment),
    }),
  removeWithBody: (resource: string, id: string, body: Record<string, unknown>) =>
    request(`/${resource}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),
  deletePurchasePayment: (invoiceId: string, paymentId: string) =>
    request(`/purchase-invoices/${invoiceId}/payments`, {
      method: 'DELETE',
      body: JSON.stringify({ paymentId }),
    }),
  createInvoiceFromWorkOrder: (woId: string, cashPayment: number, transferPayment: number, date?: string, paymentDate?: string, backdateReason?: string, items?: any[]) =>
    request('/sales-invoices/from-work-order', {
      method: 'POST',
      body: JSON.stringify({ woId, cashPayment, transferPayment, date, paymentDate, backdateReason, items }),
    }),
};

export const API_URL = API_BASE_URL;
