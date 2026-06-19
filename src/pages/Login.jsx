import { Suspense, lazy, useState } from "react";
import api from "../api/client";
import { setAuthToken } from "../auth/tokenStorage";
import solaresLogo from "../components/assets/SOLARES.png";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

// Three.js is heavy — load it as its own chunk so it only downloads on the
// login screen and never bloats the authenticated app bundle. The CSS gradient
// behind the canvas serves as the fallback while it loads.
const LoginBackground = lazy(() => import("../components/LoginBackground"));

const MAX_IDENTIFIER_LENGTH = 150;
const MAX_PASSWORD_LENGTH = 72;

const HERO_FEATURES = [
  {
    title: "Solar-grade quoting",
    copy: "Build accurate quotations from live material costs and margin templates.",
    icon: (
      <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.5-6.5-1.4 1.4M7.9 16.1l-1.4 1.4m11 0-1.4-1.4M7.9 7.9 6.5 6.5M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
    )
  },
  {
    title: "End-to-end operations",
    copy: "Scheduling, inventory, payroll and accounting in one connected workspace.",
    icon: <path d="M4 7h16M4 12h16M4 17h10M6.5 4.5v2m11-2v2" />
  },
  {
    title: "Secure & role-based",
    copy: "Granular module access keeps every team focused on what they own.",
    icon: <path d="M12 3 5 6v5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Zm0 6.5v3m-2.2 0h4.4" />
  }
];

export default function Login({ theme = "light", onToggleTheme }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeErr, setChangeErr] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const isDarkTheme = theme === "dark";

  useBodyScrollLock(Boolean(pendingLogin));

  const finishLogin = (token) => {
    setAuthToken(token, rememberMe);
    window.location.href = "/";
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier || !password) {
      setErr("Username or email and password are required");
      return;
    }

    if (trimmedIdentifier.length > MAX_IDENTIFIER_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setErr("Invalid credentials");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/auth/login", { identifier: trimmedIdentifier, password });
      if (res.data?.mustChangePassword || res.data?.user?.mustChangePassword) {
        setPendingLogin({
          token: res.data.token,
          user: res.data.user || null
        });
        setNewPassword("");
        setConfirmPassword("");
        setChangeErr("");
        return;
      }

      finishLogin(res.data.token);
    } catch (e2) {
      setErr(e2?.response?.data?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitPasswordChange = async (e) => {
    e.preventDefault();
    setChangeErr("");

    if (newPassword.length < 8) {
      setChangeErr("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangeErr("Passwords do not match.");
      return;
    }

    if (!pendingLogin?.token) {
      setChangeErr("Your login session expired. Please sign in again.");
      return;
    }

    setChangingPassword(true);
    try {
      await api.post(
        "/auth/change-password",
        { password: newPassword },
        {
          headers: {
            Authorization: `Bearer ${pendingLogin.token}`
          }
        }
      );
      finishLogin(pendingLogin.token);
    } catch (e2) {
      setChangeErr(e2?.response?.data?.message || "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  };

  const cancelPasswordChange = () => {
    setPendingLogin(null);
    setNewPassword("");
    setConfirmPassword("");
    setChangeErr("");
  };

  return (
    <div className="login-stage page-animate">
      <Suspense fallback={null}>
        <LoginBackground theme={theme} />
      </Suspense>
      <div className="login-scrim" aria-hidden="true" />

      <button
        className="theme-switch login-theme-toggle"
        type="button"
        role="switch"
        aria-checked={isDarkTheme}
        aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
        onClick={onToggleTheme}
      >
        <span className="theme-switch-copy">
          <span>{isDarkTheme ? "Dark" : "Light"}</span>
          <small>{isDarkTheme ? "Night workspace" : "Day workspace"}</small>
        </span>
        <span className="theme-switch-track" aria-hidden="true">
          <span className="theme-switch-thumb" />
        </span>
      </button>

      <div className="login-grid">
        <section className="login-hero">
          <div className="login-hero-brand">
            <img src={solaresLogo} alt="Solares" className="login-hero-logo" />
            <span className="login-hero-lockup">
              <strong>SOLARES</strong>
              <small>Energy Solutions</small>
            </span>
          </div>

          <div className="login-hero-copy">
            <p className="login-hero-eyebrow">Management Information System</p>
            <h1 className="login-hero-title">
              Power your operations<br />from quote to commission.
            </h1>
            <p className="login-hero-lede">
              One secure workspace for quoting, inventory, scheduling, payroll and
              accounting — built for the way solar teams actually work.
            </p>
          </div>

          <ul className="login-hero-features">
            {HERO_FEATURES.map((feature) => (
              <li key={feature.title} className="login-hero-feature">
                <span className="login-hero-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {feature.icon}
                  </svg>
                </span>
                <span className="login-hero-feature-text">
                  <strong>{feature.title}</strong>
                  <small>{feature.copy}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="login-panel">
          <div className="login-card">
            <div className="login-card-head">
              <img src={solaresLogo} alt="Solares" className="login-card-logo" />
              <h2 className="login-card-title">Welcome back</h2>
              <p className="login-card-sub">Sign in to your Solares workspace</p>
            </div>

            <form onSubmit={submit} className="login-form">
              <div className="field">
                <label htmlFor="identifier">Username or Email</label>
                <input
                  id="identifier"
                  className="input login-input"
                  placeholder="Enter username or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  maxLength={MAX_IDENTIFIER_LENGTH}
                  required
                  spellCheck="false"
                />
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="login-pass-wrap">
                  <input
                    id="password"
                    className="input login-input"
                    placeholder="Enter password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    maxLength={MAX_PASSWORD_LENGTH}
                    required
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me on this device</span>
              </label>

              {err && <div className="error-text">{err}</div>}

              <button className="btn btn-primary login-submit" type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
                {!submitting && (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
                  </svg>
                )}
              </button>
            </form>

            <p className="login-card-foot">
              &copy; {new Date().getFullYear()} Solares Energy Solutions · All rights reserved
            </p>
          </div>
        </section>
      </div>

      {pendingLogin && (
        <div className="modal-backdrop">
          <div className="modal-card login-password-modal">
            <div className="modal-copy">
              <h4>Change Password</h4>
              <p>
                This account is using a generated temporary password. Create a new password before
                entering the dashboard.
              </p>
              <p className="login-password-user">
                {pendingLogin.user?.username || pendingLogin.user?.email || identifier}
              </p>
            </div>

            <form className="login-password-form" onSubmit={submitPasswordChange}>
              <input
                className="input"
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
              />

              {changeErr && <div className="error-text">{changeErr}</div>}

              <div className="modal-actions">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={cancelPasswordChange}
                  disabled={changingPassword}
                >
                  Back
                </button>
                <button className="btn btn-primary" type="submit" disabled={changingPassword}>
                  {changingPassword ? "Updating..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
