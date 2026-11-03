import { useState } from "react";
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login';
import Dashboard from "./components/Dashboard";
import Loground from "./components/Loground";
import Register from "./components/Register";
import Roundinfo from "./components/roundinfo";
import Target from "./components/Target";
import Footer from "./components/Navbar";
import Stats from "./components/Stats";
import StartRound from "./components/Start-round";
import RoundScorecard from "./components/RoundScorecard";
import EditRound from "./components/EditRound";
import Leaderboard from "./components/Leaderboard";
import DemoBanner from "./components/DemoBanner";
import { Star } from "lucide-react";

// Rebuild the logged-in user from the saved JWT so a page refresh doesn't log
// you out. This only reads the token's payload; it doesn't verify it. The
// backend still checks the signature on every API call.
function userFromToken() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("token"); // expired (7 days, or 1 hour for the demo)
      return null;
    }
    return { username: payload.username, demo: payload.demo === true };
  } catch {
    return null; // missing, garbled, or storage blocked
  }
}

export default function App(){
  const [user, setUser] = useState(userFromToken);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    setUser(null)
  }

  // From the demo banner: leave the demo and land on the register form.
  const handleDemoSignUp = () => {
    handleLogout()
    setShowRegister(true)
  }

  const getAuthScreen = () => {
    if(showRegister) {
      return <Register onSwitch={() => setShowRegister(false)} />
    }
    return <Login onLogin={handleLogin} onSwitch={() => setShowRegister(true)} />
  }

  return (
    <>
    {user?.demo && <DemoBanner onExit={handleLogout} onSignUp={handleDemoSignUp} />}
    <Routes>
      <Route path="/" element={
        user ? <Dashboard user={user} onLogout={handleLogout} /> : getAuthScreen() 
      }/>
      <Route path="/log-round/:osmType/:osmNum" element={
        user ? <Loground /> : <Navigate to="/" />
      }/>
      <Route path="/rounds/:id" element={
        user ? <RoundScorecard /> : <Navigate to="/" />
      }/>
      <Route path="/rounds/:id/edit" element={
        user ? <EditRound /> : <Navigate to="/" />
      }/>
      <Route path="/roundinfo" element={
        user ? <Roundinfo /> : <Navigate to="/" />
      }/>
      <Route path="/target" element={
        user ? <Target /> : <Navigate to="/" />
      }/>
      <Route path="/stats" element ={
        user ? <Stats /> : <Navigate to="/" />
      }/>
      <Route path="/leaderboard" element={
        user ? <Leaderboard /> : <Navigate to="/" />
      }/>
      <Route path="/start-round" element={
        user ? <StartRound /> : <Navigate to="/" />
      } />
    </Routes>
     {user && <Footer />}
     </>
  )
}