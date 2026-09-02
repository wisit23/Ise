/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Tokens live in app/globals.css as channel triplets; `<alpha-value>`
      // keeps opacity modifiers (bg-brand-600/10) working.
      colors: {
        brand: {
          50: "rgb(var(--color-brand-50) / <alpha-value>)",
          100: "rgb(var(--color-brand-100) / <alpha-value>)",
          200: "rgb(var(--color-brand-200) / <alpha-value>)",
          300: "rgb(var(--color-brand-300) / <alpha-value>)",
          400: "rgb(var(--color-brand-400) / <alpha-value>)",
          500: "rgb(var(--color-brand-500) / <alpha-value>)",
          600: "rgb(var(--color-brand-600) / <alpha-value>)",
          700: "rgb(var(--color-brand-700) / <alpha-value>)",
          800: "rgb(var(--color-brand-800) / <alpha-value>)",
          900: "rgb(var(--color-brand-900) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
          soft: "rgb(var(--color-success-soft) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          soft: "rgb(var(--color-warning-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          soft: "rgb(var(--color-danger-soft) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
          soft: "rgb(var(--color-info-soft) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          subtle: "rgb(var(--color-surface-subtle) / <alpha-value>)",
          panel: "rgb(var(--color-surface-panel) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--color-line) / <alpha-value>)",
          strong: "rgb(var(--color-line-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          muted: "rgb(var(--color-ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--color-ink-subtle) / <alpha-value>)",
        },
      },
      // Named stacking order. Ad-hoc values (z-30, z-50, z-[100]) had drifted
      // out of order — the confirm dialog opened *behind* the case drawer
      // because Modal sat at z-50 and the drawer at z-[100].
      zIndex: {
        nav: "30",
        dropdown: "60",
        drawer: "100",
        modal: "200",
        toast: "300",
      },
      /* Shape, depth and type scale ported from the RE-LOOP v2 design
         reference so the storefront speaks one visual language. Tailwind's
         defaults sit close to these but not on them, and the small
         differences were what made pages look assembled rather than
         designed. */
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "24px",
        xl: "32px",
      },
      boxShadow: {
        1: "0 1px 2px rgba(11,18,16,.05)",
        2: "0 4px 12px -2px rgba(11,18,16,.08), 0 2px 4px -2px rgba(11,18,16,.04)",
        3: "0 18px 40px -12px rgba(11,18,16,.18), 0 4px 10px -4px rgba(11,18,16,.06)",
        brand: "0 10px 30px -8px rgba(5,150,105,.45)",
      },
      fontSize: {
        xs: ".8125rem",
        sm: ".9063rem",
        base: "1rem",
        lg: "clamp(1.25rem,1.1rem + .6vw,1.5rem)",
        xl: "clamp(1.6rem,1.3rem + 1.4vw,2.25rem)",
        hero: "clamp(2.25rem,1.5rem + 3.4vw,4.25rem)",
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(.22,1,.36,1)",
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-thai)", "system-ui", "sans-serif"],
        display: [
          "var(--font-anuphan)",
          "var(--font-noto-sans-thai)",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        bob: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-9px)" },
        },
        swipe: { to: { transform: "scaleX(1)" } },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".4", transform: "scale(.75)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "dropdown-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "dropdown-out": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(8px) scale(0.95)" },
        },
      },
      animation: {
        bob: "bob 5s ease-in-out infinite",
        swipe: "swipe .9s .35s cubic-bezier(.22,1,.36,1) forwards",
        "pulse-dot": "pulse-dot 2s infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "slide-in-right": "slide-in-right 0.3s ease-out forwards",
        "slide-out-right": "slide-out-right 0.3s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "slide-out-left": "slide-out-left 0.3s ease-out forwards",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "fade-out": "fade-out 0.3s ease-out forwards",
        "dropdown-in": "dropdown-in 0.15s ease-out forwards",
        "dropdown-out": "dropdown-out 0.15s ease-in forwards",
      },
    },
  },
  plugins: [],
};
