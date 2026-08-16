import { Suspense, lazy, useState } from "react";
import api from "../api/client";
import { setAuthToken } from "../auth/tokenStorage";
import solaresLogo from "../components/assets/SOLARES.png";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

// The animated solar canvas is its own chunk so it never bloats the
// authenticated app bundle; the chrome background covers while it loads.
const LoginBackground = lazy(() => import("../components/LoginBackground"));

const MAX_IDENTIFIER_LENGTH = 150;
const MAX_PASSWORD_LENGTH = 72;

const READOUTS = [
  {
    key: "QUO/01",
    title: "Solar-grade quoting",
    copy: "Quotations built from live material costs and margin templates."
  },
  {
    key: "OPS/02",
    title: "End-to-end operations",
    copy: "Scheduling, inventory, payroll and accounting in one console."
  },
  {
    key: "SEC/03",
    title: "Role-based access",
    copy: "Granular module permissions keep every team on mission."
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
    <div className="hx-login page-animate">
      <Suspense fallback={null}>
        <LoginBackground theme={theme} />
      </Suspense>
      <div className="hx-login-scrim" aria-hidden="true" />

      <button
        className="hx-login-theme"
        type="button"
        aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
        onClick={onToggleTheme}
      >
        {isDarkTheme ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.8v2" /><path d="M12 19.2v2" /><path d="M4.2 12h-2" /><path d="M21.8 12h-2" />
            <path d="m5.4 5.4 1.4 1.4" /><path d="m17.2 17.2 1.4 1.4" /><path d="m18.6 5.4-1.4 1.4" /><path d="m6.8 17.2-1.4 1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
          </svg>
        )}
      </button>

      <section className="hx-login-hero">
        <div className="hx-login-brand">
          <img src={solaresLogo} alt="Solares" />
          <span className="hx-login-lockup">
            <strong>SOLARES</strong>
            <small>Energy Solutions</small>
          </span>
        </div>

        <div className="hx-login-copy">
          <p className="hx-login-eyebrow">Helios · Management Console</p>
          <h1 className="hx-login-title">
            Every watt, every peso,<br />
            <em>one command deck.</em>
          </h1>
          <p className="hx-login-lede">
            The Solares operations console — quoting, scheduling, inventory,
            payroll and accounting for solar teams that run on precision.
          </p>
        </div>

        <ul className="hx-login-readouts">
          {READOUTS.map((item) => (
            <li key={item.key} className="hx-login-readout">
              <span className="hx-login-readout-key">{item.key}</span>
              <span className="hx-login-readout-copy">
                <strong>{item.title}</strong>
                <small>{item.copy}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="hx-login-stage">
        <div className="hx-login-card">
          <p className="hx-login-card-eyebrow">Secure access</p>
          <h2 className="hx-login-card-title">Sign in to the console</h2>
          <p className="hx-login-card-sub">Authenticate with your Solares operator account</p>

          <form onSubmit={submit} className="hx-login-form">
            <div className="hx-login-field">
              <label htmlFor="identifier">Operator ID / Email</label>
              <input
                id="identifier"
                className="hx-login-input"
                placeholder="username or email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                maxLength={MAX_IDENTIFIER_LENGTH}
                required
                spellCheck="false"
              />
            </div>

            <div className="hx-login-field">
              <label htmlFor="password">Passphrase</label>
              <div className="hx-login-pass">
                <input
                  id="password"
                  className="hx-login-input"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
                <button
                  type="button"
                  className="hx-login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <label className="hx-login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Keep me signed in on this device</span>
            </label>

            {err && <div className="hx-login-error">{err}</div>}

            <button className="hx-login-submit" type="submit" disabled={submitting}>
              {submitting ? "Authenticating…" : "Enter console"}
              {!submitting && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
                </svg>
              )}
            </button>
          </form>

          <p className="hx-login-foot">
            © {new Date().getFullYear()} Solares Energy Solutions · All systems nominal
          </p>
        </div>
      </section>

      {pendingLogin && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-copy">
              <h4>Set a new passphrase</h4>
              <p>
                This account is using a generated temporary password. Create a new
                password before entering the console.
              </p>
              <p className="hx-login-password-user">
                {pendingLogin.user?.username || pendingLogin.user?.email || identifier}
              </p>
            </div>

            <form className="hx-login-form" onSubmit={submitPasswordChange} style={{ marginTop: 16 }}>
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

              {changeErr && <div className="hx-login-error">{changeErr}</div>}

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
                  {changingPassword ? "Updating…" : "Save passphrase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
