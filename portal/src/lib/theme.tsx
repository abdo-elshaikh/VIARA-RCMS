import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("VIARA-theme") as Theme | null;
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      setTheme(stored ?? (prefersDark ? "dark" : "light"));
    } catch { }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (!hydrated.current) return;
    try {
      localStorage.setItem("VIARA-theme", theme);
    } catch { }
  }, [theme]);


  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
