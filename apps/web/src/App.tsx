import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowUpRight, Award,
  Clock3, Crosshair, ExternalLink,
  Network, Play, ShieldAlert,
  ShieldCheck, Signal, Target, Terminal,
  Users, CheckCircle, AlertTriangle, RefreshCw,
  Coins, Gavel, Scale, RotateCcw
} from 'lucide-react'
import './App.css'

type View = 'Mission Control' | 'Bounty Market' | 'Agent Network' | 'Findings' | 'Leaderboard'

export interface MarketRound {
  roundId: string
  taskId: string
  taskName: string
  rewardNear: string
  openTxHash?: string
  winnerAccount: string
  winnerScore: string
  winnerSource?: 'on_chain_settle' | 'unsettled' | 'local_simulation'
  allBids: {
    agentId: string
    account: string
    confidenceBps: number
    costYocto: string
    revealed: boolean
    score: number
    signingMode?: 'agent_key' | 'missing_key' | 'local_simulation'
    confidenceSource?: 'near_ai_tee_verified' | 'scripted'
    commitTxHash?: string
  }[]
  settleTxHash?: string
  payoutTxHash?: string
  payoutStatus: string
  bountyPricing?: {
    pricingSource: 'near_intents_1click_dry_quote' | 'fixed_fallback'
    bountyUsd: number
    escrowNear: string
    quote?: { correlationId?: string }
  }
  mcpAudit?: { approved: boolean; roundStatus?: string; winnerKeyScoped: boolean; reasons: string[] }
  operatorKeyModes?: { open?: string; settle?: string; release?: string }
  phaseEnforcement?: 'on_chain' | 'not_supported_by_deployed_contract' | 'local_simulation'
  startRevealTxHash?: string
  proofHash?: string
  proofStoredOnChain?: boolean
}

const PAYOUT_TONE: Record<string, { color: string; border: string }> = {
  confirmed: { color: '#B6FF5C', border: '#B6FF5C' },
  refunded: { color: '#ffd166', border: '#ffd166' },
  failed: { color: '#ff6b6b', border: '#ff6b6b' },
  pending: { color: '#8fa08e', border: '#3a463c' },
  simulated: { color: '#8fa08e', border: '#3a463c' },
}

function ProofChip({ ok, label, title }: { ok: boolean | undefined; label: string; title?: string }) {
  const tone = ok === undefined ? '#778477' : ok ? '#B6FF5C' : '#ff6b6b'
  return (
    <span title={title} style={{ fontSize: '10px', fontFamily: 'monospace', color: tone, border: `1px solid ${tone}`, borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
      {ok === undefined ? '○' : ok ? '✓' : '✕'} {label}
    </span>
  )
}

interface MissionData {
  missionId: string
  target: string
  status: string
  startedAt: string
  completedAt: string
  durationMs: number
  summary: {
    totalDiscoveredPages: number
    totalDiscoveredEndpoints: number
    totalDiscoveredForms: number
    totalAgentsRun: number
    totalRawFindings: number
    totalVerifiedVulnerabilities: number
    totalTestedInputs: number
  }
  agentsExecuted: {
    agentName: string
    status: string
    durationMs: number
    findingsCount: number
  }[]
  verifiedFindings: {
    findingId: string
    sourceAgent: string
    vulnerabilityType: string
    title: string
    severity: string
    affectedEndpoint: string
    verificationRationale: string
    timestamp: string
    evidence?: Record<string, unknown>
    reproductionSteps?: string[]
  }[]
  marketRounds?: MarketRound[]
  nearAttestation?: {
    status: string
    contractId?: string
    missionTxHash?: string
    explorerUrl?: string
    attestedAt?: string
    errorMessage?: string
  }
}

interface ReputationData {
  configured: boolean
  contractId?: string
  reputation: Record<string, number> | null
}

function Mark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 38 38" fill="none">
        <path d="M19 4 24 12l9 2-6 7 1 10-9-4-9 4 1-10-6-7 9-2 5-8Z" />
        <path d="M19 12v14M12 16l7 3 7-3M12 23l7-2 7 2" />
        <circle cx="19" cy="19" r="2" fill="currentColor" stroke="none" />
      </svg>
    </div>
  )
}

function Sidebar({
  active,
  onChange,
  marketCount = 0,
  findingsCount = 0,
}: {
  active: View
  onChange: (view: View) => void
  marketCount?: number
  findingsCount?: number
}) {
  const navItems: { label: View; icon: typeof Activity; count?: string }[] = [
    { label: 'Mission Control', icon: Crosshair },
    { label: 'Bounty Market', icon: Coins, count: marketCount > 0 ? `0${marketCount}` : '00' },
    { label: 'Agent Network', icon: Network, count: '04' },
    { label: 'Findings', icon: ShieldAlert, count: findingsCount > 0 ? `0${findingsCount}` : '00' },
    { label: 'Leaderboard', icon: Award },
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <Mark />
        <div>
          <span className="brand-name">BUGBOUNTY</span>
          <span className="brand-sub">SWARM <i>SECURITY AI</i></span>
        </div>
      </div>
      <div className="workspace-switch">
        <div className="workspace-avatar">S</div>
        <div className="workspace-copy">
          <span>Target Workspace</span>
          <strong>Local Demo Shop (:4000)</strong>
        </div>
      </div>
      <div className="nav-label">PLATFORM</div>
      <nav aria-label="Main navigation">
        {navItems.map(({ label, icon: Icon, count }) => (
          <button
            key={label}
            className={`nav-item ${active === label ? 'active' : ''}`}
            onClick={() => onChange(label)}
          >
            <Icon size={17} />
            <span>{label}</span>
            {count && <small>{count}</small>}
          </button>
        ))}
      </nav>
      <div className="nav-label tools-label">BLOCKCHAIN VERIFICATION</div>
      <a
        href="https://testnet.nearblocks.io/address/harsha-swarm.testnet"
        target="_blank"
        rel="noreferrer"
        className="nav-item"
        style={{ textDecoration: 'none' }}
      >
        <Terminal size={17} />
        <span>NEAR Explorer</span>
        <ArrowUpRight size={13} style={{ marginLeft: 'auto' }} />
      </a>
      <div className="sidebar-bottom">
        <div className="usage-card">
          <div className="usage-head">
            <span>NEAR TESTNET OPERATOR</span>
            <span style={{ color: '#B6FF5C' }}>ONLINE</span>
          </div>
          <p style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '6px', color: '#eef2ec' }}>
            harsha-swarm.testnet
          </p>
        </div>
        <div className="profile">
          <div className="profile-avatar">HS</div>
          <div>
            <strong>Harsha Swarm</strong>
            <span>Swarm Operator</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Topbar({
  active,
  nearTx,
  isRunning,
  onResetDemo,
}: {
  active: View
  nearTx?: string
  isRunning: boolean
  onResetDemo: () => void
}) {
  return (
    <header className="topbar">
      <div className="crumb">
        <span>Target: http://localhost:4000/shop</span>
        <span className="crumb-slash">/</span>
        <strong>{active}</strong>
      </div>
      <div className="top-actions">
        <button
          className="secondary-button"
          onClick={onResetDemo}
          disabled={isRunning}
          style={{ height: '30px', fontSize: '11px', padding: '0 10px' }}
          title="Reset demo to scratch state (0 findings, clean slate for video recording)"
        >
          <RotateCcw size={13} /> Reset Demo State
        </button>
        <div className="system-pill" style={{ borderColor: '#B6FF5C', color: '#B6FF5C' }}>
          ● LIVE SWARM · NEAR TESTNET
        </div>
        {nearTx && (
          <a
            href={`https://testnet.nearblocks.io/txns/${nearTx}`}
            target="_blank"
            rel="noreferrer"
            className="system-pill"
            style={{ textDecoration: 'none', color: '#B6FF5C', border: '1px solid #B6FF5C' }}
          >
            TX: {nearTx.slice(0, 8)}... <ExternalLink size={11} style={{ display: 'inline', marginLeft: 4 }} />
          </a>
        )}
      </div>
    </header>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="section-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function Metric({
  label,
  value,
  change,
  icon: Icon,
  tone = 'lime',
}: {
  label: string
  value: string
  change: string
  icon: typeof ShieldCheck
  tone?: string
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}><Icon size={16} /></span>
      </div>
      <div className="metric-value">
        {value}
        <span className="metric-change"><ArrowUpRight size={13} />{change}</span>
      </div>
      <div className="metric-foot">Multi-Agent Swarm Pipeline</div>
    </div>
  )
}

function MissionControl({
  mission,
  isRunning,
  onStartMission,
  onResetDemo,
  onVerifyIntegrity,
  integrityResult,
  integrityLoading = false,
  integrityError = null,
}: {
  mission: MissionData | null
  isRunning: boolean
  onStartMission: () => void
  onResetDemo: () => void
  onVerifyIntegrity: (tamper?: boolean) => void
  integrityResult: { status: string; computedLocalHash: string; storedOnChainHash: string; tampered: boolean; explorerUrl?: string } | null
  integrityLoading?: boolean
  integrityError?: string | null
}) {
  const isNearConfigured = mission?.nearAttestation?.status === 'confirmed' || mission?.nearAttestation?.status === 'pending'
  const isCompleted = Boolean(mission && mission.status === 'completed')

  return (
    <>
      <SectionHeader
        eyebrow="MULTI-AGENT WEB SECURITY PIPELINE"
        title="Mission control"
        description="Automated reconnaissance, commit-reveal task auction, independent replay verification, and NEAR Protocol testnet attestation."
        action={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="primary-button"
              disabled={isRunning}
              onClick={onStartMission}
              style={{ opacity: isRunning ? 0.6 : 1 }}
            >
              {isRunning ? <RefreshCw size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
              {isRunning ? 'Running Swarm Pipeline...' : 'Start a mission'}
            </button>
            <button
              className="secondary-button"
              onClick={onResetDemo}
              disabled={isRunning}
              title="Reset dashboard to clean initial scratch state for demo recording"
            >
              <RotateCcw size={15} /> Reset Demo
            </button>
            <button
              className="secondary-button"
              onClick={() => onVerifyIntegrity(false)}
              disabled={isRunning || integrityLoading}
              title="Verify local hash against unchanged on-chain contract hash"
            >
              <CheckCircle size={15} /> {integrityLoading ? 'Verifying…' : 'Verify integrity'}
            </button>
            <button
              className="secondary-button"
              onClick={() => onVerifyIntegrity(true)}
              disabled={isRunning || integrityLoading}
              style={{ borderColor: '#ff6b6b', color: '#ff6b6b' }}
              title="Mutates local memory finding to demonstrate cryptographic mismatch against unchanged on-chain hash"
            >
              <AlertTriangle size={15} /> Simulate Local Tamper
            </button>
          </div>
        }
      />

      {integrityLoading && (
        <div className="demo-notice" style={{ borderColor: '#61d8d1', background: 'rgba(97, 216, 209, 0.08)' }}>
          <RotateCcw size={18} color="#61d8d1" className="spin" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: '#61d8d1', fontSize: '13px' }}>QUERYING IMMUTABLE ON-CHAIN RECORD…</strong>
            <div style={{ fontSize: '12px', marginTop: '2px', color: '#8fa08e' }}>
              Fetching on-chain attestation hash via FastNear RPC from harsha-swarm.testnet…
            </div>
          </div>
        </div>
      )}

      {integrityError && (
        <div className="demo-notice" style={{ borderColor: '#ff4d4f', background: 'rgba(255, 77, 79, 0.08)' }}>
          <AlertTriangle size={18} color="#ff4d4f" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: '#ff4d4f', fontSize: '13px' }}>INTEGRITY CHECK ERROR</strong>
            <div style={{ fontSize: '12px', marginTop: '2px', color: '#ff8587' }}>
              {integrityError}
            </div>
          </div>
        </div>
      )}

      {integrityResult && (() => {
        const isMatch = integrityResult.status === 'MATCH'
        const isNoRecord = integrityResult.status === 'NO ON-CHAIN RECORD'
        const toneColor = isMatch ? '#B6FF5C' : isNoRecord ? '#faad14' : '#ff4d4f'
        const bgTone = isMatch ? 'rgba(182, 255, 92, 0.08)' : isNoRecord ? 'rgba(250, 173, 20, 0.08)' : 'rgba(255, 77, 79, 0.08)'
        const shorten = (h: string) => (h && h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h)

        return (
          <div
            className="demo-notice"
            style={{
              borderColor: toneColor,
              background: bgTone,
            }}
          >
            {isMatch ? (
              <CheckCircle size={18} color={toneColor} style={{ flexShrink: 0 }} />
            ) : isNoRecord ? (
              <ShieldAlert size={18} color={toneColor} style={{ flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={18} color={toneColor} style={{ flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <strong style={{ color: toneColor, fontSize: '13px' }}>
                  INTEGRITY CHECK: {integrityResult.status}
                </strong>
                {integrityResult.explorerUrl && (
                  <a
                    href={integrityResult.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11px', color: '#B6FF5C', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    View on NearBlocks <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                Unchanged On-Chain Hash : <span style={{ color: '#edf2ea' }}>{shorten(integrityResult.storedOnChainHash)}</span>
              </div>
              <div style={{ fontSize: '12px', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                Re-calculated Local Hash: <span style={{ color: '#edf2ea' }}>{shorten(integrityResult.computedLocalHash)}</span>
              </div>
              {integrityResult.tampered && (
                <div style={{ fontSize: '11px', color: '#ff4d4f', marginTop: '4px', fontWeight: 600 }}>
                  local copy edited; chain unchanged (Simulated mutation: modified local finding title in memory)
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <section className="mission-banner">
        <div className="mission-banner-grid" />
        <div className="mission-info">
          <div className="mission-kicker">
            <span
              className="live-indicator"
              style={{
                background: isRunning ? 'rgba(97, 216, 209, 0.2)' : isCompleted ? '#B6FF5C' : 'rgba(255, 255, 255, 0.08)',
                color: isRunning ? '#61d8d1' : isCompleted ? '#000' : '#8fa08e',
                border: isRunning ? '1px solid #61d8d1' : 'none',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              {isRunning ? 'RUNNING' : isCompleted ? 'COMPLETED' : 'AWAITING TRIGGER'}
            </span>
            <span className="mission-id">{mission?.missionId || 'MSN-PENDING-TRIGGER'}</span>
          </div>
          <h2>Demo Shop Target — Automated Vulnerability Assessment</h2>
          <div className="mission-meta">
            <span><Target size={14} /> http://localhost:4000/shop</span>
            <span>
              <Clock3 size={14} />{' '}
              {isRunning
                ? 'Mission in progress...'
                : mission
                ? `${Math.round(mission.durationMs / 1000)}s runtime (${new Date(mission.completedAt).toLocaleTimeString()})`
                : 'Ready (Click Start a mission)'}
            </span>
            <span><Users size={14} /> 4 Specialist Agents + Market Auction</span>
          </div>
          <div className="mission-progress">
            <div className="progress-label">
              <span>SWARM PIPELINE STAGES</span>
              <strong>
                {isRunning
                  ? 'Active: Crawling Surface & Auctioning Tasks...'
                  : isCompleted
                  ? 'Attested on NEAR Testnet'
                  : 'Standing By'}
              </strong>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: isRunning ? '65%' : isCompleted ? '100%' : '0%',
                  background: isRunning ? 'var(--cyan)' : 'var(--lime)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div className="progress-phases">
              <span className={isCompleted ? 'done' : isRunning ? 'current' : ''}>1. Surface Recon</span>
              <span className={isCompleted ? 'done' : isRunning ? 'current' : ''}>2. Task Auction</span>
              <span className={isCompleted ? 'done' : isRunning ? 'current' : ''}>3. Specialist Exploits</span>
              <span className={isCompleted ? 'done' : isRunning ? 'current' : ''}>4. Verify & Payout</span>
            </div>
          </div>
        </div>
        <div className="mission-side">
          <div className="side-stat">
            <span>VERIFIED VULNERABILITIES</span>
            <strong>{mission?.verifiedFindings?.length ?? 0}</strong>
            <small style={{ color: isCompleted ? '#B6FF5C' : '#8fa08e' }}>
              {isCompleted ? 'Confirmed via DOM & API' : 'Awaiting mission execution'}
            </small>
          </div>
          <div className="side-rule" />
          <div className="side-stat">
            <span>DISCOVERED SURFACE</span>
            <strong>{mission?.summary?.totalDiscoveredEndpoints ?? 0} Endpoints</strong>
            <small>{mission?.summary?.totalDiscoveredPages ?? 0} pages mapped</small>
          </div>
          <div className="mission-scan">
            <div className="scan-ring"><span><Signal size={16} /></span></div>
            <div>
              <span>NEAR ATTESTATION</span>
              <strong style={{ color: isCompleted && isNearConfigured ? '#B6FF5C' : isRunning ? '#61d8d1' : '#8fa08e' }}>
                {isRunning ? 'BROADCASTING...' : isCompleted && isNearConfigured ? 'CONFIRMED' : 'READY / TESTNET'}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <div className="metrics-grid">
        <Metric
          label="VERIFIED VULNERABILITIES"
          value={mission?.verifiedFindings?.length ? `0${mission.verifiedFindings.length}` : '00'}
          change={isCompleted ? '+3 Confirmed' : 'Standing By'}
          icon={ShieldCheck}
        />
        <Metric
          label="SPECIALIST AGENTS"
          value="04"
          change="Sequential Swarm"
          icon={Users}
          tone="cyan"
        />
        <Metric
          label="DISCOVERED ENDPOINTS"
          value={mission?.summary?.totalDiscoveredEndpoints ? `${mission.summary.totalDiscoveredEndpoints}` : '00'}
          change={isCompleted ? '100% Surface' : 'Unmapped'}
          icon={Target}
          tone="violet"
        />
        <Metric
          label="NEAR CONTRACT ATTESTATION"
          value={isCompleted && isNearConfigured ? 'CONFIRMED' : 'ONLINE'}
          change="harsha-swarm.testnet"
          icon={Award}
          tone="amber"
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel findings-panel">
          <div className="panel-heading">
            <div>
              <h3>Verified Real Vulnerabilities</h3>
              <p>Confirmed via differential authorization, Chromium DOM JavaScript execution, and price parameter tampering</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>VULNERABILITY</th>
                  <th>SEVERITY</th>
                  <th>AGENT</th>
                  <th>STATUS</th>
                  <th>AFFECTED ENDPOINT</th>
                </tr>
              </thead>
              <tbody>
                {mission?.verifiedFindings && mission.verifiedFindings.length > 0 ? (
                  mission.verifiedFindings.map((f) => (
                    <tr key={f.findingId}>
                      <td>
                        <div className="finding-title">{f.title}</div>
                        <div className="finding-target">{f.vulnerabilityType}</div>
                      </td>
                      <td>
                        <span className={`severity ${f.severity.toLowerCase()}`}>
                          <i />{f.severity}
                        </span>
                      </td>
                      <td>{f.sourceAgent}</td>
                      <td>
                        <span className="verify verified">
                          <ShieldCheck size={13} /> Verified
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{f.affectedEndpoint}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: '#8fa08e' }}>
                      <Target size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                      <strong style={{ color: '#d2dbd0', fontSize: '13px' }}>Target attack surface unscanned</strong>
                      <div style={{ fontSize: '11px', marginTop: '4px', color: '#778477' }}>
                        Click <strong>"Start a mission"</strong> above to deploy automated reconnaissance and specialist exploit agents.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h3>NEAR Testnet Record</h3>
              <p>Cryptographically verifiable on-chain audit trail</p>
            </div>
            <span
              className="live-small"
              style={{
                background: isCompleted && isNearConfigured ? '#B6FF5C' : '#1e2820',
                color: isCompleted && isNearConfigured ? '#000' : '#8fa08e',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
              }}
            >
              {isCompleted && isNearConfigured ? 'ON-CHAIN' : 'TESTNET READY'}
            </span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>CONTRACT ID</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px', color: '#eef2ec' }}>
                harsha-swarm.testnet
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>MARKET CONTRACT</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px', color: '#eef2ec' }}>
                market.harsha-swarm.testnet
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>LATEST ATTESTATION TX</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px', wordBreak: 'break-all', color: '#B6FF5C' }}>
                {mission?.nearAttestation?.missionTxHash || 'Awaiting mission trigger to broadcast on-chain hash'}
              </div>
            </div>
            {mission?.nearAttestation?.explorerUrl && (
              <a
                href={mission.nearAttestation.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center', marginTop: '4px' }}
              >
                View on NearBlocks Explorer <ExternalLink size={13} />
              </a>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

function BountyMarket({
  marketRounds,
  contractId,
}: {
  marketRounds?: MarketRound[]
  contractId?: string
}) {
  const cid = contractId || "market.harsha-swarm.testnet"
  const hasRounds = marketRounds && marketRounds.length > 0

  return (
    <>
      <SectionHeader
        eyebrow="SWARM BOUNTY MARKET · COMMIT-REVEAL AUCTION"
        title="Decentralized Agent Market"
        description="Competing agent sub-accounts submit sealed bids for task bounties. Escrowed payouts are released only after independent replay verification."
      />

      <div className="metrics-grid">
        <Metric label="MARKET CONTRACT" value="ONLINE" change={cid} icon={Coins} tone="lime" />
        <Metric label="AUCTION ROUNDS" value={hasRounds ? `0${marketRounds.length}` : '00'} change={hasRounds ? 'Settled' : 'Ready'} icon={Gavel} tone="cyan" />
        <Metric label="ESCROW BOUNTIES PAID" value={hasRounds ? `${(marketRounds.length * 0.01).toFixed(2)} NEAR` : '0.00 NEAR'} change="Verified" icon={Award} tone="amber" />
        <Metric label="COMPETING AGENTS" value="05" change="Sub-Accounts" icon={Users} tone="violet" />
      </div>

      <div className="demo-notice" style={{ borderColor: 'rgba(182, 255, 92, 0.3)', background: 'rgba(182, 255, 92, 0.05)', color: '#dbe9d6', marginBottom: '18px' }}>
        <Scale size={18} color="#B6FF5C" style={{ flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#B6FF5C' }}>DETERMINISTIC AUCTION SCORING:</strong>
          <span style={{ fontFamily: 'monospace', marginLeft: 8, fontSize: '11px', color: '#caff91' }}>
            Score = (Confidence_Bps × (1 + Reputation) × 10¹²) / Cost_Yocto
          </span>
          <div style={{ fontSize: '11px', color: '#9ba897', marginTop: '4px' }}>
            Phase 1 (Commit): Agents submit sha256(bidder|taskId|confidence|cost|salt) to prevent front-running.
            Phase 2 (Reveal): Preimages are cryptographically verified by the smart contract.
            Phase 3 (Payout): Reward transferred ONLY when finding reproduction is independently confirmed.
          </div>
        </div>
      </div>

      {!hasRounds ? (
        <div className="panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#9ba897' }}>
          <Coins size={36} color="#B6FF5C" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.8 }} />
          <strong style={{ fontSize: '16px', color: '#edf2ea' }}>Auction Market Standing By</strong>
          <p style={{ maxWidth: '560px', margin: '8px auto 0', fontSize: '12px', color: '#8fa08e', lineHeight: 1.6 }}>
            When a mission is triggered, the coordinator opens 3 sealed-bid auction rounds on <code style={{ color: '#B6FF5C' }}>{cid}</code>.
            5 competing agent sub-accounts (<code style={{ color: '#d2dbd0' }}>idor</code>, <code style={{ color: '#d2dbd0' }}>xss</code>, <code style={{ color: '#d2dbd0' }}>logic</code>, <code style={{ color: '#d2dbd0' }}>gen1</code>, <code style={{ color: '#d2dbd0' }}>gen2</code>) submit cryptographically sealed bids that are settled deterministically on-chain.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {marketRounds.map((round, idx) => (
            <div key={round.roundId} className="panel" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #242d26', paddingBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="live-indicator" style={{ background: '#B6FF5C', color: '#000', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>
                      ROUND 0{idx + 1}
                    </span>
                    <strong style={{ fontSize: '14px', color: '#edf2ea' }}>{round.taskName}</strong>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#778477' }}>({round.taskId})</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#8fa08e', marginTop: '4px' }}>
                    Reward: <strong style={{ color: '#B6FF5C' }}>{round.rewardNear} NEAR</strong> · Winner: <strong style={{ color: '#caff91' }}>{round.winnerAccount}</strong> (Score: {round.winnerScore})
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px',
                      color: (PAYOUT_TONE[round.payoutStatus] ?? PAYOUT_TONE.pending).color,
                      border: `1px solid ${(PAYOUT_TONE[round.payoutStatus] ?? PAYOUT_TONE.pending).border}`,
                    }}
                  >
                    <ShieldCheck size={14} /> {round.payoutStatus === 'refunded' ? 'Escrow' : 'Payout'}: {round.payoutStatus.toUpperCase()}
                  </span>
                  {round.payoutTxHash && (
                    <a
                      href={`https://testnet.nearblocks.io/txns/${round.payoutTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="system-pill"
                      style={{ textDecoration: 'none', color: '#B6FF5C', border: '1px solid #B6FF5C' }}
                    >
                      TX: {round.payoutTxHash.slice(0, 8)}... <ExternalLink size={10} style={{ marginLeft: 3 }} />
                    </a>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                <ProofChip
                  ok={round.winnerSource === 'local_simulation' ? undefined : round.winnerSource === 'on_chain_settle'}
                  label={round.winnerSource === 'local_simulation' ? 'local simulation (no chain)' : 'winner read from get_round'}
                />
                {round.bountyPricing && (
                  <ProofChip
                    ok={round.bountyPricing.pricingSource === 'near_intents_1click_dry_quote'}
                    label={
                      round.bountyPricing.pricingSource === 'near_intents_1click_dry_quote'
                        ? `1Click quote: $${round.bountyPricing.bountyUsd} ≈ ${round.bountyPricing.escrowNear} NEAR`
                        : `fixed escrow ${round.bountyPricing.escrowNear} NEAR (quote unavailable)`
                    }
                    title={round.bountyPricing.quote?.correlationId ? `1Click correlationId ${round.bountyPricing.quote.correlationId}` : undefined}
                  />
                )}
                {round.mcpAudit && (
                  <ProofChip
                    ok={round.mcpAudit.approved}
                    label={round.mcpAudit.approved ? 'NEAR MCP audit approved' : 'NEAR MCP audit rejected'}
                    title={round.mcpAudit.reasons.join('; ') || `round ${round.mcpAudit.roundStatus}, winner key scoped`}
                  />
                )}
                {round.phaseEnforcement && round.phaseEnforcement !== 'local_simulation' && (
                  <ProofChip
                    ok={round.phaseEnforcement === 'on_chain'}
                    label={round.phaseEnforcement === 'on_chain' ? 'commit phase closed on-chain' : 'no on-chain phases'}
                    title={round.startRevealTxHash ? `start_reveal tx ${round.startRevealTxHash}` : undefined}
                  />
                )}
                {round.proofHash && (
                  <ProofChip
                    ok={round.proofStoredOnChain}
                    label={`proof ${round.proofHash.slice(0, 8)}… ${round.proofStoredOnChain ? 'stored on-chain' : 'not on-chain'}`}
                    title={round.proofHash}
                  />
                )}
                {round.operatorKeyModes?.settle && (
                  <ProofChip
                    ok={round.operatorKeyModes.settle === 'function_call_key'}
                    label={`settle signed: ${round.operatorKeyModes.settle.replace(/_/g, ' ')}`}
                  />
                )}
              </div>

              <div className="table-wrap" style={{ marginTop: '12px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>BIDDER AGENT</th>
                      <th>TESTNET SUB-ACCOUNT</th>
                      <th>SIGNED WITH</th>
                      <th>CONFIDENCE</th>
                      <th>SCRIPTED COST UNITS</th>
                      <th>AUCTION SCORE</th>
                      <th>AUCTION OUTCOME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.allBids.map((b) => {
                      const isWinner = b.account === round.winnerAccount
                      return (
                        <tr key={b.account} style={{ background: isWinner ? 'rgba(182, 255, 92, 0.04)' : undefined }}>
                          <td>
                            <strong>{b.agentId}</strong>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{b.account}</td>
                          <td style={{ fontSize: '11px' }}>
                            {b.signingMode === 'agent_key' && b.commitTxHash ? (
                              <a href={`https://testnet.nearblocks.io/txns/${b.commitTxHash}`} target="_blank" rel="noreferrer" style={{ color: '#B6FF5C' }}>
                                own FC key ↗
                              </a>
                            ) : b.signingMode === 'missing_key' ? (
                              <span style={{ color: '#ff6b6b' }}>no key: not submitted</span>
                            ) : (
                              <span style={{ color: '#778477' }}>{b.signingMode === 'local_simulation' ? 'local only' : '—'}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ color: isWinner ? '#B6FF5C' : '#a5afa3', fontWeight: isWinner ? 700 : 400 }}>
                              {(b.confidenceBps / 100).toFixed(0)}%
                            </span>
                            <div style={{ fontSize: '9px', color: b.confidenceSource === 'near_ai_tee_verified' ? '#B6FF5C' : '#778477' }}>
                              {b.confidenceSource === 'near_ai_tee_verified' ? 'NEAR AI (TEE-verified)' : 'scripted'}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                            {b.costYocto} units
                          </td>
                          <td>
                            <strong style={{ color: isWinner ? '#B6FF5C' : '#a5afa3' }}>{b.score.toFixed(2)}</strong>
                          </td>
                          <td>
                            {isWinner ? (
                              <span className="verify verified" style={{ fontWeight: 700 }}>
                                <CheckCircle size={13} /> WINNER (AWARDED)
                              </span>
                            ) : (
                              <span style={{ color: '#778477', fontSize: '10px' }}>
                                OUTBID
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function AgentNetwork({ agents }: { agents: { name: string; specialty: string; action: string; findings: number }[] }) {
  return (
    <>
      <SectionHeader
        eyebrow="SEQUENTIAL MULTI-AGENT ARCHITECTURE"
        title="Specialist Agent Network"
        description="Specialized rule-based security state machines executing sequential attack-surface testing."
      />
      <div className="agent-grid full-grid">
        {agents.map((agent) => (
          <article className="agent-card" key={agent.name}>
            <div className="agent-card-head">
              <div className="agent-avatar lime">{agent.name.slice(0, 2)}</div>
              <div className="agent-identity">
                <strong>{agent.name}</strong>
                <span>{agent.specialty}</span>
              </div>
            </div>
            <div className="agent-action">
              <span>RESPONSIBILITY & ROLE</span>
              <p>{agent.action}</p>
            </div>
            <div className="agent-card-foot">
              <span className="agent-status completed"><i />Standing By</span>
              <span className="reputation"><Award size={13} />{agent.findings} Verified Finding(s)</span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function Findings({ mission }: { mission: MissionData | null }) {
  const hasFindings = mission?.verifiedFindings && mission.verifiedFindings.length > 0

  return (
    <>
      <SectionHeader
        eyebrow="REPRODUCIBLE VULNERABILITY FINDINGS"
        title="Verified Security Findings"
        description="Independently confirmed vulnerabilities on http://localhost:4000/shop."
      />
      <div className="panel findings-page-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>VULNERABILITY</th>
                <th>SEVERITY</th>
                <th>SPECIALIST AGENT</th>
                <th>VERIFICATION RATIONALE</th>
                <th>AFFECTED ENDPOINT</th>
              </tr>
            </thead>
            <tbody>
              {hasFindings ? (
                mission.verifiedFindings.map((f) => (
                  <tr key={f.findingId}>
                    <td>
                      <div className="finding-title">{f.title}</div>
                      <div className="finding-target">{f.vulnerabilityType}</div>
                    </td>
                    <td>
                      <span className={`severity ${f.severity.toLowerCase()}`}>
                        <i />{f.severity}
                      </span>
                    </td>
                    <td>{f.sourceAgent}</td>
                    <td style={{ fontSize: '12px', color: '#c5d1c4' }}>{f.verificationRationale}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{f.affectedEndpoint}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: '#8fa08e' }}>
                    <ShieldAlert size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                    <strong style={{ color: '#d2dbd0', fontSize: '13px' }}>No verified findings loaded</strong>
                    <div style={{ fontSize: '11px', marginTop: '4px', color: '#778477' }}>
                      Start a mission from Mission Control to run automated differential authorization, DOM XSS injection, and price tampering tests.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Leaderboard({ repData }: { repData: ReputationData | null }) {
  const getRep = (agent: string) => {
    if (!repData || !repData.configured || !repData.reputation) return 'NEAR not configured'
    return `${repData.reputation[agent] ?? 0} pts`
  }

  const agentsList = [
    { rank: '01', name: 'IdorAgent', specialty: 'BOLA / Object-Level Access Control', findings: 1, rep: getRep('IdorAgent') },
    { rank: '02', name: 'XssAgent', specialty: 'Stored Cross-Site Scripting (DOM)', findings: 1, rep: getRep('XssAgent') },
    { rank: '03', name: 'BusinessLogicAgent', specialty: 'Client Price Manipulation Logic', findings: 1, rep: getRep('BusinessLogicAgent') },
    { rank: '04', name: 'ReconAgent', specialty: 'Playwright Surface Discovery & Crawl', findings: 0, rep: getRep('ReconAgent') },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="ON-CHAIN REPUTATION INDEX"
        title="Agent Leaderboard"
        description="Reputation points read directly from the NEAR Protocol Testnet contract (increments when an agent finding is independently verified and payout is released)."
      />
      <div className="panel leaderboard-panel">
        <div className="table-wrap">
          <table className="leader-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>AGENT</th>
                <th>SPECIALTY</th>
                <th>ON-CHAIN REPUTATION</th>
                <th>MISSION FINDINGS</th>
              </tr>
            </thead>
            <tbody>
              {agentsList.map((row) => (
                <tr key={row.rank}>
                  <td><span className={`rank-number ${row.rank === '01' ? 'first' : ''}`}>{row.rank}</span></td>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.specialty}</td>
                  <td><strong className="score-number">{row.rep}</strong></td>
                  <td><span className="verified-number"><ShieldCheck size={13} /> {row.findings}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function App() {
  const [active, setActive] = useState<View>('Mission Control')
  const [mission, setMission] = useState<MissionData | null>(null)
  const [repData, setRepData] = useState<ReputationData | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [integrityLoading, setIntegrityLoading] = useState(false)
  const [integrityError, setIntegrityError] = useState<string | null>(null)
  const [integrityResult, setIntegrityResult] = useState<{
    status: string
    computedLocalHash: string
    storedOnChainHash: string
    tampered: boolean
    explorerUrl?: string
  } | null>(null)

  const fetchMissionData = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/missions/latest')
      if (res.ok) {
        const data = await res.json()
        setMission(data)
      } else {
        setMission(null)
      }
    } catch {
      // Backend not yet reachable
    }

    try {
      const repRes = await fetch('http://localhost:4000/api/near/reputation')
      if (repRes.ok) {
        const rData = await repRes.json()
        setRepData(rData)
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    // Load after mount (async), and ignore the result if unmounted first.
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) fetchMissionData()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleStartMission = async () => {
    setIsRunning(true)
    setIntegrityResult(null)
    setIntegrityError(null)
    try {
      const res = await fetch('http://localhost:4000/api/missions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'http://localhost:4000/shop' }),
      })
      if (res.ok) {
        const data = await res.json()
        setMission(data)
        fetchMissionData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsRunning(false)
    }
  }

  const handleResetDemo = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/demo/reset', { method: 'POST' })
      if (res.ok) {
        setMission(null)
        setIntegrityResult(null)
        setIntegrityError(null)
      }
    } catch (err) {
      console.error('Reset error:', err)
      setMission(null)
      setIntegrityResult(null)
      setIntegrityError(null)
    }
  }

  const handleVerifyIntegrity = async (tampered = false) => {
    setIntegrityLoading(true)
    setIntegrityError(null)
    try {
      console.log(`[Integrity] Requesting integrity check (tampered=${tampered}, missionId=${mission?.missionId})…`)
      const res = await fetch('http://localhost:4000/api/missions/verify-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission?.missionId, tamperedFinding: tampered }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }))
        const errorMsg = errJson.error || `Verification request failed with HTTP ${res.status}`
        console.error('[Integrity] Endpoint returned error:', errorMsg)
        setIntegrityError(errorMsg)
        setIntegrityResult(null)
        return
      }
      const data = await res.json()
      console.log('[Integrity] Verification response received:', data)
      setIntegrityResult(data)
    } catch (err) {
      const errorMsg = (err as Error).message || 'Failed to connect to backend server at http://localhost:4000'
      console.error('[Integrity] Error during verification:', err)
      setIntegrityError(errorMsg)
      setIntegrityResult(null)
    } finally {
      setIntegrityLoading(false)
    }
  }

  const specialistAgents = [
    { name: 'ReconAgent', specialty: 'Surface Discovery & Mapping', action: 'Playwright headless browser crawling of shop pages, forms, and network API endpoints.', findings: 0 },
    { name: 'IdorAgent', specialty: 'BOLA / IDOR Testing', action: 'Differential access control verification on object-level resource endpoints (/shop/api/orders/:id).', findings: 1 },
    { name: 'XssAgent', specialty: 'Stored XSS Specialist', action: 'Browser-driven injection testing in review forms, verifying innerHTML sink DOM code execution.', findings: 1 },
    { name: 'BusinessLogicAgent', specialty: 'Business Logic / Price Manipulation', action: 'Testing parameter tampering during checkout to verify server-side price validation.', findings: 1 },
  ]

  const marketCount = mission?.marketRounds?.length || 0
  const findingsCount = mission?.verifiedFindings?.length || 0

  return (
    <div className="app-shell">
      <Sidebar
        active={active}
        onChange={setActive}
        marketCount={marketCount}
        findingsCount={findingsCount}
      />
      <main className="main-shell">
        <Topbar
          active={active}
          nearTx={mission?.nearAttestation?.missionTxHash}
          isRunning={isRunning}
          onResetDemo={handleResetDemo}
        />
        <div className="page-content">
          {active === 'Mission Control' ? (
            <MissionControl
              mission={mission}
              isRunning={isRunning}
              onStartMission={handleStartMission}
              onResetDemo={handleResetDemo}
              onVerifyIntegrity={handleVerifyIntegrity}
              integrityResult={integrityResult}
              integrityLoading={integrityLoading}
              integrityError={integrityError}
            />
          ) : active === 'Bounty Market' ? (
            <BountyMarket
              marketRounds={mission?.marketRounds}
              contractId="market.harsha-swarm.testnet"
            />
          ) : active === 'Agent Network' ? (
            <AgentNetwork agents={specialistAgents} />
          ) : active === 'Findings' ? (
            <Findings mission={mission} />
          ) : (
            <Leaderboard repData={repData} />
          )}
          <footer className="footer">
            <span>BUGBOUNTY SWARM — MULTI-AGENT SECURITY RESEARCH PLATFORM</span>
            <span>NEAR TESTNET ATTESTED (harsha-swarm.testnet) · SEQUENTIAL PIPELINE</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
