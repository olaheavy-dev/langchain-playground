import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces by role rather than one family doing everything. Bricolage is
 * narrow and slightly odd at display sizes, which is what keeps the masthead
 * from reading as another dashboard; Instrument Sans is quiet enough to carry
 * long model output; the mono is reserved for identifiers and code.
 */
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const sans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const mono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LangChain Playground",
  description:
    "Three LangChain patterns side by side: a tool-calling agent, a chat model, and a streaming chat model.",
};

/**
 * Runs before first paint, so the page never renders in the wrong theme and
 * then corrects itself. Stamps the stored choice if there is one, otherwise
 * whatever the operating system prefers.
 */
const applyThemeBeforePaint = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyThemeBeforePaint }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
