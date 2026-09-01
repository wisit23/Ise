import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

/* Self-hosted by next/font at build time — no runtime request to Google, no
   FOUT, and Thai text renders identically on every OS instead of falling back
   to whatever each machine happens to ship. */
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans-thai",
});

export const metadata = {
  title: "RE-LOOP",
  description: "Second-hand fashion marketplace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <head>
        {/* Material Symbols used to be injected imperatively from a useEffect
            in four separate components. Declaring it once here means the
            icons are requested during HTML parse instead of after hydration,
            so they no longer pop in late. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
