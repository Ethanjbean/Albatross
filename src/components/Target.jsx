import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { API_URL } from '../config'

export default function Target(){
    const [targets, setTargets] = useState({
        score_goal: "",
        putt_goal: "",
        fairway_goal: "",
        green_goal: ""
    })
    const navigate = useNavigate()

    useEffect(() => {
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
        fetchTargets()
    }, [])

    const handleChange = (e) => {
        setTargets({
            ...targets,
            [e.target.name]: e.target.value
        })
    }

    const handleSubmit = async () => {
        try {
            const res = await fetch(`${API_URL}/api/targets`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: localStorage.getItem("token")
                },
                body: JSON.stringify(targets)
            })

            const data = await res.json()

            if(res.ok){
                console.log("targets saved", data)
                navigate("/")
            } else {
                alert(data.error)
            }
        } catch(err) {
            alert("Could not save targets")
        }
    }

    return(
        <div className="backdrop-primary">
            <div className="flex items-center justify-between mb-8">
                <h1 className="heading-augusta text-3xl">⛳ Albatross</h1>
                <button className="btn-primary" onClick={() => navigate('/')}>
                    ← Back to Dashboard
                </button>
            </div>

            <div className="card-augusta p-8 max-w-2xl mx-auto">
                <h2 className="heading-augusta text-2xl mb-6">Set Your Goals</h2>

                <div className="grid grid-cols-2 gap-6">

                    {/* Score Goal */}
                    <div>
                        <label className="block mb-2 text-sm font-medium text-ink">Score Goal</label>
                        <div className="relative flex items-center max-w-[9rem]">
                            <button type="button"
                                onClick={() => setTargets({...targets, score_goal: Number(targets.score_goal) - 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-l-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14"/>
                                </svg>
                            </button>
                            <input type="number"
                                name="score_goal"
                                value={targets.score_goal}
                                onChange={handleChange}
                                className="border-x-0 h-10 text-center w-full border border-line bg-white py-2.5 text-sm text-ink tabular-nums outline-none focus:bg-fairway-light"
                                placeholder="82"
                            />
                            <button type="button"
                                onClick={() => setTargets({...targets, score_goal: Number(targets.score_goal) + 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-r-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-7 7V5"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Putts Goal */}
                    <div>
                        <label className="block mb-2 text-sm font-medium text-ink">Putts Goal</label>
                        <div className="relative flex items-center max-w-[9rem]">
                            <button type="button"
                                onClick={() => setTargets({...targets, putt_goal: Number(targets.putt_goal) - 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-l-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14"/>
                                </svg>
                            </button>
                            <input type="number"
                                name="putt_goal"
                                value={targets.putt_goal}
                                onChange={handleChange}
                                className="border-x-0 h-10 text-center w-full border border-line bg-white py-2.5 text-sm text-ink tabular-nums outline-none focus:bg-fairway-light"
                                placeholder="32"
                            />
                            <button type="button"
                                onClick={() => setTargets({...targets, putt_goal: Number(targets.putt_goal) + 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-r-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-7 7V5"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Fairways Goal */}
                    <div>
                        <label className="block mb-2 text-sm font-medium text-ink">Fairways Goal</label>
                        <div className="relative flex items-center max-w-[9rem]">
                            <button type="button"
                                onClick={() => setTargets({...targets, fairway_goal: Number(targets.fairway_goal) - 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-l-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14"/>
                                </svg>
                            </button>
                            <input type="number"
                                name="fairway_goal"
                                value={targets.fairway_goal}
                                onChange={handleChange}
                                className="border-x-0 h-10 text-center w-full border border-line bg-white py-2.5 text-sm text-ink tabular-nums outline-none focus:bg-fairway-light"
                                placeholder="9"
                            />
                            <button type="button"
                                onClick={() => setTargets({...targets, fairway_goal: Number(targets.fairway_goal) + 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-r-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-7 7V5"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Greens Goal */}
                    <div>
                        <label className="block mb-2 text-sm font-medium text-ink">Greens in Regulation Goal</label>
                        <div className="relative flex items-center max-w-[9rem]">
                            <button type="button"
                                onClick={() => setTargets({...targets, green_goal: Number(targets.green_goal) - 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-l-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14"/>
                                </svg>
                            </button>
                            <input type="number"
                                name="green_goal"
                                value={targets.green_goal}
                                onChange={handleChange}
                                className="border-x-0 h-10 text-center w-full border border-line bg-white py-2.5 text-sm text-ink tabular-nums outline-none focus:bg-fairway-light"
                                placeholder="10"
                            />
                            <button type="button"
                                onClick={() => setTargets({...targets, green_goal: Number(targets.green_goal) + 1})}
                                className="bg-fairway hover:bg-fairway-dark text-white h-10 px-3 rounded-r-lg">
                                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-7 7V5"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                </div>

                <button onClick={handleSubmit} className="btn-primary w-full mt-8">
                    Save Goals
                </button>

            </div>
        </div>
    )
}