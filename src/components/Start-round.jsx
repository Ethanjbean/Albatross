import { useNavigate } from "react-router-dom"
import CourseSearch from "../components/CourseSearch"

export default function StartRound() {
  const navigate = useNavigate()

  function handleSelect(course) {
    navigate("/log-round", { state: { course } })
  }

  
    return (
  <div className="backdrop-primary flex min-h-screen items-center justify-center px-4">
    <div className="w-full max-w-xl text-center">
      <h1 className="mb-6 heading-augusta text-3xl">Where are you playing?</h1>
      <div className="p-2">
        <CourseSearch onSelect={handleSelect} />
        
      </div>
    </div>
  </div>
);
  
}