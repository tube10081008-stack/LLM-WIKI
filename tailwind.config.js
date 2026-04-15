/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#121826',
        mist: '#f3f7fb',
        sky: '#0a84ff',
        tide: '#e7f0ff',
        coral: '#ff8a5b',
        pine: '#0f766e',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'IBM Plex Sans KR', 'sans-serif'],
        display: ['Fraunces', 'serif'],
      },
      boxShadow: {
        card: '0 24px 60px rgba(15, 23, 42, 0.08)',
        soft: '0 12px 30px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(10, 132, 255, 0.28)' },
          '100%': { boxShadow: '0 0 0 18px rgba(10, 132, 255, 0)' },
        },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
};
