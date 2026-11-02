import { API_URL } from '../config'
export default function Login({onLogin, onSwitch}) {

   const handleSubmit = async () => {
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()
      console.log('data from backend:', data)

      if (data.token) {
        localStorage.setItem('token', data.token)
        console.log('user object being set:', { username: data.username })
        onLogin({ username: data.username })
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
      <h1 className="text-4xl text-center mb-2">⛳</h1>
      <h1 className="heading-augusta text-4xl text-center mb-2">Albatross</h1>
      <h2 className="font-display text-lg uppercase tracking-wider text-center text-muted mb-6"> Login </h2>
  
      <div className="mb-4">
      <label className="block text-sm font-medium text-ink mb-1">Username</label>
      <input
        id="username"
        type="text"
        placeholder="Enter username"
        className="fill_data"
      />
      </div>

      <div className="mb-6">
      <label className="block text-sm font-medium text-ink mb-1">Password</label>
      <input
        id="password"
        type="password"
        placeholder="Enter password"
        className="fill_data"
      />
      </div>
      <button
        onClick={handleSubmit}
        className="btn-primary w-full mb-4"
      >
      Sign In
      </button>
      <p className="text-center text-sm text-muted">
          Don't have an account?{' '}
        <span onClick={onSwitch} className="text-fairway cursor-pointer font-semibold">
            Register
        </span>
      </p>
  </div>
</div>
  )
}