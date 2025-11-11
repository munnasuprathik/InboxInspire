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
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const tz = getActiveTimezone(timezone);

  try {
    const datePart = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    const zoneLabel =
      includeZone && timezone && timezone !== "UTC" ? ` (${timezone})` : "";

    return `${datePart} · ${timePart}${zoneLabel}`;
  } catch {
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

