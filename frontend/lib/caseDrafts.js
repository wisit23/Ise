import { getStoredUser } from "./auth";

const files = new Map();
const prefix = "reloop:case-draft:";
const keyFor = (key) =>
  key.startsWith(prefix)
    ? key
    : prefix + (getStoredUser()?.id || "anonymous") + ":" + key;
const currentKey = (key) =>
  keyFor(key).slice(prefix.length).split(":")[0] ===
  (getStoredUser()?.id || "anonymous");
export function readCaseDraft(key) {
  if (typeof window === "undefined" || !key || !currentKey(key)) return "";
  try {
    return sessionStorage.getItem(keyFor(key)) || "";
  } catch {
    return "";
  }
}
export function saveCaseDraft(key, value) {
  if (!key || typeof window === "undefined" || !currentKey(key)) return;
  try {
    if (value) sessionStorage.setItem(keyFor(key), value);
    else sessionStorage.removeItem(keyFor(key));
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}
export function readDraftFile(key) {
  return key && currentKey(key) ? files.get(keyFor(key)) || null : null;
}
export function saveDraftFile(key, file) {
  if (!key || !currentKey(key)) return;
  if (file) files.set(keyFor(key), file);
  else files.delete(keyFor(key));
}
if (typeof window !== "undefined") {
  let account = getStoredUser()?.id;
  window.addEventListener("reloop:auth", () => {
    const next = getStoredUser()?.id;
    if (account !== next) {
      files.clear();
      try {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith(prefix))
          .forEach((key) => sessionStorage.removeItem(key));
      } catch {
        /* Best-effort cleanup. */
      }
    }
    account = next;
  });
}
