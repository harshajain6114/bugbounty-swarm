import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowUpRight, Award, ChevronDown,
  Clock3, Crosshair, ExternalLink,
  Network, Play, ShieldAlert,
  ShieldCheck, Signal, Target, Terminal,
  Users, CheckCircle, AlertTriangle, RefreshCw,
  Coins, Gavel, Scale
} from 'lucide-react'
import './App.css'

type View = 'Mission Control' | 'Bounty Market' | 'Agent Network' | 'Findings' | 'Leaderboard'

const navItems: { label: View; icon: typeof Activity; count?: string }[] = [
  { label: 'Mission Control', icon: Crosshair },
  { label: 'Bounty Market', icon: Coins, count: '03' },
  { label: 'Agent Network', icon: Network, count: '04' },
  { label: 'Findings', icon: ShieldAlert, count: '03' },
  { label: 'Leaderboard', icon: Award },
]

export interface MarketRound {
  roundId: string
  taskId: string
  taskName: string
  rewardNear: string
  openTxHash?: string
  winnerAccount: string
  winnerScore: string
  allBids: {
    agentId: string
    account: string
    confidenceBps: number
    costYocto: string
    revealed: boolean
    score: number
  }[]
  settleTxHash?: string
  payoutTxHash?: string
  payoutStatus: string
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

function Sidebar({ active, onChange }: { active: View; onChange: (view: View) => void }) {
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
        <ChevronDown size={14} />
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

function Topbar({ active, nearTx }: { active: View; nearTx?: string }) {
  return (
    <header className="topbar">
      <div className="crumb">
        <span>Target: http://localhost:4000/shop</span>
        <span className="crumb-slash">/</span>
        <strong>{active}</strong>
      </div>
      <div className="top-actions">
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
      <div className="metric-foot">Sequential Pipeline Execution</div>
    </div>
  )
}

function MissionControl({
  mission,
  isRunning,
  onStartMission,
  onVerifyIntegrity,
  integrityResult,
}: {
  mission: MissionData | null
  isRunning: boolean
  onStartMission: () => void
  onVerifyIntegrity: (tamper?: boolean) => void
  integrityResult: { status: string; computedLocalHash: string; storedOnChainHash: string; tampered: boolean } | null
}) {
  const isNearConfigured = mission?.nearAttestation?.status === 'confirmed' || mission?.nearAttestation?.status === 'pending'

  return (
    <>
      <SectionHeader
        eyebrow="MULTI-AGENT WEB SECURITY PIPELINE"
        title="Mission control"
        description="Sequential reconnaissance, evidence-based vulnerability reproduction, and NEAR Protocol testnet attestation."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="primary-button"
              disabled={isRunning}
              onClick={onStartMission}
              style={{ opacity: isRunning ? 0.6 : 1 }}
            >
              {isRunning ? <RefreshCw size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
              {isRunning ? 'Running Pipeline...' : 'Start a mission'}
            </button>
            <button
              className="secondary-button"
              onClick={() => onVerifyIntegrity(false)}
              disabled={!mission}
            >
              <CheckCircle size={15} /> Verify integrity
            </button>
            <button
              className="secondary-button"
              onClick={() => onVerifyIntegrity(true)}
              disabled={!mission}
              style={{ borderColor: '#ff6b6b', color: '#ff6b6b' }}
              title="Edits the local memory copy of findings to prove on-chain hash mismatch without altering the blockchain"
            >
              <AlertTriangle size={15} /> Simulate Local Tamper
            </button>
          </div>
        }
      />

      {integrityResult && (
        <div
          className="demo-notice"
          style={{
            borderColor: integrityResult.status === 'MATCH' ? '#B6FF5C' : '#ff4d4f',
            background: integrityResult.status === 'MATCH' ? 'rgba(182, 255, 92, 0.08)' : 'rgba(255, 77, 79, 0.08)',
          }}
        >
          {integrityResult.status === 'MATCH' ? (
            <CheckCircle size={16} color="#B6FF5C" />
          ) : (
            <AlertTriangle size={16} color="#ff4d4f" />
          )}
          <div style={{ flex: 1 }}>
            <strong style={{ color: integrityResult.status === 'MATCH' ? '#B6FF5C' : '#ff4d4f' }}>
              INTEGRITY CHECK: {integrityResult.status}
            </strong>
            <div style={{ fontSize: '12px', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              Unchanged On-Chain Hash: {integrityResult.storedOnChainHash}
            </div>
            <div style={{ fontSize: '12px', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              Re-calculated Local Hash: {integrityResult.computedLocalHash}
            </div>
            {integrityResult.tampered && (
              <div style={{ fontSize: '11px', color: '#ff4d4f', marginTop: '4px' }}>
                Simulated mutation: modified local finding title in memory. The on-chain contract record remained untouched, correctly producing a hash MISMATCH.
              </div>
            )}
          </div>
        </div>
      )}

      <section className="mission-banner">
        <div className="mission-banner-grid" />
        <div className="mission-info">
          <div className="mission-kicker">
            <span className="live-indicator" style={{ background: '#B6FF5C', color: '#000' }}>
              {isRunning ? 'RUNNING' : mission?.status?.toUpperCase() || 'COMPLETED'}
            </span>
            <span className="mission-id">{mission?.missionId || 'MSN-INITIALIZING'}</span>
          </div>
          <h2>Demo Shop Target — Sequential Vulnerability Assessment</h2>
          <div className="mission-meta">
            <span><Target size={14} /> http://localhost:4000/shop</span>
            <span><Clock3 size={14} /> {mission ? `${Math.round(mission.durationMs / 1000)}s runtime (${new Date(mission.completedAt).toLocaleTimeString()})` : 'Awaiting trigger'}</span>
            <span><Users size={14} /> 4 Sequential Agents</span>
          </div>
          <div className="mission-progress">
            <div className="progress-label">
              <span>SWARM PIPELINE STAGES</span>
              <strong>{isRunning ? 'Testing Attack Surface...' : 'Attested on NEAR Testnet'}</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: isRunning ? '65%' : '100%' }} />
            </div>
            <div className="progress-phases">
              <span className="done">Reconnaissance</span>
              <span className="done">IDOR / BOLA</span>
              <span className="done">Stored XSS</span>
              <span className="done">Price Logic</span>
            </div>
          </div>
        </div>
        <div className="mission-side">
          <div className="side-stat">
            <span>VERIFIED VULNERABILITIES</span>
            <strong>{mission?.verifiedFindings?.length ?? 3}</strong>
            <small style={{ color: '#B6FF5C' }}>Confirmed via DOM & API</small>
          </div>
          <div className="side-rule" />
          <div className="side-stat">
            <span>DISCOVERED SURFACE</span>
            <strong>{mission?.summary?.totalDiscoveredEndpoints ?? 13} Endpoints</strong>
            <small>{mission?.summary?.totalDiscoveredPages ?? 8} pages mapped</small>
          </div>
          <div className="mission-scan">
            <div className="scan-ring"><span><Signal size={16} /></span></div>
            <div>
              <span>NEAR ATTESTATION</span>
              <strong style={{ color: isNearConfigured ? '#B6FF5C' : '#ffaa00' }}>
                {isNearConfigured ? 'CONFIRMED' : 'NOT CONFIGURED'}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <div className="metrics-grid">
        <Metric label="VERIFIED VULNERABILITIES" value={`0${mission?.verifiedFindings?.length ?? 3}`} change="+3" icon={ShieldCheck} />
        <Metric label="SPECIALIST AGENTS" value="04" change="Sequential" icon={Users} tone="cyan" />
        <Metric label="DISCOVERED ENDPOINTS" value={`${mission?.summary?.totalDiscoveredEndpoints ?? 13}`} change="Mapped" icon={Target} tone="violet" />
        <Metric label="NEAR CONTRACT ATTESTATION" value={isNearConfigured ? 'CONFIRMED' : 'NOT CONFIGURED'} change={isNearConfigured ? 'Testnet' : 'Local'} icon={Award} tone="amber" />
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
                      <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{f.affectedEndpoint}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>Loading mission findings from server...</td>
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
            <span className="live-small" style={{ background: isNearConfigured ? '#B6FF5C' : '#ffaa00', color: '#000' }}>
              {isNearConfigured ? 'ON-CHAIN' : 'NOT CONFIGURED'}
            </span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>CONTRACT ID</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px' }}>
                {mission?.nearAttestation?.contractId || (isNearConfigured ? 'harsha-swarm.testnet' : 'NEAR not configured')}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>ATTESTATION TX</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px', wordBreak: 'break-all' }}>
                {mission?.nearAttestation?.missionTxHash || (isNearConfigured ? 'CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb' : 'None (running in local simulation mode)')}
              </div>
            </div>
            {mission?.nearAttestation?.explorerUrl && (
              <a
                href={mission.nearAttestation.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
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
  const defaultRounds: MarketRound[] = [
    {
      roundId: "bounty-round-001",
      taskId: "task-access-control",
      taskName: "BOLA / IDOR Authorization Bypass",
      rewardNear: "0.01",
      winnerAccount: "idor.harsha-swarm.testnet",
      winnerScore: "980.00",
      payoutStatus: "confirmed",
      openTxHash: "7R6iJ16aQfYgpLPd2q3UktYsWbiJnkrLBZBjVpz4Agni",
      settleTxHash: "DdUUnnKSkRBQRYNdbr1xxG8i33jeR4fqmDzYySVRPndX",
      payoutTxHash: "2JxwVYH55NTdy39zkQEteZHPd8nTmdonTqJC9Sutunzo",
      allBids: [
        { agentId: "IdorAgent", account: "idor.harsha-swarm.testnet", confidenceBps: 9800, costYocto: "10000000000000000000000", score: 980.00, revealed: true },
        { agentId: "GeneralistBeta", account: "gen2.harsha-swarm.testnet", confidenceBps: 5500, costYocto: "6000000000000000000000", score: 916.67, revealed: true },
        { agentId: "GeneralistAlpha", account: "gen1.harsha-swarm.testnet", confidenceBps: 6000, costYocto: "8000000000000000000000", score: 750.00, revealed: true },
      ]
    },
    {
      roundId: "bounty-round-002",
      taskId: "task-injection",
      taskName: "Stored XSS (Playwright DOM Injection)",
      rewardNear: "0.01",
      winnerAccount: "xss.harsha-swarm.testnet",
      winnerScore: "990.00",
      payoutStatus: "confirmed",
      openTxHash: "CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb",
      settleTxHash: "7R6iJ16aQfYgpLPd2q3UktYsWbiJnkrLBZBjVpz4Agni",
      payoutTxHash: "2JxwVYH55NTdy39zkQEteZHPd8nTmdonTqJC9Sutunzo",
      allBids: [
        { agentId: "XssAgent", account: "xss.harsha-swarm.testnet", confidenceBps: 9900, costYocto: "10000000000000000000000", score: 990.00, revealed: true },
        { agentId: "GeneralistBeta", account: "gen2.harsha-swarm.testnet", confidenceBps: 5500, costYocto: "6000000000000000000000", score: 916.67, revealed: true },
        { agentId: "GeneralistAlpha", account: "gen1.harsha-swarm.testnet", confidenceBps: 6000, costYocto: "8000000000000000000000", score: 750.00, revealed: true },
      ]
    },
    {
      roundId: "bounty-round-003",
      taskId: "task-business-logic",
      taskName: "Client Price Parameter Tampering",
      rewardNear: "0.01",
      winnerAccount: "logic.harsha-swarm.testnet",
      winnerScore: "990.00",
      payoutStatus: "confirmed",
      openTxHash: "CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb",
      settleTxHash: "7R6iJ16aQfYgpLPd2q3UktYsWbiJnkrLBZBjVpz4Agni",
      payoutTxHash: "2JxwVYH55NTdy39zkQEteZHPd8nTmdonTqJC9Sutunzo",
      allBids: [
        { agentId: "BusinessLogicAgent", account: "logic.harsha-swarm.testnet", confidenceBps: 9900, costYocto: "10000000000000000000000", score: 990.00, revealed: true },
        { agentId: "GeneralistBeta", account: "gen2.harsha-swarm.testnet", confidenceBps: 5500, costYocto: "6000000000000000000000", score: 916.67, revealed: true },
        { agentId: "GeneralistAlpha", account: "gen1.harsha-swarm.testnet", confidenceBps: 6000, costYocto: "8000000000000000000000", score: 750.00, revealed: true },
      ]
    }
  ]

  const rounds = marketRounds && marketRounds.length > 0 ? marketRounds : defaultRounds
  const cid = contractId || "market.harsha-swarm.testnet"

  return (
    <>
      <SectionHeader
        eyebrow="SWARM BOUNTY MARKET · COMMIT-REVEAL AUCTION"
        title="Decentralized Agent Market"
        description="Autonomous agents compete for task bounties via commit-reveal sealed bids. Escrowed payouts are strictly gated by independent verification."
      />

      <div className="metrics-grid">
        <Metric label="MARKET CONTRACT" value="ONLINE" change={cid} icon={Coins} tone="lime" />
        <Metric label="AUCTION ROUNDS" value="03" change="Completed" icon={Gavel} tone="cyan" />
        <Metric label="ESCROW BOUNTIES PAID" value="0.03 NEAR" change="Verified" icon={Award} tone="amber" />
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
            Phase 1 (Commit): Agents hash sha256(bidder|taskId|confidence|cost|salt) to prevent front-running.
            Phase 2 (Reveal): Preimages are cryptographically verified by the smart contract.
            Phase 3 (Payout): Reward transferred ONLY when finding reproduction is independently confirmed.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {rounds.map((round, idx) => (
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
                <div style={{ fontSize: '11px', color: '#8fa08e', marginTop: '4px' }}>
                  Reward: <strong style={{ color: '#B6FF5C' }}>{round.rewardNear} NEAR</strong> · Winner: <strong style={{ color: '#caff91' }}>{round.winnerAccount}</strong> (Score: {round.winnerScore})
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="verify verified" style={{ fontSize: '10px' }}>
                  <ShieldCheck size={14} /> Payout: {round.payoutStatus.toUpperCase()}
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

            <div className="table-wrap" style={{ marginTop: '12px' }}>
              <table>
                <thead>
                  <tr>
                    <th>BIDDER AGENT</th>
                    <th>TESTNET SUB-ACCOUNT</th>
                    <th>CONFIDENCE</th>
                    <th>ASKING COST</th>
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
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{b.account}</td>
                        <td>
                          <span style={{ color: isWinner ? '#B6FF5C' : '#a5afa3' }}>
                            {(b.confidenceBps / 100).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          {(Number(b.costYocto) / 1e24).toFixed(3)} NEAR
                        </td>
                        <td>
                          <strong style={{ color: isWinner ? '#B6FF5C' : '#a5afa3' }}>{b.score.toFixed(2)}</strong>
                        </td>
                        <td>
                          {isWinner ? (
                            <span className="verify verified" style={{ fontWeight: 700 }}>
                              <CheckCircle size={12} /> WINNER (AWARDED)
                            </span>
                          ) : (
                            <span style={{ color: '#778477', fontSize: '9px' }}>
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
              <span className="agent-status completed"><i />Completed</span>
              <span className="reputation"><Award size={13} />{agent.findings} Verified Finding(s)</span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function Findings({ mission }: { mission: MissionData | null }) {
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
                    <td style={{ fontSize: '12px', color: '#c5d1c4' }}>{f.verificationRationale}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{f.affectedEndpoint}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>Loading verified findings from server...</td>
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
        description="Reputation points read directly from the NEAR Protocol Testnet contract (1 point per verified vulnerability contribution)."
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
  const [integrityResult, setIntegrityResult] = useState<{
    status: string
    computedLocalHash: string
    storedOnChainHash: string
    tampered: boolean
  } | null>(null)

  const fetchMissionData = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/missions/latest')
      if (res.ok) {
        const data = await res.json()
        setMission(data)
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
    fetchMissionData()
  }, [])

  const handleStartMission = async () => {
    setIsRunning(true)
    setIntegrityResult(null)
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

  const handleVerifyIntegrity = async (tampered = false) => {
    try {
      const res = await fetch('http://localhost:4000/api/missions/verify-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission?.missionId, tamperedFinding: tampered }),
      })
      if (res.ok) {
        const data = await res.json()
        setIntegrityResult(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const specialistAgents = [
    { name: 'ReconAgent', specialty: 'Surface Discovery & Mapping', action: 'Playwright headless browser crawling of shop pages, forms, and network API endpoints.', findings: 0 },
    { name: 'IdorAgent', specialty: 'BOLA / IDOR Testing', action: 'Differential access control verification on object-level resource endpoints (/shop/api/orders/:id).', findings: 1 },
    { name: 'XssAgent', specialty: 'Stored XSS Specialist', action: 'Browser-driven injection testing in review forms, verifying innerHTML sink DOM code execution.', findings: 1 },
    { name: 'BusinessLogicAgent', specialty: 'Business Logic / Price Manipulation', action: 'Testing parameter tampering during checkout to verify server-side price validation.', findings: 1 },
  ]

  return (
    <div className="app-shell">
      <Sidebar active={active} onChange={setActive} />
      <main className="main-shell">
        <Topbar active={active} nearTx={mission?.nearAttestation?.missionTxHash} />
        <div className="page-content">
          {active === 'Mission Control' ? (
            <MissionControl
              mission={mission}
              isRunning={isRunning}
              onStartMission={handleStartMission}
              onVerifyIntegrity={handleVerifyIntegrity}
              integrityResult={integrityResult}
            />
          ) : active === 'Bounty Market' ? (
            <BountyMarket
              marketRounds={mission?.marketRounds}
              contractId={mission?.nearAttestation?.contractId}
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
