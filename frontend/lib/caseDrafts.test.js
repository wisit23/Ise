import { readCaseDraft, saveCaseDraft } from "./caseDrafts";
import { saveSession, clearSession } from "./auth";
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
test("logout clears drafts and late old-account callbacks cannot write into a new account", () => {
  saveSession({
    user: { id: "first" },
    accessToken: "test",
    refreshToken: "test",
  });
  const oldKey = "reloop:case-draft:first:disputes:a:buyer";
  saveCaseDraft(oldKey, "private draft");
  expect(readCaseDraft(oldKey)).toBe("private draft");
  clearSession();
  saveSession({
    user: { id: "second" },
    accessToken: "test",
    refreshToken: "test",
  });
  saveCaseDraft(oldKey, "late private write");
  expect(readCaseDraft(oldKey)).toBe("");
  expect(sessionStorage.getItem(oldKey)).toBeNull();
});
