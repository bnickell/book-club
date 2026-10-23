import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme palette -- swap these hex values to rebrand the app
        accent: "#818CF8",        // Indigo 400 -- primary accent / CTA
        ink: "#0F172A",           // Slate 900 -- primary dark
        surface: "#E2E8F0",       // Slate 200 -- light surfaces
        canvas: "#F8FAFC",        // Slate 50 -- page background
        line: "#CBD5E1",          // Slate 300 -- borders / tints
        muted: "#475569"          // Slate 600 -- secondary text / accent
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
