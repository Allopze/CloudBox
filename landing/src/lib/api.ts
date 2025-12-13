import { API_URL } from './env';

export const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
};

