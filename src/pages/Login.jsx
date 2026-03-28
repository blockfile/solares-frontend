import { useState } from "react";
import api from "../api/client";
import solaresLogo from "../components/assets/SOLARES.png";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeErr, setChangeErr] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const finishLogin = (token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("rememberMe", rememberMe ? "1" : "0");
    window.location.href = "/";
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await api.post("/auth/login", { identifier, password });
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
        <div className="login-city-brand">
          <img src={solaresLogo} alt="Solares" className="login-city-brand-image" />
          <div className="login-city-logo">SOLARES SYSTEM</div>
          <h1 className="login-city-title">SOLARES</h1>
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
              />
              <button
                type="button"
                className="login-city-eye"
                onClick={() => setShowPassword((v) => !v)}
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

          <button className="btn login-city-submit" type="submit">
            Log In
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
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
