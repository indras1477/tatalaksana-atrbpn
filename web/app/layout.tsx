import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Menambahkan tipe : Metadata untuk menghilangkan error eslint
export const metadata: Metadata = {
  title: 'E-BISPRO ATR/BPN',
  description: 'Sistem Elektronik Dokumen Ketatalaksanaan AR/BPN',
  icons: {
    // Menambahkan /e-sop-atrbpn di depannya agar sesuai dengan basePath
    icon: '/e-sop-atrbpn/icon-bpn.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Pasang skala UI sebelum halaman digambar agar tidak berkedip saat dimuat.
            Studio dikecualikan supaya kanvas & hasil cetak PDF tetap presisi. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;if(p.indexOf('/studio')===-1){document.documentElement.classList.add('ui-skala');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}