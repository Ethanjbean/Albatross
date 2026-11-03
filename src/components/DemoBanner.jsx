import { Eye } from "lucide-react";

// Shown across the top of every page while browsing the read-only demo, so a
// save that gets refused doesn't look like a broken app.
export default function DemoBanner({ onExit, onSignUp }) {
  return (
    <div className="bg-gold/15 border-b border-gold/40 text-ink">
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-2">
          <Eye size={16} className="text-fairway-dark shrink-0" />
          <span>
            <span className="font-semibold">Demo mode.</span>{" "}
            Look around freely. Changes won't be saved.
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button onClick={onSignUp} className="font-semibold text-fairway hover:text-fairway-dark">
            Create an account
          </button>
          <button onClick={onExit} className="text-muted hover:text-ink">
            Exit demo
          </button>
        </div>
      </div>
    </div>
  );
}
