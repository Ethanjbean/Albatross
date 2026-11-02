// Normalizes course names so the same course always produces the same key,
// regardless of casing, accents, punctuation, or spacing.
//
//   normalizeName("  St. Andrews — Old Course ")   -> "st andrews old course"
//   normalizeName("Pinehurst No. 2")               -> "pinehurst no 2"
//   normalizeName("Bandon Dunes Golf Resort", { stripSuffixes: true }) -> "bandon dunes"
//
// Default output is safe for cache keys / DB lookups. `stripSuffixes` is lossier
// (it can merge "X Golf Club" and "X Country Club"), so only use it for fuzzy
// matching against search results, never as a primary key.

const SUFFIXES = [
  'golf and country club',
  'golf & country club',
  'country club',
  'golf club',
  'golf course',
  'golf links',
  'golf resort',
  'golf and resort',
  'resort',
  'links',
  'gc',
  'cc',
]

export function normalizeName(name, { stripSuffixes = false } = {}) {
  if (name == null) return ''

  let s = String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop accents: "Château" -> "Chateau"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’`]/g, '') // "O'Brien's" -> "obriens", not "o brien s"
    .replace(/[^a-z0-9]+/g, ' ') // everything else (dashes, dots, commas) -> space
    .replace(/\s+/g, ' ')
    .trim()

  if (stripSuffixes) {
    for (const suffix of SUFFIXES) {
      const tail = ' ' + normalizeName(suffix)
      if (s.endsWith(tail) && s.length > tail.length) {
        s = s.slice(0, -tail.length).trim()
        break // only strip one suffix
      }
    }
  }

  return s
}

export default normalizeName
