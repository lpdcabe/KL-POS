import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { BrandMark } from '../components/BrandMark.jsx'

export function LoginPage({ isConfigured, authError, onSignIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      await onSignIn(email, password)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <BrandMark animated />
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <span className="eyebrow">Staff access</span>
          <h2>Welcome back</h2>
          <p>Sign in with your assigned employee account.</p>

          {!isConfigured && (
            <div className="notice notice--warning">
              Add the Supabase values from <code>.env.example</code> before signing in.
            </div>
          )}
          {(formError || authError) && <div className="notice notice--error">{formError || authError}</div>}

          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="cashier@klwings.ph" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
          </label>
          <button className="primary-button" type="submit" disabled={!isConfigured || submitting}>
            <span>{submitting ? 'Signing in...' : 'Sign in to POS'}</span>
            <ArrowRight size={18} />
          </button>
          <small>Contact the owner or manager if you cannot access your account.</small>
        </form>
      </section>
    </main>
  )
}
