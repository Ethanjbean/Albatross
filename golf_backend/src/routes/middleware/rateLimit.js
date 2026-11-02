
// src/routes/middleware/rateLimit.js
// Rate limiters for the ryzegolf course lookup, using express-rate-limit.
// Must run AFTER verifyToken, since perUser keys off req.user.id.

import { rateLimit } from 'express-rate-limit';

// Per user: 20 lookups per 15 minutes (override with LOOKUP_LIMIT_PER_USER)
export const perUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOOKUP_LIMIT_PER_USER) || 20,
  keyGenerator: (req) => String(req.user.id),
  standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers
  legacyHeaders: false,       // no X-RateLimit-* headers
  message: { error: 'Too many course lookups. Try again in a few minutes.' },
});

// Everyone combined: hard ceiling under the 10k/day ryzegolf quota
// (override with LOOKUP_LIMIT_GLOBAL_DAILY)
export const globalDaily = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number(process.env.LOOKUP_LIMIT_GLOBAL_DAILY) || 500,
  keyGenerator: () => 'global',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Course lookup is at its daily limit. Try again tomorrow.' },
});