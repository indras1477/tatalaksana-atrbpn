'use client';

// ID unik per browser/perangkat — membedakan presence editing antar perangkat
// meskipun beberapa orang memakai akun yang sama (shared account ≤4 perangkat).
const KEY = 'esop-client-id';

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
