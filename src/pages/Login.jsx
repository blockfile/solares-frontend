import { useState } from "react";
import api from "../api/client";
import { setAuthToken } from "../auth/tokenStorage";
import solaresLogo from "../components/assets/SOLARES.png";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const MAX_IDENTIFIER_LENGTH = 150;
const MAX_PASSWORD_LENGTH = 72;

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
    <div className="login-city-shell page-animate">
      <div className="login-city-card">
        <button
          className="theme-switch theme-switch-login"
          type="button"
          role="switch"
          aria-checked={isDarkTheme}
          aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        >
          <span className="theme-switch-copy">
            <span>{isDarkTheme ? "Dark mode" : "Light mode"}</span>
            <small>{isDarkTheme ? "Night workspace" : "Day workspace"}</small>
          </span>
          <span className="theme-switch-track" aria-hidden="true">
            <span className="theme-switch-thumb" />
          </span>
        </button>
        <div className="login-city-brand">
          <img src={solaresLogo} alt="Solares" className="login-city-brand-image" />
          <p className="login-city-subtitle">MANAGEMENT INFORMATION SYSTEM</p>
        </div>

        <form onSubmit={submit} className="login-city-form">
          <div className="field">
            <label htmlFor="identifier">Username or Email</label>
            <input
              id="identifier"
              className="input login-city-input"
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
            <div className="login-city-password-wrap">
              <input
                id="password"
                className="input login-city-input"
                placeholder="Enter Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={MAX_PASSWORD_LENGTH}
                required
              />
              <button
                type="button"
                className="login-city-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <label className="login-city-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember Me</span>
          </label>

          {err && <div className="error-text">{err}</div>}

          <button className="btn login-city-submit" type="submit" disabled={submitting}>
            {submitting ? "Checking..." : "Log In"}
          </button>
        </form>

        <p className="login-city-footer">
          &copy; {new Date().getFullYear()} Solares
        </p>
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
