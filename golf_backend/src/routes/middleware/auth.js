import jwt from 'jsonwebtoken'
import { DEMO_READ_ONLY_MESSAGE } from '../../utils/demo.js'

// Requests that only read data. Everything else is a write.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader) return res.status(401).json({ error: 'No token provided' })

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Demo tokens are read-only. Enforced here, not in the UI, so it covers
  // every protected route (including ones added later) and can't be bypassed
  // by sending requests by hand.
  if (decoded.demo && !READ_METHODS.has(req.method)) {
    return res.status(403).json({ error: DEMO_READ_ONLY_MESSAGE })
  }

  req.user = decoded
  next()
}
