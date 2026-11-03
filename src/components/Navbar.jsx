// Footer.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { Home, PlusCircle, Trophy, BarChart3, User } from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/Stats", label: "Stats", icon: BarChart3 },
  { path: "/Target", label: "Profile", icon: User },
];

const hiddenPaths = ["/login", "/register"];

export default function Footer() {
  const navigate = useNavigate();
  const location = useLocation();


  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-line shadow-[0_-2px_10px_rgba(11,61,46,0.06)]">
      <div className="grid grid-cols-4 max-w-2xl mx-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          // Routes are case-insensitive, so compare lowercase. "/" only matches exactly.
          const here = location.pathname.toLowerCase();
          const active = path === "/" ? here === "/" : here.startsWith(path.toLowerCase());
          return (
          <button
            key={path}
            onClick={() => navigate(path)}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center py-3 gap-3 transition-colors ${
              active ? "text-fairway-dark" : "text-muted hover:text-fairway"
            }`}
          >
            {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gold" />}
            <Icon size={20} />
            <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}