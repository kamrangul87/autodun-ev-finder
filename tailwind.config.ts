import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}","./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { autodun: { green: "#2ecc71", black: "#111111", gray: "#f4f6f8" } },
      boxShadow: { soft: "0 10px 25px rgba(0,0,0,0.08)" },
      borderRadius: { "2xl": "1.25rem" }
    }
  },
  plugins: []
};
export default config;
