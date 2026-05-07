const TOKEN_KEY = "token";
const REMEMBER_KEY = "rememberMe";

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token, remember = false) {
  clearAuthToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}
