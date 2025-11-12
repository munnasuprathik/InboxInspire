/**
 * Utility functions to safely render values in React
 * Prevents "Objects are not valid as a React child" errors
 */

/**
 * Safely converts a value to a string for rendering
 */
export const safeString = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    // If it's an object with a value property, use that
    if ('value' in value && typeof value.value === 'string') return value.value;
    // If it's an object with a name property, use that
    if ('name' in value && typeof value.name === 'string') return value.name;
    // If it's an object with a text property, use that
    if ('text' in value && typeof value.text === 'string') return value.text;
    // Otherwise, try to stringify (for debugging)
    try {
      return JSON.stringify(value).substring(0, 50);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

/**
 * Safely extracts a value from an object for Select components
 */
export const safeSelectValue = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    // Check common object patterns
    if ('value' in value && typeof value.value === 'string') return value.value;
    if ('name' in value && typeof value.name === 'string') return value.name;
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('id' in value && typeof value.id === 'string') return value.id;
    // If it's a timezone-like object
    if ('timeZone' in value && typeof value.timeZone === 'string') return value.timeZone;
    // Handle objects with use_default_config/config (likely from a library)
    if ('use_default_config' in value || 'config' in value) {
      // Try to extract a meaningful value
      if ('name' in value && typeof value.name === 'string') return value.name;
      if ('text' in value && typeof value.text === 'string') return value.text;
      if ('value' in value && typeof value.value === 'string') return value.value;
      return fallback;
    }
    return fallback;
  }
  return fallback;
};

/**
 * Safely renders a personality value
 */
export const safePersonalityValue = (personality) => {
  if (!personality) return 'Unknown';
  if (typeof personality === 'string') return personality;
  if (typeof personality === 'object') {
    return personality.value || personality.name || 'Unknown';
  }
  return 'Unknown';
};

