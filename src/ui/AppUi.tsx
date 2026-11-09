import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ToastState {
  message: string;
  id: number;
}

interface AppUi {
  toast: (message: string) => void;
}

const AppUiContext = createContext<AppUi | null>(null);

export function AppUiProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<ToastState | null>(null);

  const toast = useCallback((message: string) => {
    const id = Date.now();
    setToastState({ message, id });
    window.setTimeout(() => {
      setToastState((current) => (current?.id === id ? null : current));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <AppUiContext.Provider value={value}>
      {children}
      {toastState ? (
        <div className="toast" role="status">
          {toastState.message}
        </div>
      ) : null}
    </AppUiContext.Provider>
  );
}

export function useAppUi(): AppUi {
  const ctx = useContext(AppUiContext);
  if (!ctx) throw new Error('useAppUi must be used within AppUiProvider');
  return ctx;
}
