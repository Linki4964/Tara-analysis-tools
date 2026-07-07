const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.detail || data.error || 'Request failed');
  }
  return data as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  return request<T>(path, { method: 'POST', body });
}
