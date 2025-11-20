import confetti from 'canvas-confetti';

/**
 * Haptic-like Visual Feedback Utility
 * Provides full-screen confetti explosion and screen shake animation
 * to simulate haptic feedback on web
 */

/**
 * Triggers a full-screen confetti explosion
 * @param {Object} options - Configuration options
 * @param {number} options.particleCount - Number of confetti particles (default: 200)
 * @param {number} options.spread - Spread angle in degrees (default: 70)
 * @param {number} options.originY - Y origin position (default: 0.6)
 * @param {string} options.type - Type of celebration: 'goal', 'streak', 'achievement' (default: 'achievement')
 */
export function triggerConfetti(options = {}) {
  const {
    particleCount = 200,
    spread = 70,
    originY = 0.6,
    type = 'achievement'
  } = options;

  // Different confetti styles based on type
  const confettiConfigs = {
    goal: {
      colors: ['#10b981', '#059669', '#34d399', '#6ee7b7'], // Green shades
      shapes: ['square', 'circle'],
      particleCount: 250,
      spread: 75
    },
    streak: {
      colors: ['#f59e0b', '#d97706', '#fbbf24', '#fcd34d'], // Orange/amber shades
      shapes: ['star', 'circle'],
      particleCount: 300,
      spread: 80
    },
    achievement: {
      colors: ['#eab308', '#facc15', '#fde047', '#fef08a'], // Yellow/gold shades
      shapes: ['star', 'circle'],
      particleCount: 200,
      spread: 70
    }
  };

  const config = confettiConfigs[type] || confettiConfigs.achievement;

  // Main burst from center
  confetti({
    particleCount: config.particleCount,
    angle: 60,
    spread: config.spread,
    origin: { x: 0.5, y: originY },
    colors: config.colors,
    shapes: config.shapes,
    gravity: 0.8,
    drift: 0.1,
    ticks: 200,
    decay: 0.94,
    scalar: 1.2
  });

  // Secondary burst from left
  setTimeout(() => {
    confetti({
      particleCount: Math.floor(config.particleCount * 0.6),
      angle: 120,
      spread: config.spread * 0.8,
      origin: { x: 0.2, y: originY },
      colors: config.colors,
      shapes: config.shapes,
      gravity: 0.8,
      drift: -0.1,
      ticks: 200,
      decay: 0.94,
      scalar: 1.0
    });
  }, 100);

  // Tertiary burst from right
  setTimeout(() => {
    confetti({
      particleCount: Math.floor(config.particleCount * 0.6),
      angle: 60,
      spread: config.spread * 0.8,
      origin: { x: 0.8, y: originY },
      colors: config.colors,
      shapes: config.shapes,
      gravity: 0.8,
      drift: 0.1,
      ticks: 200,
      decay: 0.94,
      scalar: 1.0
    });
  }, 200);

  // Final burst from top
  setTimeout(() => {
    confetti({
      particleCount: Math.floor(config.particleCount * 0.4),
      angle: 90,
      spread: 55,
      origin: { x: 0.5, y: 0.1 },
      colors: config.colors,
      shapes: config.shapes,
      gravity: 1.2,
      ticks: 150,
      decay: 0.96,
      scalar: 0.8
    });
  }, 300);
}

/**
 * Triggers a screen shake animation
 * @param {Object} options - Configuration options
 * @param {number} options.intensity - Shake intensity in pixels (default: 10)
 * @param {number} options.duration - Duration in milliseconds (default: 500)
 */
export function triggerScreenShake(options = {}) {
  const {
    intensity = 10,
    duration = 500
  } = options;

  const body = document.body;
  const html = document.documentElement;
  
  // Store original styles
  const originalBodyTransform = body.style.transform;
  const originalHtmlTransform = html.style.transform;
  const originalBodyTransition = body.style.transition;
  const originalHtmlTransition = html.style.transition;

  // Create CSS keyframe animation dynamically
  const animationName = 'screen-shake-' + Date.now();
  const styleSheet = document.createElement('style');
  
  // Generate random shake keyframes
  const keyframes = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    if (i === steps) {
      keyframes.push(`${progress * 100}% { transform: translate(0px, 0px); }`);
    } else {
      const x = (Math.random() - 0.5) * 2 * intensity;
      const y = (Math.random() - 0.5) * 2 * intensity;
      keyframes.push(`${progress * 100}% { transform: translate(${x}px, ${y}px); }`);
    }
  }

  styleSheet.textContent = `
    @keyframes ${animationName} {
      ${keyframes.join('\n      ')}
    }
  `;
  document.head.appendChild(styleSheet);

  // Apply animation
  body.style.animation = `${animationName} ${duration}ms ease-out`;
  html.style.animation = `${animationName} ${duration}ms ease-out`;

  // Clean up after animation
  setTimeout(() => {
    body.style.animation = '';
    html.style.animation = '';
    body.style.transform = originalBodyTransform;
    html.style.transform = originalHtmlTransform;
    body.style.transition = originalBodyTransition;
    html.style.transition = originalHtmlTransition;
    document.head.removeChild(styleSheet);
  }, duration);
}

/**
 * Combined haptic-like feedback: confetti + screen shake
 * @param {Object} options - Configuration options
 * @param {string} options.type - Type: 'goal', 'streak', 'achievement'
 * @param {boolean} options.withShake - Whether to include screen shake (default: true)
 * @param {boolean} options.withConfetti - Whether to include confetti (default: true)
 */
export function triggerHapticFeedback(options = {}) {
  const {
    type = 'achievement',
    withShake = true,
    withConfetti = true
  } = options;

  if (withConfetti) {
    triggerConfetti({ type });
  }

  if (withShake) {
    // Delay shake slightly to sync with confetti
    setTimeout(() => {
      triggerScreenShake({
        intensity: type === 'streak' ? 12 : type === 'goal' ? 10 : 8,
        duration: type === 'streak' ? 600 : 500
      });
    }, 100);
  }
}

/**
 * Trigger celebration for goal completion
 */
export function celebrateGoalCompletion() {
  triggerHapticFeedback({
    type: 'goal',
    withShake: true,
    withConfetti: true
  });
}

/**
 * Trigger celebration for streak milestone
 */
export function celebrateStreakMilestone() {
  triggerHapticFeedback({
    type: 'streak',
    withShake: true,
    withConfetti: true
  });
}

/**
 * Trigger celebration for achievement unlock
 */
export function celebrateAchievement() {
  triggerHapticFeedback({
    type: 'achievement',
    withShake: true,
    withConfetti: true
  });
}

