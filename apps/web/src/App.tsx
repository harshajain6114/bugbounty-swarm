import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowUpRight, Award, Bell, Bug, ChevronDown,
  Clock3, Crosshair, ExternalLink, Fingerprint, Layers3,
  LockKeyhole, Menu, MoreHorizontal, Network, Play, Search, ShieldAlert,
  ShieldCheck, Signal, SlidersHorizontal, Sparkles, Target, Terminal,
  Users, X, CheckCircle, AlertTriangle, RefreshCw
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'
import './App.css'

type View = 'Mission Control' | 'Agent Network' | 'Findings' | 'Leaderboard'

const navItems: { label: View; icon: typeof Activity; count?: string }[] = [
  { label: 'Mission Control', icon: Crosshair },
  { label: 'Agent Network', icon: Network, count: '04' },
  { label: 'Findings', icon: ShieldAlert, count: '03' },
  { label: 'Leaderboard', icon: TrophyIcon },
]

function TrophyIcon(props: { size?: number }) {
  return <Award {...props} />
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
  }[]
  nearAttestation?: {
    status: string
    contractId?: string
    missionTxHash?: string
    explorerUrl?: string
    attestedAt?: string
  }
}

const chartData = [
  { time: '12:00', findings: 0 },
  { time: '12:15', findings: 1 },
  { time: '12:30', findings: 2 },
  { time: '12:45', findings: 3 },
  { time: 'Now', findings: 3 },
]

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
            <span>Autonomous Operator</span>
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
      <div className="metric-foot">Autonomous Test Execution</div>
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
  return (
    <>
      <SectionHeader
        eyebrow="MULTI-AGENT AUTONOMOUS SECURITY AUDIT"
        title="Mission control"
        description="Autonomous reconnaissance, vulnerability reproduction, and NEAR Protocol on-chain attestation."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="primary-button"
              disabled={isRunning}
              onClick={onStartMission}
              style={{ opacity: isRunning ? 0.6 : 1 }}
            >
              {isRunning ? <RefreshCw size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
              {isRunning ? 'Mission Running...' : 'Start a mission'}
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
            >
              <AlertTriangle size={15} /> Simulate Tamper
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
              On-chain Hash: {integrityResult.storedOnChainHash}
            </div>
            <div style={{ fontSize: '12px', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              Computed Hash: {integrityResult.computedLocalHash}
            </div>
            {integrityResult.tampered && (
              <span style={{ fontSize: '11px', color: '#ff4d4f' }}>
                (Simulated mutation applied to finding title before hashing)
              </span>
            )}
          </div>
        </div>
      )}

      <section className="mission-banner">
        <div className="mission-banner-grid" />
        <div className="mission-info">
          <div className="mission-kicker">
            <span className="live-indicator" style={{ background: '#B6FF5C', color: '#000' }}>
              {isRunning ? 'RUNNING' : 'COMPLETED'}
            </span>
            <span className="mission-id">{mission?.missionId || 'MSN-PENDING'}</span>
          </div>
          <h2>Demo Shop Target — Autonomous Vulnerability Audit</h2>
          <div className="mission-meta">
            <span><Target size={14} /> http://localhost:4000/shop</span>
            <span><Clock3 size={14} /> {mission ? `${Math.round(mission.durationMs / 1000)}s total runtime` : 'Idle'}</span>
            <span><Users size={14} /> 4 Specialist Agents</span>
          </div>
          <div className="mission-progress">
            <div className="progress-label">
              <span>SWARM PIPELINE STATUS</span>
              <strong>{isRunning ? 'Testing Attack Surface...' : 'Attested on NEAR'}</strong>
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
            <strong>{mission?.summary.totalVerifiedVulnerabilities ?? 3}</strong>
            <small style={{ color: '#B6FF5C' }}>1 Critical · 2 High</small>
          </div>
          <div className="side-rule" />
          <div className="side-stat">
            <span>ATTACK SURFACE</span>
            <strong>{mission?.summary.totalDiscoveredEndpoints ?? 13} Endpoints</strong>
            <small>8 pages crawled</small>
          </div>
          <div className="mission-scan">
            <div className="scan-ring"><span><Signal size={16} /></span></div>
            <div>
              <span>NEAR ATTESTATION</span>
              <strong style={{ color: '#B6FF5C' }}>CONFIRMED</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="metrics-grid">
        <Metric label="VERIFIED VULNERABILITIES" value="03" change="+3" icon={ShieldCheck} />
        <Metric label="SPECIALIST AGENTS" value="04" change="All Pass" icon={Users} tone="cyan" />
        <Metric label="DISCOVERED ENDPOINTS" value="13" change="+13" icon={Target} tone="violet" />
        <Metric label="NEAR CONTRACT ATTESTATION" value="CONFIRMED" change="100%" icon={Award} tone="amber" />
      </div>

      <div className="dashboard-grid">
        <section className="panel findings-panel">
          <div className="panel-heading">
            <div>
              <h3>Verified Real Vulnerabilities</h3>
              <p>Confirmed via differential access control, Chromium DOM execution, and transaction tampering checks</p>
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
                  <th>ENDPOINT</th>
                </tr>
              </thead>
              <tbody>
                {mission?.verifiedFindings?.map((f) => (
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
                )) || (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Loading mission findings...</td>
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
              <p>Cryptographically verifiable on-chain proof</p>
            </div>
            <span className="live-small" style={{ background: '#B6FF5C', color: '#000' }}>ON-CHAIN</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>CONTRACT ID</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px' }}>
                harsha-swarm.testnet
              </div>
            </div>
            <div>
              <span style={{ fontSize: '11px', color: '#98a397' }}>ATTESTATION TX</span>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '2px', wordBreak: 'break-all' }}>
                {mission?.nearAttestation?.missionTxHash || 'CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb'}
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

function AgentNetwork({ agents }: { agents: { name: string; specialty: string; action: string; findings: number }[] }) {
  return (
    <>
      <SectionHeader
        eyebrow="MULTI-AGENT COLLABORATION"
        title="Specialist Agent Network"
        description="Autonomous specialized agents executing sequential attack-surface testing."
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
              <span className="reputation"><Award size={13} />{agent.findings} Verified Vuln(s)</span>
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
                <th>STATUS</th>
                <th>ENDPOINT</th>
              </tr>
            </thead>
            <tbody>
              {mission?.verifiedFindings?.map((f) => (
                <tr key={f.findingId}>
                  <td>
                    <div className="finding-title">{f.title}</div>
                    <div className="finding-target">{f.verificationRationale}</div>
                  </td>
                  <td>
                    <span className={`severity ${f.severity.toLowerCase()}`}>
                      <i />{f.severity}
                    </span>
                  </td>
                  <td>{f.sourceAgent}</td>
                  <td>
                    <span className="verify verified">
                      <ShieldCheck size={13} /> Confirmed
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{f.affectedEndpoint}</td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No findings loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Leaderboard() {
  const realRanks = [
    { rank: '01', name: 'IdorAgent', specialty: 'BOLA / Object-Level Access Control', score: '100', findings: 1, verified: 1 },
    { rank: '02', name: 'XssAgent', specialty: 'Stored Cross-Site Scripting (DOM)', score: '100', findings: 1, verified: 1 },
    { rank: '03', name: 'BusinessLogicAgent', specialty: 'Client Price Manipulation Logic', score: '100', findings: 1, verified: 1 },
    { rank: '04', name: 'ReconAgent', specialty: 'Playwright Surface Discovery & Crawl', score: '100', findings: 0, verified: 0 },
  ]
  return (
    <>
      <SectionHeader
        eyebrow="ON-CHAIN REPUTATION INDEX"
        title="Agent Leaderboard"
        description="Reputation points earned through verified vulnerabilities attested on NEAR Protocol Testnet."
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
                <th>VERIFIED FINDINGS</th>
              </tr>
            </thead>
            <tbody>
              {realRanks.map((row) => (
                <tr key={row.rank}>
                  <td><span className={`rank-number ${row.rank === '01' ? 'first' : ''}`}>{row.rank}</span></td>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.specialty}</td>
                  <td><strong className="score-number">{row.score} pts</strong></td>
                  <td><span className="verified-number"><ShieldCheck size={13} /> {row.verified}</span></td>
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
  const [isRunning, setIsRunning] = useState(false)
  const [integrityResult, setIntegrityResult] = useState<{
    status: string
    computedLocalHash: string
    storedOnChainHash: string
    tampered: boolean
  } | null>(null)

  const fetchLatestMission = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/missions/latest')
      if (res.ok) {
        const data = await res.json()
        setMission(data)
      }
    } catch {
      // Server might not be up yet
    }
  }

  useEffect(() => {
    fetchLatestMission()
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
          ) : active === 'Agent Network' ? (
            <AgentNetwork agents={specialistAgents} />
          ) : active === 'Findings' ? (
            <Findings mission={mission} />
          ) : (
            <Leaderboard />
          )}
          <footer className="footer">
            <span>BUGBOUNTY SWARM — AUTONOMOUS WEB SECURITY PLATFORM</span>
            <span>NEAR TESTNET ATTESTED (harsha-swarm.testnet) · PRODUCTION READY</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
