import { ResetPasswordPage } from "../../components/auth/PasswordRecovery";

export const metadata = {
  title: "Reset password · RE-LOOP",
  robots: { index: false },
  // Belt and braces: the token lives in the URL fragment (never sent in a
  // Referer anyway), and nothing on this page should leak where it came from.
  referrer: "no-referrer",
};

export default function Page() {
  return <ResetPasswordPage />;
}
