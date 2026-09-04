import { Anuphan, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import ChatSocketProvider from "../components/chat/ChatSocketProvider";

/* Self-hosted by next/font at build time — no runtime request to Google, no
   FOUT, and Thai text renders identically on every OS instead of falling back
   to whatever each machine happens to ship. */
const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans-thai",
});

/* Headings only. The reference design pairs a tighter display face with the
   body text; using one face for both is what made every heading read as
   "big body text" rather than as a heading. */
const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-anuphan",
});

export const metadata = {
  title: "RE-LOOP",
  description: "Second-hand fashion marketplace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${anuphan.variable}`}>
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
      {/* One chat socket for the whole session lives here rather than inside
          any single page, so the NavBar badge and the inbox list stay live
          on every route — not just while a chat room happens to be open.
          See ChatSocketProvider's comment. */}
      <body className="font-sans">
        <ChatSocketProvider>{children}</ChatSocketProvider>
      </body>
    </html>
  );
}
