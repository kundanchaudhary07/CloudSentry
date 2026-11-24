import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudSentryLogo } from '../../components/ui/CloudSentryLogo'
import {
  getApiErrorMessage,
  getCurrentUser,
  getOAuthProviders,
  login,
  register,
} from '../../services/api'
import {
  clearStoredCredentials,
  persistAccessToken,
  readAccessToken,
  saveAuthenticatedSession,
} from '../../services/operatorSession'
import './authentication.css'

export function AuthenticationPage() {
  const [identifier, setIdentifier] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState(() => {
    const oauthError = new URLSearchParams(window.location.search).get('oauth_error')
    return oauthError ? decodeURIComponent(oauthError) : ''
  })
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const oauthError = params.get('oauth_error')

    if (token) {
      persistAccessToken(token)
      void getCurrentUser()
        .then((user) => {
          saveAuthenticatedSession(user.full_name, token)
          window.history.replaceState({}, '', '/login')
          navigate('/dashboard', { replace: true })
        })
        .catch((error) => {
          clearStoredCredentials()
          setMessage(getApiErrorMessage(error))
        })
    } else if (oauthError) {
      window.history.replaceState({}, '', '/login')
    } else if (readAccessToken()) {
      navigate('/dashboard', { replace: true })
    }

    void getOAuthProviders()
      .then((providers) => setGoogleConfigured(providers.google))
      .catch(() => setGoogleConfigured(false))
  }, [navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const operatorIdentifier = identifier.trim()
    if (!operatorIdentifier || !password.trim() || (isSignUp && !fullName.trim())) {
      setMessage('Enter your email or username and password.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const response = isSignUp
        ? await register(operatorIdentifier, fullName.trim(), password)
        : await login(operatorIdentifier, password)
      saveAuthenticatedSession(response.user.full_name, response.access_token)
      navigate('/dashboard')
    } catch (error) {
      setMessage(getApiErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function showProviderUnavailable(provider: string) {
    setMessage(`${provider} sign-in is not configured.`)
  }

  return (
    <main className="auth-page">
      <section className="auth-visual-panel" aria-label="CloudSentry overview">
        <CloudSentryLogo className="auth-brand" />
        <div className="auth-intro">
          <h1>
            A Smarter Way to Manage
            <br />
            Your <span>AWS</span> Cloud
          </h1>
          <p>
            Gain visibility, reduce costs, and strengthen security across your AWS environment.
          </p>
        </div>
        <AuthPreviewCard />
      </section>

      <section className="auth-form-panel" aria-label="Sign in">
        <div className="auth-form-card">
          <div className="auth-form-content">
            <header className="auth-form-heading">
              <h2>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
              <p>{isSignUp ? 'Set up your CloudSentry account' : 'Sign in to your CloudSentry account'}</p>
            </header>

            <form onSubmit={submit}>
              {isSignUp && (
                <>
                  <label htmlFor="auth-full-name">Full Name</label>
                  <div className="auth-input-wrap">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="auth-full-name"
                      type="text"
                      placeholder="Your full name"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </div>
                </>
              )}
              <label htmlFor="auth-username">Email or Username</label>
              <div className="auth-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input
                  id="auth-username"
                  type="text"
                  placeholder="you@company.com"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </div>

              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button
                className="auth-text-button forgot-link"
                type="button"
                onClick={() => showProviderUnavailable('Password recovery')}
              >
                Forgot password?
              </button>

              <button className="auth-submit-button" type="submit" disabled={isSubmitting}>
                <span>{isSubmitting ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Sign In'}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>

            <div className="auth-oauth-row">
              <button
                className="auth-google-btn"
                type="button"
                aria-label="Continue with Google"
                title="Continue with Google"
                onClick={() => {
                  if (googleConfigured) {
                    window.location.assign('/api/v1/auth/oauth/google/login')
                  } else {
                    showProviderUnavailable('Google. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
                  }
                }}
              >
                <GoogleMark />
                <span>Continue with Google</span>
              </button>
            </div>

            <p className="auth-signup-copy">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                className="auth-text-button"
                type="button"
                onClick={() => {
                  setIsSignUp((current) => !current)
                  setMessage('')
                }}
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
            {message && <p className="auth-message" role="status">{message}</p>}
          </div>
        </div>
      </section>
    </main>
  )
}

function AuthPreviewCard() {
  return (
    <div className="auth-preview-card">
      <div className="auth-preview-heading">
        <span>Cloud governance</span>
        <ShieldCheck size={18} aria-hidden="true" />
      </div>
      <div className="auth-preview-grid">
        <div className="auth-preview-tile">
          <img className="auth-preview-service-logo" src="/aws-ec2.svg" alt="" />
          <strong>EC2 Compute</strong>
          <small>Instance inventory</small>
        </div>
        <div className="auth-preview-tile">
          <img className="auth-preview-service-logo" src="/aws-rds.svg" alt="" />
          <strong>RDS Storage</strong>
          <small>Database inventory</small>
        </div>
        <div className="auth-preview-tile">
          <img className="auth-preview-service-logo" src="/aws-security-hub.svg" alt="" />
          <strong>Security</strong>
          <small>Configuration review</small>
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="provider-mark google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v2.95h3.88c2.27-2.09 3.56-5.17 3.56-8.59Z" />
      <path fill="#34a853" d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.88-2.95c-1.08.72-2.46 1.15-4.05 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.04A12 12 0 0 0 12 24Z" />
      <path fill="#fbbc05" d="M5.28 14.32a7.2 7.2 0 0 1 0-4.64V6.64H1.27a12 12 0 0 0 0 10.72l4.01-3.04Z" />
      <path fill="#ea4335" d="M12 4.73c1.77 0 3.35.61 4.6 1.81l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.64l4.01 3.04c.95-2.84 3.6-4.95 6.72-4.95Z" />
    </svg>
  )
}
