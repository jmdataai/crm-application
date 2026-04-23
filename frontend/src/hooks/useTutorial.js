import { useCallback } from 'react';

const BASE = '/api';

export function useTutorial() {
  const hasSeenTutorial = useCallback(async (page) => {
    try {
      const res = await fetch(`${BASE}/tutorials`, { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      return data.pages?.includes(page) ?? false;
    } catch { return false; }
  }, []);

  const markTutorialDone = useCallback(async (page) => {
    try {
      await fetch(`${BASE}/tutorials/${page}`, {
        method: 'POST', credentials: 'include'
      });
    } catch {}
  }, []);

  return { hasSeenTutorial, markTutorialDone };
}