const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const getActiveTimezone = (timezone) => {
  if (typeof timezone === "string" && timezone.trim().length > 0) {
    return timezone.trim();
  }
  return DEFAULT_TIMEZONE;
};

export const formatScheduleTime = (time, _timezone, { includeZone = false } = {}) => {
  if (!time) {
    return "Not set";
  }

  const parts = time.split(":");
  if (parts.length < 2) {
    return time;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteText = minutes.toString().padStart(2, "0");

  const formatted = `${hour12}:${minuteText} ${period}`;

  if (includeZone && _timezone) {
    return `${formatted} (${_timezone})`;
  }

  return formatted;
};

export const formatDateTimeForTimezone = (
  value,
  timezone,
  { includeZone = false } = {},
) => {
  // Handle different input types
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    // Check if string has timezone indicator (Z, +HH:MM, or -HH:MM)
    const hasTimezone = value.endsWith("Z") || 
                       /[+-]\d{2}:\d{2}$/.test(value) ||
                       /[+-]\d{4}$/.test(value);
    
    if (hasTimezone) {
      // Has timezone, parse directly
      date = new Date(value);
    } else {
      // No timezone indicator - assume UTC and append Z
      // Handle both with and without milliseconds
      const cleanValue = value.trim();
      if (cleanValue.includes("T")) {
        date = new Date(cleanValue + "Z");
      } else {
        // If it's just a date, treat as UTC midnight
        date = new Date(cleanValue + "T00:00:00Z");
      }
    }
  } else {
    date = new Date(value);
  }
  
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const tz = getActiveTimezone(timezone);

  try {
    // Use 'en-US' locale to ensure consistent formatting
    const datePart = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    const zoneLabel =
      includeZone && timezone && timezone !== "UTC" ? ` (${timezone})` : "";

    return `${datePart} · ${timePart}${zoneLabel}`;
  } catch (error) {
    console.error("Timezone formatting error:", error, value, timezone);
    return date.toLocaleString();
  }
};

export const getDisplayTimezone = (timezone) => {
  if (timezone && timezone !== "UTC") {
    return timezone;
  }
  return null;
};

export const USER_LOCAL_TIMEZONE = DEFAULT_TIMEZONE;

