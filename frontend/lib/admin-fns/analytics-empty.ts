import type { AdminFn } from './index';

/** Kyriq has no product-events table yet: these return DepthMe's empty shapes. */
export const eventsQuery: AdminFn = async () => ({ events: [], summary: [] });

export const landingQuery: AdminFn = async () => ({
  totalViews: 0, totalSessions: 0, byAngle: [], sectionFunnel: [], ctaClicks: [],
});

export const visitorsQuery: AdminFn = async () => ({
  totalVisitors: 0, signups: 0, convertedSessions: 0, bounced: 0, conversionPct: 0,
  byChannel: [], bySource: [], byCountry: [], byTimezone: [],
});

export const activityByHour: AdminFn = async (body) => ({
  byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  peak: 0, warmHours: [], total: 0, days: Number(body.days) || 21,
});
