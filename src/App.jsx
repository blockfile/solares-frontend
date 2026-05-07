import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RequireAuth from "./auth/RequireAuth";

const THEME_STORAGE_KEY = "solaresTheme";

function getInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login theme={theme} onToggleTheme={toggleTheme} />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard theme={theme} onToggleTheme={toggleTheme} />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
