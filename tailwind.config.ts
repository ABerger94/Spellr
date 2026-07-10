import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d12',
        panel: '#141821',
        panelLight: '#1c2230',
        accent: '#8b5cf6',
        accent2: '#22d3ee',
      },
    },
  },
  plugins: [],
};

export default config;
