import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1200px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        /* Respiracao do personagem parado. Sem isso a trilha parece uma foto. */
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        /* Salto entre nos. O squash e o stretch dao peso ao pulo sem biblioteca. */
        pulo: {
          '0%': { transform: 'translate(var(--pulo-x), var(--pulo-y)) scale(1.12, 0.88)' },
          '30%': {
            transform:
              'translate(calc(var(--pulo-x) * 0.5), calc(var(--pulo-y) * 0.5 - 24px)) scale(0.88, 1.16)',
          },
          '70%': { transform: 'translate(0, 0) scale(1.16, 0.84)' },
          '85%': { transform: 'translate(0, -4px) scale(0.96, 1.04)' },
          '100%': { transform: 'translate(0, 0) scale(1, 1)' },
        },
        pulso: {
          '0%': { transform: 'translate(-50%, -50%) scale(1)', opacity: '0.6' },
          '100%': { transform: 'translate(-50%, -50%) scale(1.55)', opacity: '0' },
        },
        balanco: {
          '0%, 100%': { transform: 'translate(-50%, -50%) rotate(-6deg)' },
          '50%': { transform: 'translate(-50%, -50%) rotate(6deg)' },
        },
        /* Uma fatia do giro do baú. Fica visível só durante a própria fatia:
           antes do delay a classe `opacity-0` manda, depois o `forwards`
           segura o 100%. Assim as fatias se revezam sem nenhum timer em JS. */
        giro: {
          '0%, 99%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        bob: 'bob 2.6s ease-in-out infinite',
        pulo: 'pulo 0.6s cubic-bezier(0.33, 1, 0.68, 1) 1',
        pulso: 'pulso 1.8s ease-out infinite',
        balanco: 'balanco 2.8s ease-in-out infinite',
        giro: 'giro 0.1s linear 1 forwards',
      },
    },
  },
  plugins: [animate],
} satisfies Config
