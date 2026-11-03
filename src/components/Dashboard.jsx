import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LogOutIcon, PlusIcon } from "lucide-react";
import GoalsCard from "./GoalsCard";
import { niceAxis, TrendChart } from "./Statcharts";
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


  // Oldest -> newest for the trend line (copy, so the Recent Rounds table keeps its order).
  const trend = [...rounds]
    .filter(r => r.total_score != null)
    .sort((a, b) => new Date(a.date_played) - new Date(b.date_played))
    .map(r => ({ date: r.date_played, course: r.course_name, score: r.total_score }));
  const trendScores = trend.map(t => t.score);
  const goal = targets.score_goal;
  const scoreAxis = trend.length
    ? niceAxis(Math.min(...trendScores, goal ?? Infinity), Math.max(...trendScores, goal ?? -Infinity), 2)
    : null;
  const trendAvg = trend.length ? trendScores.reduce((a, b) => a + b, 0) / trend.length : null;
  return (
    <div className="backdrop-primary">

      {/* Quick Actions Header */}
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="heading-augusta text-3xl">Welcome back, {user.username}</h1>
         <button
            onClick={onLogout}
            className="btn-primary">
            <LogOutIcon size={20}></LogOutIcon>
          </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
            <div className="card-augusta p-3 sm:p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Handicap (est.)</p>
                <p className="stat-augusta">{stats.handicap_index ?? "--"}</p>
            </div>
            <div className="card-augusta p-3 sm:p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Best Score</p>
                <p className="stat-augusta">{stats.best_score}</p>
            </div>
            <div className="card-augusta p-3 sm:p-6 flex flex-col items-center justify-center text-center">
                <p className="label-augusta">Avg Score</p>
                <p className="stat-augusta">{stats.avg_score}</p>
            </div>
      </div>
      <div className="grid grid-cols-1 gap-4 mb-4">
        <div className="card-augusta min-w-0 p-4 sm:p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-augusta">Score Trend</p>
            {trendAvg != null && <span className="text-xs text-muted">avg {trendAvg.toFixed(1)}</span>}
          </div>
          {trend.length === 0 ? (
            <p className="text-sm text-muted">No rounds logged yet.</p>
          ) : (
            <TrendChart
              className="h-48 sm:h-64"
              data={trend}
              dataKey="score"
              stroke="#1E6B4E"
              domain={scoreAxis.domain}
              ticks={scoreAxis.ticks}
              goal={goal}
            />
          )}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">

        {/* Recent Rounds */}
        <div className="card-augusta p-6">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="heading-augusta text-xl">Recent Rounds</h2>
            <button
            className="btn-primary"
            onClick = {() => navigate("/roundinfo")}
            > View All Scores</button>
          </div>
          <div className="overflow-x-auto">
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
        </div>

        {/* Goals */}
        <GoalsCard targets={targets} rounds={rounds} onSaved={setTargets} />

        
        

      </div>

    </div>
  )
}