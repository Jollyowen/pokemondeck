import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "surface-muted-2": "var(--surface-muted-2)",
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
          stronger: "var(--line-stronger)",
        },
        ink: {
          DEFAULT: "var(--foreground)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
        },
        primary: {
          DEFAULT: "var(--fill-primary)",
          foreground: "var(--on-primary)",
        },
        chart: "var(--chart-fill)",
        danger: {
          bg: "var(--danger-bg)",
          border: "var(--danger-border)",
          text: "var(--danger-text)",
        },
        success: {
          bg: "var(--success-bg)",
          text: "var(--success-text)",
        },
        warning: {
          bg: "var(--warning-bg)",
          border: "var(--warning-border)",
          text: "var(--warning-text)",
        },
        info: {
          bg: "var(--info-bg)",
          text: "var(--info-text)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
