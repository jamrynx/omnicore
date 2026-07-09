import "./globals.css";

export const metadata = { title: "OmniCore — AI Escrow Infrastructure" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-surface-line bg-surface-raised/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <a href="/" className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-neutral-100">OmniCore</span>
              <span className="text-[10px] uppercase tracking-widest text-signal-dim">AI escrow infrastructure</span>
            </a>
            <span className="text-[10px] text-neutral-600">agents route · engine pays · humans rule</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
