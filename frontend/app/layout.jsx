import "./globals.css";

export const metadata = { title: "OmniCore — AI Escrow Infrastructure" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
