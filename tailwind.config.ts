import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        paper: "#fbf7ed",
        signal: "#ff6b35",
        stone: "#f5f1eb",
        moss: "#5f7a61"
      }
    }
  },
  plugins: []
};

export default config;
