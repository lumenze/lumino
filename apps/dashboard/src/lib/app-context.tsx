'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';

interface AppContextValue {
  appId: string;
  setAppId: (id: string) => void;
  appIds: string[];
  loading: boolean;
}

const AppContext = createContext<AppContextValue>({
  appId: '',
  setAppId: () => {},
  appIds: [],
  loading: true,
});

const STORAGE_KEY = 'lumino-dashboard-app-id';

export function AppProvider({ children }: { children: ReactNode }) {
  const [appIds, setAppIds] = useState<string[]>([]);
  const [appId, setAppIdState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ data: { items: string[] } }>('/apps');
        const ids = res.data.items;
        setAppIds(ids);

        // Restore last selected, or pick first available
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && ids.includes(saved)) {
          setAppIdState(saved);
        } else if (ids.length > 0) {
          setAppIdState(ids[0]);
        }
      } catch (err) {
        console.error('Failed to load app IDs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const setAppId = useCallback((id: string) => {
    setAppIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return (
    <AppContext.Provider value={{ appId, setAppId, appIds, loading }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
