import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { applyPreferences, loadPreferences, savePreferences, type Preferences } from "../lib/preferences";

interface PreferencesValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);

  useEffect(() => applyPreferences(preferences), [preferences]);

  const setPreference = useCallback<PreferencesValue["setPreference"]>((key, value) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);

  return <PreferencesContext.Provider value={{ preferences, setPreference }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside <PreferencesProvider>");
  return value;
}
