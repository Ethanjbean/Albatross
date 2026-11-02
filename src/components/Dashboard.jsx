import { useEffect, useState } from "react"
import { useNavigate, NavLink  } from "react-router-dom"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Home, LogOutIcon, PlusIcon, PlusCircle, Trophy, BarChart3, User } from "lucide-react";
import GoalsCard from "./GoalsCard";
import { API_URL } from '../config'


export default function Dashboard({ user, onLogout }) {
  const [rounds, setRounds] = useState([])
  const [round20, setRound20] = useState([])
  const [stats, setStats] = useState({
    rounds_played: 0,
    best_score: "-",
    avg_score: "-"
  })
  const [targets, setTargets] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
  const fetchRounds = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rounds/lim8`, {
        headers: {
          Authorization: localStorage.getItem("token")
        }
      })

      const data = await res.json()
      console.log("LIM8 DATA FROM BACKEND: ", data)

      if (res.ok) {
        setRounds(data)
      } else {
        console.log(data.error)
      }
    } catch (err) {
      console.log("Failed to fetch rounds")
    }
  }

  const fetchRounds20 = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rounds/lim20`, {
        headers: {
          Authorization: localStorage.getItem("token")
        }
      })

      const data = await res.json()
      console.log("LIM20 DATA FROM BACKEND: ", data)

      if (res.ok) {
        setRound20(data)
      } else {
        console.log(data.error)
      }
    } catch (err) {
      console.log("Failed to fetch rounds")
    }
  }

  const fetchStats = async () => {
    const res = await fetch(`${API_URL}/api/rounds/stats`, {
      headers: {
        Authorization: localStorage.getItem("token")
      }
    })
    const data = await res.json()

    if (res.ok) {
      setStats(data)
      console.log(data)
    }
    else{
      console.log(data.error)
    }
  }

  const fetchTargets = async () => {
            try {
                const res = await fetch(`${API_URL}/api/targets`, {
                    headers: {
                        Authorization: localStorage.getItem("token")
                    }
                })
                const data = await res.json()
                if(res.ok) {
                    setTargets({
                        score_goal: data.score_goal,
                        putt_goal: data.putt_goal,
                        fairway_goal: data.fairway_goal,
                        green_goal: data.green_goal
                    })
                }
            } catch(err) {
                console.log("failed to fetch targets")
            }
        }
  
  fetchRounds()
  fetchRounds20()
  fetchStats()
  fetchTargets()
}, [])


console.log("rounds state:", rounds);
console.log("scoreHistory mapped:", rounds.map(r => ({ date: r.date_played, score: r.total_score })));
  return (
    <div className="backdrop-primary">

      {/* Quick Actions Header */}
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="heading-augusta text-3xl">Welcome back, {user.username}</h1>
         <button
            onClick={onLogout}
            className="btn-primary">
            <LogOutIcon size={20}></LogOutIcon>
          </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Handicap (est.)</p>
                <p className="stat-augusta">{stats.handicap_index ?? "--"}</p>
            </div>
            <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Best Score</p>
                <p className="stat-augusta">{stats.best_score}</p>
            </div>
            <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Avg Score</p>
                <p className="stat-augusta">{stats.avg_score}</p>
            </div>
      </div>
      <div className="grid grid-cols-1 gap-4 mb-4">
  <div className="card-augusta p-6">
    <p className="label-augusta mb-4">Score Trend</p>
    <div className="h-64">
  {rounds.length === 0 ? (
    <p className="text-muted text-sm">No rounds logged yet.</p>
  ) : (
    
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={rounds.map(r => ({ date: new Date(r.date_played).toLocaleDateString(), score: r.total_score }))}>
    <CartesianGrid strokeDasharray="3 3" stroke="#D9DED9" />
    <XAxis dataKey="date" tick={{ fontSize: 12 }}  />
    <YAxis tick={{ fontSize: 12 }} domain={['dataMin - 3', 'dataMax + 3' ]}/>
    <Tooltip />
    <ReferenceLine
      y={targets.score_goal}
      ifOverflow="extendDomain"
      stroke="#C9A646"
      strokeDasharray="4 4"
      label={{value: `Goal: ${targets.score_goal}`, position: 'insideTopRight', fill: '#C9A646', fontSize: 12}}
    />
    <Line type="monotone" dataKey="score" stroke="#1E6B4E" strokeWidth={2} dot={true}  />
  </LineChart>
</ResponsiveContainer>
  )}
</div>
  </div>
</div>
     <div className="grid grid-cols-1 mb-4">
      <button className="btn-primary" onClick={() => navigate("/start-round")}>
          <span className="flex items-center justify-center gap-2">
            <PlusIcon size={25} />
            Start New Round
          </span>
        </button>
</div>


      {/* Recent Rounds + Goals */}
      <div className="grid grid-cols-2 gap-4 mb-8">

        {/* Recent Rounds */}
        <div className="card-augusta p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="heading-augusta text-xl">Recent Rounds</h2>
            <button
            className="btn-primary"
            onClick = {() => navigate("/roundinfo")}
            > View All Scores</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-line label-augusta">
                <th className="pb-2">Course</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Score</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {rounds.length === 0 ? (
                <tr>
                    <td colSpan="3" className="py-3 text-muted">
                        No rounds logged yet.
                    </td>
                </tr>
              ) : (
                rounds.map((round) => (
                <tr key={round.id} className="border-b border-line hover:bg-fairway-hover">
                  <td className="py-2">{round.course_name}</td>
                  <td>{new Date(round.date_played).toLocaleDateString()}</td>
                  <td className="font-display text-lg font-semibold text-fairway-dark tabular-nums">{round.total_score}</td>
                </tr>


                ))
              )}
              </tbody>
              
          </table>
        </div>

        {/* Goals */}
        <GoalsCard targets={targets} rounds={rounds} onSaved={setTargets} />

        
        

      </div>
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-line shadow-[0_-2px_10px_rgba(11,61,46,0.06)]">
  <div className="grid grid-cols-5 max-w-2xl mx-auto">
    <button onClick={() => navigate("/")} className="flex flex-col items-center justify-center py-3 gap-1 text-fairway hover:text-fairway transition-colors">
      <Home size={20} />
      <span className="text-xs font-medium">Dashboard</span>
    </button>
    <button onClick={() => navigate("/log-round")} className="flex flex-col items-center justify-center py-3 gap-1 text-muted hover:text-fairway transition-colors">
      <PlusCircle size={20} />
      <span className="text-xs font-medium">Log Round</span>
    </button>
    <button onClick={() => navigate("/leaderboard")} className="flex flex-col items-center justify-center py-3 gap-1 text-muted hover:text-fairway transition-colors">
      <Trophy size={20} />
      <span className="text-xs font-medium">Leaderboard</span>
    </button>
    <button onClick={() => navigate("/roundinfo")} className="flex flex-col items-center justify-center py-3 gap-1 text-muted hover:text-fairway transition-colors">
      <BarChart3 size={20} />
      <span className="text-xs font-medium">Stats</span>
    </button>
    <button onClick={() => navigate("/profile")} className="flex flex-col items-center justify-center py-3 gap-1 text-muted hover:text-fairway transition-colors">
      <User size={20} />
      <span className="text-xs font-medium">Profile</span>
    </button>
  </div>
</div>

    </div>
  )
}