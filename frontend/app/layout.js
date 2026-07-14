import './globals.css';

export const metadata = {
  title: 'RE-LOOP',
  description: 'Second-hand fashion marketplace',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
