import type { Metadata, Viewport } from "next";
import "./site.css";

export const metadata: Metadata = {
  icons: { icon: "/assets/img/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="no-js">
      <head>
        <script src="/assets/js/boot.js" />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
        <div className="toast" id="toast" role="status" aria-live="polite" />
        <script src="/assets/js/site.js" defer />
      </body>
    </html>
  );
}
