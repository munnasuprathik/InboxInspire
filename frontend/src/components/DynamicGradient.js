import { useEffect, useState } from 'react';

/**
 * Dynamic Gradient Component
 * Creates time-based mesh gradients that change throughout the day
 * - Warm sunrise colors in the morning (6-9 AM)
 * - Bright daylight colors (9 AM - 5 PM)
 * - Warm sunset colors (5-8 PM)
 * - Cool deep blues at night (8 PM - 6 AM)
 */
export function DynamicGradient() {
  const [gradient, setGradient] = useState(getTimeBasedGradient());

  useEffect(() => {
    // Update gradient every minute
    const interval = setInterval(() => {
      setGradient(getTimeBasedGradient());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  function getTimeBasedGradient() {
    const now = new Date();
    const hour = now.getHours();
    
    // Morning (6-9 AM) - Warm sunrise colors
    if (hour >= 6 && hour < 9) {
      const progress = (hour - 6) / 3; // 0 to 1
      return {
        colors: [
          `rgba(255, ${200 + progress * 55}, ${150 + progress * 50}, 0.15)`, // Warm orange to yellow
          `rgba(255, ${180 + progress * 75}, ${100 + progress * 100}, 0.12)`, // Peach to light orange
          `rgba(255, ${220 + progress * 35}, ${180 + progress * 40}, 0.10)`, // Light pink to cream
        ],
        positions: [
          { x: '0%', y: '0%' },
          { x: '100%', y: '20%' },
          { x: '50%', y: '100%' },
        ]
      };
    }
    
    // Daytime (9 AM - 5 PM) - Bright, clear colors
    if (hour >= 9 && hour < 17) {
      return {
        colors: [
          'rgba(135, 206, 250, 0.08)', // Light sky blue
          'rgba(255, 255, 255, 0.06)', // White
          'rgba(230, 240, 255, 0.07)', // Very light blue
        ],
        positions: [
          { x: '0%', y: '0%' },
          { x: '100%', y: '0%' },
          { x: '50%', y: '100%' },
        ]
      };
    }
    
    // Evening (5-8 PM) - Warm sunset colors
    if (hour >= 17 && hour < 20) {
      const progress = (hour - 17) / 3; // 0 to 1
      return {
        colors: [
          `rgba(255, ${200 - progress * 50}, ${150 - progress * 50}, 0.12)`, // Orange to deep orange
          `rgba(255, ${180 - progress * 80}, ${100 - progress * 100}, 0.10)`, // Peach to deep orange
          `rgba(255, ${140 - progress * 40}, ${80 - progress * 30}, 0.08)`, // Coral to deep orange
        ],
        positions: [
          { x: '0%', y: '0%' },
          { x: '100%', y: '30%' },
          { x: '50%', y: '100%' },
        ]
      };
    }
    
    // Night (8 PM - 6 AM) - Cool deep blues
    return {
      colors: [
        'rgba(25, 25, 112, 0.10)', // Midnight blue
        'rgba(0, 0, 139, 0.08)', // Dark blue
        'rgba(25, 25, 50, 0.12)', // Very dark blue
      ],
      positions: [
        { x: '0%', y: '0%' },
        { x: '100%', y: '0%' },
        { x: '50%', y: '100%' },
      ]
    };
  }

  return (
    <div 
      className="fixed inset-0 -z-10 pointer-events-none transition-all duration-[3000ms] ease-in-out"
      style={{
        background: `
          radial-gradient(circle at ${gradient.positions[0].x} ${gradient.positions[0].y}, ${gradient.colors[0]} 0%, transparent 50%),
          radial-gradient(circle at ${gradient.positions[1].x} ${gradient.positions[1].y}, ${gradient.colors[1]} 0%, transparent 50%),
          radial-gradient(circle at ${gradient.positions[2].x} ${gradient.positions[2].y}, ${gradient.colors[2]} 0%, transparent 50%)
        `,
        backgroundAttachment: 'fixed',
      }}
    />
  );
}

