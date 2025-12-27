import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "File Storage - Secure On-Premise File Management",
  description: "Enterprise-grade file storage system for secure document management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Toaster 
          position="top-right"
          richColors
          expand
          closeButton
          toastOptions={{
            style: { zIndex: 99999 },
          }}
        />
      </body>
    </html>
  );
}
