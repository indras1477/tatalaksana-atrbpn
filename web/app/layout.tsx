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

export const metadata: Metadata = {
  title: "E-SOP ATR BPN",
  description: "Sistem Operasional Standard ATR BPN",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
<script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var token = localStorage.getItem('token');
                var user = localStorage.getItem('user');
                var path = window.location.pathname;
                var basePath = '/e-sop-atrbpn';
                if (!token || !user) {
                  if (path !== basePath + '/login' && path !== '/login') {
                    window.location.href = basePath + '/login';
                  }
                } else if (path === basePath + '/login' || path === '/login') {
                    window.location.href = basePath || '/';
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}