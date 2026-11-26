import { UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getApiErrorMessage,
  getAwsCredentials,
  getCurrentUser,
  type AuthUser,
  type AwsCredentialsRead,
} from '../../services/api'

export function ProfileModal({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void
  onOpenSettings: () => void
}) {
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [aws, setAws] = useState<AwsCredentialsRead | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getCurrentUser(), getAwsCredentials()])
      .then(([user, awsConnection]) => {
        if (!active) return
        setProfile(user)
        setAws(awsConnection)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getApiErrorMessage(requestError))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const providerName = profile?.auth_provider === 'google'
    ? 'Google'
    : profile?.auth_provider === 'aws'
      ? 'Legacy federated account'
      : 'Email and password'

  return (
    <div
      className="profile-modal-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.4)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        style={{ width: 'min(500px, 92vw)', maxHeight: '85vh', overflowY: 'auto', padding: 24, borderRadius: 20, background: '#ffffff', backgroundColor: '#ffffff', color: '#0f172a', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
      >
        <header className="profile-modal-heading">
          <div>
            <p className="card-kicker">ACCOUNT</p>
            <h2 id="profile-modal-title">Your profile</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close profile" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {error && <div className="form-feedback error" role="alert">{error}</div>}
        {!profile && !error && <div className="profile-loading" role="status">Loading profile…</div>}
        {profile && (
          <>
            <div className="profile-identity">
              <span className="profile-modal-avatar"><UserRound size={23} /></span>
              <div>
                <strong>{profile.full_name}</strong>
                <span>{profile.email}</span>
              </div>
            </div>
            <dl className="profile-detail-list">
              <div><dt>Sign-in provider</dt><dd>{providerName}</dd></div>
              <div><dt>Account created</dt><dd>{new Date(profile.created_at).toLocaleDateString()}</dd></div>
              <div><dt>AWS connection</dt><dd>{aws?.has_aws_credentials ? `Connected · ${aws.aws_access_key_id_preview ?? 'Key saved'}` : 'Not connected'}</dd></div>
            </dl>
            <button className="button button-primary profile-settings-link" type="button" onClick={onOpenSettings}>
              Manage AWS Settings →
            </button>
          </>
        )}
      </section>
    </div>
  )
}
