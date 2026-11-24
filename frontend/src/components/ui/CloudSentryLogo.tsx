export function CloudSentryLogo({
  markOnly = false,
  className = '',
}: {
  markOnly?: boolean
  className?: string
}) {
  return (
    <span className={`cloudsentry-logo${markOnly ? ' mark-only' : ''}${className ? ` ${className}` : ''}`}>
      <img className="cloudsentry-mark" src="/logo.png" alt="CloudSentry" />
      {!markOnly && (
        <span className="cloudsentry-wordmark">
          <span><span className="wordmark-cloud">Cloud</span><span className="wordmark-sentry">Sentry</span></span>
          <small>MONITOR · OPTIMIZE · SECURE</small>
        </span>
      )}
    </span>
  )
}
