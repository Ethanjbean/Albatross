import { useEffect, useState } from "react"
import { useNavigate, NavLink } from "react-router-dom"
import { Home, PlusCircle, Trophy, BarChart3, User } from "lucide-react";
import RoundStatsCharts from "./Statcharts.jsx";
import { API_URL } from '../config'

export default function Stats({ user, onLogout }) {
    const navigate = useNavigate()
    const [rounds, setRounds] = useState([])
    const [stats, setStats] = useState({
        rounds_played: 0,
        best_score: "-",
        avg_score: "-"
    })

    useEffect(() => {
        const fetchRounds = async () => {
            try {
                const res = await fetch(`${API_URL}/api/rounds/all`, {
                    headers: {
                        Authorization: localStorage.getItem("token")
                    }
                })
                const data = await res.json()
                if (res.ok) {
                    setRounds(data)
                } else {
                    console.log("server err")
                }
            }
            catch (err) {
                console.log("failed to retrieve data from rounds")
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
            } else {
                console.log(data.error)
            }
        }
        fetchRounds()
        fetchStats()
    }, []) // <- was missing; without this the effect re-ran on every render

    return (
        <div className="backdrop-primary">
            <div className="grid grid-cols-3 gap-8 mb-8">
                <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                    <p className="label-augusta">Handicap (est.)</p>
                    <p className="stat-augusta">{stats.handicap_index ?? "--"}</p>
                </div>
                <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                    <p className="label-augusta">Rounds Played</p>
                    <p className="stat-augusta">{stats.rounds_played}</p>
                </div>
                <div className="card-augusta p-6 flex flex-col items-center justify-center text-center">
                    <p className="label-augusta">Avg Score</p>
                    <p className="stat-augusta">{stats.avg_score}</p>
                </div>
            </div>

            <RoundStatsCharts rounds={rounds} />
        </div>
    )
}