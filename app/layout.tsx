import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "covivencia.",
  description: "Repartí gastos compartidos con tu grupo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "covivencia.",
  },
  icons: {
    // Se declara a mano: definir `icons` acá desactiva la detección automática
    // del archivo especial app/icon.png (por eso no alcanzaba con solo el archivo).
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Un solo color dejaba la barra del navegador oscura también en modo claro.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0E0D" },
  ],
  // Necesario para que env(safe-area-inset-*) tenga valor en iPhone con notch/
  // home indicator; sin esto el toolbar inferior queda pegado/cortado al borde.
  viewportFit: "cover",
};

// Aplica el tema guardado antes del primer paint para evitar flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var m=t==='light'||t==='dark'?t:'auto';var d=m==='dark'||m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
