import { VerifyEmailPage } from "../../components/auth/EmailVerification";

export const metadata = {
  title: "Confirm email · RE-LOOP",
  robots: { index: false },
  // The token lives in the URL fragment (never sent in a Referer anyway);
  // nothing on this page should leak where it came from either.
  referrer: "no-referrer",
};

export default function Page() {
  return <VerifyEmailPage />;
}
