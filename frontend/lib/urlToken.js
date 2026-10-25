/**
 * Emailed links (password reset, email confirmation) carry their token in
 * the URL fragment (#token=...), which browsers never send to a server.
 * Read it once, then strip it from the address bar and history so it can't
 * leak through a shared screen, a bookmark or browser sync.
 */
export function takeTokenFromUrl() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return token || null;
}
