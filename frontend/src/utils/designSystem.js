/**
 * Design System Constants
 * Centralized design tokens for consistent UI across the dashboard
 */

export const DESIGN_TOKENS = {
  // Typography Scale
  typography: {
    // Headings
    h1: {
      mobile: 'text-2xl',
      tablet: 'text-3xl',
      desktop: 'text-3xl',
      weight: 'font-semibold',
      tracking: 'tracking-tight',
      lineHeight: 'leading-tight'
    },
    h2: {
      mobile: 'text-xl',
      tablet: 'text-2xl',
      desktop: 'text-2xl',
      weight: 'font-semibold',
      tracking: 'tracking-tight',
      lineHeight: 'leading-tight'
    },
    h3: {
      mobile: 'text-lg',
      tablet: 'text-xl',
      desktop: 'text-xl',
      weight: 'font-semibold',
      tracking: 'tracking-tight',
      lineHeight: 'leading-tight'
    },
    // Body text
    body: {
      mobile: 'text-sm',
      tablet: 'text-base',
      desktop: 'text-base',
      weight: 'font-normal',
      lineHeight: 'leading-relaxed'
    },
    // Small text
    small: {
      mobile: 'text-xs',
      tablet: 'text-xs',
      desktop: 'text-sm',
      weight: 'font-normal',
      lineHeight: 'leading-normal'
    },
    // Labels
    label: {
      mobile: 'text-xs',
      tablet: 'text-xs',
      desktop: 'text-sm',
      weight: 'font-medium',
      lineHeight: 'leading-normal'
    }
  },

  // Icon Sizes
  icons: {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8',
    // Responsive
    responsive: {
      mobile: 'h-5 w-5',
      tablet: 'h-5 w-5',
      desktop: 'h-4 w-4'
    }
  },

  // Spacing Scale
  spacing: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
    xl: 'gap-6',
    // Responsive gaps
    responsive: {
      mobile: 'gap-2',
      tablet: 'gap-3',
      desktop: 'gap-4'
    }
  },

  // Padding Scale
  padding: {
    card: {
      mobile: 'p-4',
      tablet: 'p-5',
      desktop: 'p-6'
    },
    button: {
      mobile: 'px-4 py-2.5',
      tablet: 'px-4 py-2.5',
      desktop: 'px-4 py-2'
    }
  },

  // Touch Targets (Mobile)
  touchTargets: {
    minimum: 'min-h-[44px] min-w-[44px]',
    button: 'h-11 sm:h-9',
    icon: 'h-11 w-11 sm:h-9 sm:w-9'
  },

  // Border Radius
  radius: {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    full: 'rounded-full'
  },

  // Shadows
  shadows: {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl'
  },

  // Transitions
  transitions: {
    fast: 'duration-150',
    normal: 'duration-200',
    slow: 'duration-300',
    easing: 'ease-out'
  }
};

/**
 * Get responsive class string
 */
export function getResponsiveClass(base, mobile, tablet, desktop) {
  return `${base} ${mobile} sm:${tablet} lg:${desktop}`;
}

/**
 * Standard card padding classes
 */
export function getCardPadding() {
  return 'p-4 sm:p-5 lg:p-6';
}

/**
 * Standard icon size classes
 */
export function getIconSize(size = 'md') {
  const sizes = {
    xs: 'h-3 w-3 sm:h-3.5 sm:w-3.5',
    sm: 'h-4 w-4 sm:h-4 sm:w-4',
    md: 'h-5 w-5 sm:h-5 sm:w-5',
    lg: 'h-6 w-6 sm:h-6 sm:w-6',
    xl: 'h-8 w-8 sm:h-10 sm:w-10'
  };
  return sizes[size] || sizes.md;
}

/**
 * Standard text size classes
 */
export function getTextSize(size = 'body') {
  const sizes = {
    xs: 'text-xs',
    sm: 'text-sm sm:text-sm',
    body: 'text-sm sm:text-base',
    lg: 'text-base sm:text-lg',
    xl: 'text-lg sm:text-xl'
  };
  return sizes[size] || sizes.body;
}

