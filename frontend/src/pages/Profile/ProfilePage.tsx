import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import { PageHeader } from '../../components/ui/Feedback'
import {
  getApiErrorMessage,
  getAwsCredentials,
  getCurrentUser,
  type AuthUser,
  type AwsCredentialsRead,
} from '../../services/api'
import { UserRound } from 'lucide-react'

export function ProfilePage() {
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [aws, setAws] = useState<AwsCredentialsRead | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getCurrentUser(), getAwsCredentials()])
      .then(([user, awsConnection]) => {
        setProfile(user)
        setAws(awsConnection)
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError)))
  }, [])

  const providerName =
    profile?.auth_provider === 'google'
      ? 'Google'
      : profile?.auth_provider === 'aws'
        ? 'AWS Cognito'
        : 'Local account'

  return (
    <div>
      <PageHeader
        eyebrow="ACCOUNT"
        title="Profile"
        description="Review your CloudSentry identity and AWS connection."
      />

      {error && <div className="form-feedback error" role="alert">{error}</div>}
      {profile && (
        <section className="surface-card profile-page-card">
          <div className="profile-page-identity">
            <PastelIconBadge tone="blue">
              <UserRound size={22} />
            </PastelIconBadge>
            <div>
              <p className="card-kicker">Signed-in user</p>
              <h2>{profile.full_name}</h2>
              <span>{profile.email}</span>
            </div>
          </div>

          <dl className="profile-detail-list">
            <div>
              <dt>Sign-in provider</dt>
              <dd><span className={`provider-badge provider-${profile.auth_provider}`}>{providerName}</span></dd>
            </div>
            <div>
              <dt>Account created</dt>
              <dd>{new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
            </div>
            <div>
              <dt>AWS connection</dt>
              <dd>{aws?.has_aws_credentials ? `Connected · ${aws.aws_access_key_id_preview ?? 'Key saved'}` : 'Not connected'}</dd>
            </div>
          </dl>

          <Link className="button button-primary profile-settings-link" to="/settings">
            Manage AWS Settings →
          </Link>
        </section>
      )}
    </div>
  )
}
