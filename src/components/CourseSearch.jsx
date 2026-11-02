import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const normalize = s =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "");

const MAX_RESULTS = 15;

export default function CourseSearch({ onRequestCourse }) {
  const [courses, setCourses] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const navigate = useNavigate();
  const itemRefs = useRef([]);

  useEffect(() => {
    fetch("/courses-search.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCourses)
      .catch(() => setLoadError(true));
  }, []);

  const trimmed = deferredQuery.trim();

  const results = useMemo(() => {
    const q = normalize(deferredQuery).trim();
    if (q.length < 2) return [];
    const starts = [];
    const contains = [];
    for (const c of courses) {
      if (c.n.startsWith(q)) starts.push(c);
      else if (c.n.includes(q)) contains.push(c);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [deferredQuery, courses]);

  // Keep the highlighted row visible during arrow-key navigation
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // OSM ids look like "way/29357224", so the URL becomes /log-round/way/29357224.
  // The id is all the log-round page needs; the backend looks up the name itself.
  function choose(course) {
    navigate(`/log-round/${course.id}`);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showResults = open && results.length > 0;
  const showEmpty = open && !loadError && courses.length > 0 && trimmed.length >= 2 && results.length === 0;

  return (
    <div className="relative w-full">
      <Search
        size={20}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
      <input
        autoFocus
        role="combobox"
        aria-expanded={showResults}
        aria-controls="course-search-results"
        aria-autocomplete="list"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search for a course..."
        className="input-augusta w-full rounded-xl py-3 pl-12 pr-4 text-lg placeholder:text-muted/70"
      />

      {loadError && (
        <p className="mt-2 text-sm text-red-600">
          Couldn't load the course list. Refresh the page to try again.
        </p>
      )}

      {showResults && (
        <ul
          id="course-search-results"
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border border-line
                     bg-white shadow-card"
        >
          {results.map((c, i) => (
            <li
              key={c.id}
              ref={el => (itemRefs.current[i] = el)}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => choose(c)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between px-4 py-3 text-left
                          ${i === active ? "bg-fairway-light" : ""} ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span className="font-medium text-ink">{c.name}</span>
              <span className="ml-4 shrink-0 text-sm text-muted">
                {[c.city, c.state].filter(Boolean).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-line bg-white px-4 py-3 shadow-card">
          <p className="text-muted">No courses match "{trimmed}".</p>
          {onRequestCourse && (
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                onRequestCourse(trimmed);
              }}
              className="mt-1 text-sm font-medium text-fairway hover:underline"
            >
              Request this course
            </button>
          )}
        </div>
      )}
    </div>
  );
}