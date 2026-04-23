import { useCallback } from 'react';

const BASE = '/api';

/**
 * useTutorial — tracks which tutorial pages a user has seen.
 * Backed by Supabase (user_tutorials table) via the backend API.
 * Works across devices and survives HuggingFace redeploys.
 *
 * hasSeenTutorial(page) → Promise<boolean>
 * markTutorialDone(page) → Promise<void>
 */
export function useTutorial() {
  const hasSeenTutorial = useCallback(async (page) => {
    try {
      const res = await fetch(`${BASE}/tutorials`, { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      return Array.isArray(data.pages) && data.pages.includes(page);
    } catch {
      return false;
    }
  }, []);

  const markTutorialDone = useCallback(async (page) => {
    try {
      await fetch(`${BASE}/tutorials/${page}`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Non-critical — silently ignore network errors
    }
  }, []);

  return { hasSeenTutorial, markTutorialDone };
}
