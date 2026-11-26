import { useEffect, useRef } from 'react'
import './how-it-works-modal.css'

const steps = [
  {
    title: 'Sign In with Google or Email',
    description:
      'Authenticate securely into your CloudSentry workspace using Google OAuth or your account credentials.',
  },
  {
    title: 'Connect Your AWS Account (Read-Only)',
    description:
      'Navigate to Settings and enter a read-only IAM Access Key ID, Secret Access Key, and Default Region (us-east-1). CloudSentry never modifies or deletes your AWS infrastructure.',
  },
  {
    title: 'Run Automated Posture & FinOps Scans',
    description:
      'Click Run New Scan from the header, Dashboard, or Scan History to discover EC2, S3, Security Groups, EBS, IAM, RDS, and Cost Explorer metrics.',
  },
  {
    title: 'Review Findings & Track Remediation',
    description:
      'Inspect prioritized HIGH, MEDIUM, and LOW security/cost findings, filter cloud inventory, and acknowledge or resolve items with an audit trail in PostgreSQL.',
  },
]

export function HowItWorksModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusableElements?.length) return
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="how-it-works-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={modalRef}
        className="how-it-works-modal"
        style={{ width: 'min(640px, 92vw)', background: '#ffffff', backgroundColor: '#ffffff', backdropFilter: 'none', WebkitBackdropFilter: 'none', zIndex: 1400 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        aria-describedby="how-it-works-subtitle"
      >
        <header className="how-it-works-header">
          <div>
            <span className="how-it-works-eyebrow">PLATFORM GUIDE</span>
            <h2 id="how-it-works-title">How CloudSentry Works</h2>
            <p id="how-it-works-subtitle">
              Read-only cloud governance, posture scoring, and FinOps visibility across your AWS environment.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            className="how-it-works-close"
            type="button"
            aria-label="Close How CloudSentry Works guide"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <ol className="how-it-works-steps">
          {steps.map((step, index) => (
            <li className="how-it-works-step" key={step.title}>
              <span className="how-it-works-step-number">{String(index + 1).padStart(2, '0')} ·</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <footer className="how-it-works-footer">
          <p>
            <strong>100% Read-Only Architecture</strong> — CloudSentry inspects metadata and configuration
            snapshots without mutating live AWS resources.
          </p>
          <button className="how-it-works-done" type="button" onClick={onClose}>
            Got It
          </button>
        </footer>
      </section>
    </div>
  )
}
