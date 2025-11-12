/**
 * Data sanitization utilities for production safety
 * Ensures all data from API responses or storage is properly typed
 */

/**
 * Sanitizes a user object to ensure all fields are properly typed
 */
export const sanitizeUser = (user) => {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return {
    ...user,
    id: String(user.id || ''),
    email: String(user.email || ''),
    name: String(user.name || ''),
    goals: String(user.goals || ''),
    active: Boolean(user.active),
    personalities: Array.isArray(user.personalities) 
      ? user.personalities.map(sanitizePersonality)
      : [],
    schedule: sanitizeSchedule(user.schedule || {}),
    current_personality_index: typeof user.current_personality_index === 'number' 
      ? user.current_personality_index 
      : 0,
  };
};

/**
 * Sanitizes a personality object
 */
export const sanitizePersonality = (personality) => {
  if (!personality) return null;
  
  if (typeof personality === 'string') {
    return { type: 'custom', value: personality, active: true };
  }
  
  if (typeof personality !== 'object') {
    return null;
  }

  return {
    id: String(personality.id || ''),
    type: ['famous', 'tone', 'custom'].includes(personality.type) 
      ? personality.type 
      : 'custom',
    value: String(personality.value || ''),
    active: Boolean(personality.active !== false),
    created_at: personality.created_at || new Date().toISOString(),
  };
};

/**
 * Sanitizes a schedule object
 */
export const sanitizeSchedule = (schedule) => {
  if (!schedule || typeof schedule !== 'object') {
    return {
      frequency: 'daily',
      times: ['09:00'],
      timezone: 'UTC',
      paused: false,
      skip_next: false,
      custom_days: [],
      custom_interval: 1,
      monthly_dates: [],
    };
  }

  return {
    frequency: ['daily', 'weekly', 'monthly', 'custom'].includes(schedule.frequency)
      ? schedule.frequency
      : 'daily',
    times: Array.isArray(schedule.times) && schedule.times.length > 0
      ? schedule.times.filter(t => typeof t === 'string')
      : (schedule.time && typeof schedule.time === 'string' ? [schedule.time] : ['09:00']),
    timezone: typeof schedule.timezone === 'string' ? schedule.timezone : 'UTC',
    paused: Boolean(schedule.paused),
    skip_next: Boolean(schedule.skip_next),
    custom_days: Array.isArray(schedule.custom_days) 
      ? schedule.custom_days.filter(d => typeof d === 'string')
      : [],
    custom_interval: typeof schedule.custom_interval === 'number' && schedule.custom_interval > 0
      ? schedule.custom_interval
      : 1,
    monthly_dates: Array.isArray(schedule.monthly_dates)
      ? schedule.monthly_dates.filter(d => typeof d === 'number' && d >= 1 && d <= 31)
      : [],
  };
};

/**
 * Sanitizes a message object
 */
export const sanitizeMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return null;
  }

  return {
    ...message,
    id: String(message.id || ''),
    email: String(message.email || ''),
    subject: String(message.subject || ''),
    message: String(message.message || ''),
    personality: sanitizePersonality(message.personality),
    sent_at: message.sent_at || new Date().toISOString(),
    rating: typeof message.rating === 'number' ? message.rating : null,
    used_fallback: Boolean(message.used_fallback),
  };
};

/**
 * Sanitizes an array of messages
 */
export const sanitizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map(sanitizeMessage).filter(Boolean);
};

/**
 * Sanitizes filter object
 */
export const sanitizeFilter = (filter) => {
  if (!filter || typeof filter !== 'object') {
    return {
      email: '',
      personality: '',
      startDate: '',
      endDate: '',
    };
  }

  return {
    email: typeof filter.email === 'string' ? filter.email : '',
    personality: typeof filter.personality === 'string' 
      ? filter.personality 
      : (filter.personality?.value || filter.personality?.name || ''),
    startDate: typeof filter.startDate === 'string' ? filter.startDate : '',
    endDate: typeof filter.endDate === 'string' ? filter.endDate : '',
  };
};

/**
 * Safely parses JSON from localStorage/sessionStorage
 */
export const safeParseStorage = (key, defaultValue = null) => {
  try {
    const item = window.localStorage?.getItem(key) || window.sessionStorage?.getItem(key);
    if (!item) return defaultValue;
    const parsed = JSON.parse(item);
    return parsed;
  } catch (error) {
    console.warn(`Failed to parse storage key "${key}":`, error);
    // Clear corrupted data
    try {
      window.localStorage?.removeItem(key);
      window.sessionStorage?.removeItem(key);
    } catch {}
    return defaultValue;
  }
};

/**
 * Safely sets data in storage
 */
export const safeSetStorage = (key, value, useSession = false) => {
  try {
    const storage = useSession ? window.sessionStorage : window.localStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Failed to set storage key "${key}":`, error);
    return false;
  }
};

