/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs personnalisées ultra-subtiles
        gray: {
          25: '#fcfcfd',
        },
        blue: {
          25: '#f8faff',
        },
        slate: {
          25: '#fafafa',
        },
        green: {
          25: '#f7fef8',
        },
        purple: {
          25: '#faf9ff',
        },
        red: {
          25: '#fef7f7',
        },
        indigo: {
          25: '#f8f9ff',
        },
        emerald: {
          25: '#f0fdf4',
        },
        orange: {
          25: '#fff7ed',
        },
        yellow: {
          25: '#fefce8',
        },
        amber: {
          25: '#fffbeb',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-out-right': 'slideOutRight 0.3s ease-in',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' }
        }
      }
    },
  },
  plugins: [],
}