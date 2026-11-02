import { API_URL } from '../config'
export default function Register({ onSwitch }) {

  const handleRegister = async () => {
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value
    const password_conf = document.getElementById('password_confirmed').value


    if(password != password_conf)
    {
      alert("passwords do not match")
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()

      if (data.username) {
        alert('Account created! Please login.')
        onSwitch()  // switch back to login
      } else {
        alert(data.error)
      }
    } catch (err) {
      alert('Could not connect to server')
    }
  }

  return (
    <div className="min-h-screen bg-fairway-dark flex items-center justify-center p-4">
      <div className="card-augusta p-8 w-full max-w-sm">

        <h1 className="heading-augusta text-4xl text-center mb-2">⛳ Albatross</h1>
        <h2 className="font-display text-lg uppercase tracking-wider text-center text-muted mb-6">Create Account</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink mb-1">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Enter username"
            className="input-field fill_data"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-ink mb-1">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            className="input-field fill_data"
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-ink mb-1">Confirm password</label>
          <input
            id="password_confirmed"
            type="password"
            placeholder="Enter password"
            className="input-field fill_data"
          />
        </div>

        <button
          onClick={handleRegister}
          className="btn-primary w-full mb-4"
        >
          Create Account
        </button>

        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <span onClick={onSwitch} className="text-fairway cursor-pointer font-semibold">
            Login
          </span>
        </p>

      </div>
    </div>
  )
}