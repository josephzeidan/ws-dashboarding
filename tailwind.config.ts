import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0f4ff', 500: '#3b6fd4', 600: '#2d5cbe', 900: '#1a2e6b' },
      },
    },
  },
  plugins: [],
}

export default config
