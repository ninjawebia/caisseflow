import "./globals.css";

export const metadata = {
  title: "CaisseFlow — Back-office",
  description: "Caisse de restaurant conforme NF525 — back-office et archivage fiscal",
  viewport: { width: "device-width", initialScale: 1 },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
