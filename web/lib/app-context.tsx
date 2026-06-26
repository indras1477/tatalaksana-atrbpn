'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AppUser {
  id: number;
  username: string;
  nama_lengkap?: string;
  role: string;
  unit_l1?: string;
  unit_l2?: string;
}

interface AppContextType {
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  currentUser: AppUser | null;
  handleLogout: () => void;
}

const AppContext = createContext<AppContextType>({
  isDarkMode: false,
  setIsDarkMode: () => {},
  currentUser: null,
  handleLogout: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkModeState] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const setIsDarkMode = (v: boolean) => {
    setIsDarkModeState(v);
    localStorage.setItem('darkMode', v ? '1' : '0');
  };

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) setIsDarkModeState(saved === '1');

    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { setCurrentUser(JSON.parse(userStr)); } catch {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.replace(window.location.origin + '/e-sop-atrbpn/login/');
  };

  return (
    <AppContext.Provider value={{ isDarkMode, setIsDarkMode, currentUser, handleLogout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
