import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Home, PlusCircle, Trophy, BarChart3, User, Pencil, Trash2 } from "lucide-react";
import { API_URL } from '../config'

export default function Roundinfo() {
    const [rounds, setRounds] = useState([])
    const [targets, setTargets] = useState({})
    const [confirmingId, setConfirmingId] = useState(null) // round showing "Delete? Yes / No"
    const [deletingId, setDeletingId] = useState(null)
    const [deleteError, setDeleteError] = useState(null)
    const navigate = useNavigate()

    const deleteRound = async (id) => {
        setDeletingId(id)
        setDeleteError(null)
        try {
            const res = await fetch(`${API_URL}/api/rounds/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error ?? `Delete failed (${res.status})`)
            }
            setRounds(prev => prev.filter(r => r.id !== id))
            setConfirmingId(null)
        } catch (err) {
            setDeleteError(err.message)
        } finally {
            setDeletingId(null)
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem("token")
            try {
                const [roundsRes, targetsRes] = await Promise.all([
                    fetch(`${API_URL}/api/rounds`, { headers: { Authorization: token }}),
                    fetch(`${API_URL}/api/targets`, { headers: { Authorization: token }})
                ])

                const roundsData = await roundsRes.json()
                const targetsData = await targetsRes.json()

                if(roundsRes.ok) setRounds(roundsData)
                if(targetsRes.ok) setTargets(targetsData)

            } catch(err) {
                console.log("failed to fetch data")
            }
        }
        fetchData()
    }, [])

    const getTextColor = (value, goal, higherIsBetter = false) => {
    if(higherIsBetter) {
        if(value >= goal) return 'group-hover:text-fairway'
        if(value >= goal - 5) return 'group-hover:text-yellow-600'
        return 'group-hover:text-red-600'
    } else {
        if(value <= goal) return 'group-hover:text-fairway'
        if(value <= goal + 5) return 'group-hover:text-yellow-600'
        return 'group-hover:text-red-600'
    }
}

    return (
        <div className="backdrop-primary">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h1 className="heading-augusta text-3xl">⛳ Albatross</h1>
                <button className="btn-primary" onClick={() => navigate('/')}>
                    ← Back to Dashboard
                </button>
            </div>

            {/* Table Card */}
            <div className="card-augusta overflow-hidden">

                <div className="p-6 border-b border-line">
                    <h2 className="heading-augusta text-xl">Round History</h2>
                    <p className="text-sm text-muted mt-1">{rounds.length} rounds logged</p>
                    {deleteError && <p className="text-sm text-danger mt-2">{deleteError}</p>}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-fairway-dark">
                            <tr className="text-left text-white">
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">Course</th>
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">Score</th>
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">Putts</th>
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">Fairways</th>
                                <th className="px-6 py-3 font-display font-medium uppercase tracking-wider">G/R</th>
                                <th className="px-6 py-3"><span className="sr-only">Scorecard</span></th>
                                <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="text-ink divide-y divide-line">
                            {rounds.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-muted">
                                        No rounds logged yet
                                    </td>
                                </tr>
                            ) : (
                                rounds.map((round) => (
                                    <tr key={round.id} className="group hover:bg-fairway-hover transition-colors">
    <td className="px-6 py-4 font-medium text-ink">{round.course_name}</td>
    <td className="px-6 py-4 text-muted">{new Date(round.date_played).toLocaleDateString()}</td>
    <td className="px-6 py-4">
        <span className={`font-bold transition-colors ${getTextColor(round.total_score, targets.score_goal)}`}>
            {round.total_score}
        </span>
    </td>
    <td className="px-6 py-4">
        <span className={`font-bold transition-colors ${getTextColor(round.total_putts, targets.putt_goal)}`}>
            {round.total_putts}
        </span>
    </td>
    <td className="px-6 py-4">
        <span className={`font-bold transition-colors ${getTextColor(round.fairways_hit, targets.fairway_goal, true)}`}>
            {round.fairways_hit}
        </span>
    </td>
    <td className="px-6 py-4">
        <span className={`font-bold transition-colors ${getTextColor(round.greens_in_reg, targets.green_goal, true)}`}>
            {round.greens_in_reg}
        </span>
    </td>
    <td className="px-6 py-4 text-right">
        {round.has_holes ? (
            <button
                className="text-sm font-medium text-fairway hover:underline"
                onClick={() => navigate(`/rounds/${round.id}`)}
            >
                View scorecard
            </button>
        ) : (
            <span className="text-xs text-muted" title="Quick-logged rounds have no hole-by-hole data">
                Quick log
            </span>
        )}
    </td>
    <td className="px-6 py-4 text-right whitespace-nowrap">
        {confirmingId === round.id ? (
            <span className="inline-flex items-center gap-3">
                <span className="text-xs text-danger font-medium">Delete this round?</span>
                <button
                    className="text-sm font-semibold text-danger hover:underline disabled:opacity-50"
                    onClick={() => deleteRound(round.id)}
                    disabled={deletingId === round.id}
                >
                    {deletingId === round.id ? "Deleting..." : "Yes"}
                </button>
                <button
                    className="text-sm text-muted hover:underline"
                    onClick={() => setConfirmingId(null)}
                    disabled={deletingId === round.id}
                >
                    No
                </button>
            </span>
        ) : (
            <span className="inline-flex items-center gap-1">
                <button
                    className="rounded-lg p-2 text-muted hover:bg-fairway-light hover:text-fairway-dark"
                    onClick={() => navigate(`/rounds/${round.id}/edit`)}
                    aria-label="Edit round"
                    title="Edit round"
                >
                    <Pencil size={16} />
                </button>
                <button
                    className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger"
                    onClick={() => { setDeleteError(null); setConfirmingId(round.id) }}
                    aria-label="Delete round"
                    title="Delete round"
                >
                    <Trash2 size={16} />
                </button>
            </span>
        )}
    </td>
</tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
        </div>

        </div>
    )
}