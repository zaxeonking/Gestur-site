/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Hover hanya aktif di perangkat yang benar-benar punya pointer hover (tidak "menempel" di layar sentuh).
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        bg: '#121212',
        card: '#181818',
        raised: { DEFAULT: '#242424', hover: '#2e2e2e' },
        accent: {
          DEFAULT: '#1DB954',
          soft: '#1ed760',
          deep: '#169c46',
        },
        ink: {
          DEFAULT: '#ffffff',
          muted: '#a7a7a7',
          // Dinaikkan dari #6a6a6a (±3.3:1) agar teks sekunder lolos kontras AA (≥4.5:1) di atas bg/card.
          faint: '#8a8a8a',
        },
        danger: '#ff6b6b',
        line: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      spacing: {
        sidebar: '17rem',
      },
      // Skala radius: kontrol = full, permukaan/kartu = lg, thumbnail & baris = md, sheet = 2xl (atas saja).
      boxShadow: {
        now: 'inset 3px 0 0 0 #1DB954',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'page-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'player-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'grow-right': {
          from: { opacity: '0', transform: 'translate3d(42%, 0, 0) scale(0.18)' },
          to: { opacity: '1', transform: 'none' },
        },
        'grow-left': {
          from: { opacity: '0', transform: 'translate3d(-42%, 0, 0) scale(0.18)' },
          to: { opacity: '1', transform: 'none' },
        },
        'bubble-in': {
          from: { opacity: '0', transform: 'scale(0.3)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sheet-expand': {
          '0%': { transform: 'translateY(100%) scale(0.94)', opacity: '0.4', borderRadius: '28px' },
          '60%': { opacity: '1' },
          '100%': { transform: 'none', opacity: '1', borderRadius: '0px' },
        },
        disc: { to: { transform: 'rotate(360deg)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'lyrics-up': { from: { opacity: '0', transform: 'translateY(100%)' }, to: { opacity: '1', transform: 'none' } },
        'panel-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out both',
        'page-in': 'page-in 200ms ease-out both',
        'player-up': 'player-up 220ms ease-out both',
        'grow-right': 'grow-right 340ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'grow-left': 'grow-left 340ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'bubble-in': 'bubble-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'sheet-expand': 'sheet-expand 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        disc: 'disc 18s linear infinite',
        'sheet-up': 'sheet-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'lyrics-up': 'lyrics-up 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'panel-in': 'panel-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
