import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, Award, Bell, Bug, ChevronDown, CircleHelp,
  Clock3, Crosshair, ExternalLink, Fingerprint, GitBranch, Globe2, Layers3,
  LockKeyhole, Menu, MoreHorizontal, Network, Play, Search, ShieldAlert,
  ShieldCheck, Signal, SlidersHorizontal, Sparkles, Target, Terminal,
  TriangleAlert, Trophy, Users, X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'
import './App.css'

type View = 'Mission Control' | 'Agent Network' | 'Findings' | 'Leaderboard'

const navItems: { label: View; icon: typeof Activity; count?: string }[] = [
  { label: 'Mission Control', icon: Crosshair },
  { label: 'Agent Network', icon: Network, count: '08' },
  { label: 'Findings', icon: ShieldAlert, count: '04' },
  { label: 'Leaderboard', icon: Trophy },
]

const agents = [
  { name: 'NIGHTJAR', initials: 'NJ', specialty: 'Authentication', action: 'Mapping OAuth callback flows', status: 'Analyzing', color: 'lime', score: '98.4' },
  { name: 'SABLE', initials: 'SB', specialty: 'Business Logic', action: 'Testing discount boundary cases', status: 'Analyzing', color: 'cyan', score: '96.1' },
  { name: 'MANTIS', initials: 'MT', specialty: 'API Security', action: 'Enumerating GraphQL schema', status: 'Verifying', color: 'violet', score: '94.8' },
  { name: 'CICADA', initials: 'CD', specialty: 'Client-side', action: 'Reviewing bundled source maps', status: 'Queued', color: 'amber', score: '91.2' },
]

const findings = [
  { id: 'BB-2048', name: 'Broken object-level authorization', target: 'api.acme.dev /v2/invoices/{id}', severity: 'Critical', cvss: '9.1', agent: 'NIGHTJAR', time: '4m ago', verified: true },
  { id: 'BB-2047', name: 'Stored cross-site scripting', target: 'app.acme.dev /workspace/notes', severity: 'High', cvss: '8.2', agent: 'MANTIS', time: '18m ago', verified: true },
  { id: 'BB-2046', name: 'OAuth state parameter not validated', target: 'auth.acme.dev /callback', severity: 'High', cvss: '7.7', agent: 'NIGHTJAR', time: '32m ago', verified: true },
  { id: 'BB-2045', name: 'Rate limit bypass via header rotation', target: 'api.acme.dev /v1/search', severity: 'Medium', cvss: '6.4', agent: 'SABLE', time: '1h ago', verified: false },
]

const chartData = [
  { time: '09:00', findings: 1 }, { time: '10:00', findings: 2 }, { time: '11:00', findings: 2 },
  { time: '12:00', findings: 4 }, { time: '13:00', findings: 3 }, { time: '14:00', findings: 6 },
  { time: '15:00', findings: 5 }, { time: '16:00', findings: 8 }, { time: '17:00', findings: 7 },
]

function Mark() {
  return <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 38 38" fill="none"><path d="M19 4 24 12l9 2-6 7 1 10-9-4-9 4 1-10-6-7 9-2 5-8Z"/><path d="M19 12v14M12 16l7 3 7-3M12 23l7-2 7 2"/><circle cx="19" cy="19" r="2" fill="currentColor" stroke="none"/></svg></div>
}

function Sidebar({ active, onChange }: { active: View; onChange: (view: View) => void }) {
  return <aside className="sidebar">
    <div className="brand"><Mark/><div><span className="brand-name">BUGBOUNTY</span><span className="brand-sub">SWARM <i>RESEARCH PLATFORM</i></span></div></div>
    <div className="workspace-switch"><div className="workspace-avatar">A</div><div className="workspace-copy"><span>Workspace</span><strong>Acme Security</strong></div><ChevronDown size={14}/></div>
    <div className="nav-label">PLATFORM</div>
    <nav aria-label="Main navigation">{navItems.map(({ label, icon: Icon, count }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onChange(label)}><Icon size={17}/><span>{label}</span>{count && <small>{count}</small>}</button>)}</nav>
    <div className="nav-label tools-label">OPERATIONS</div>
    <button className="nav-item"><Globe2 size={17}/><span>Programs</span></button>
    <button className="nav-item"><Terminal size={17}/><span>Audit log</span></button>
    <div className="sidebar-bottom"><div className="usage-card"><div className="usage-head"><span>MONTHLY CREDITS</span><span>72%</span></div><div className="usage-track"><i/></div><p>7,240 <span>/ 10,000 credits</span></p><a href="#usage">Manage plan <ArrowUpRight size={12}/></a></div><button className="profile"><div className="profile-avatar">HK</div><div><strong>Harsh Jain</strong><span>Security researcher</span></div><MoreHorizontal size={17}/></button></div>
  </aside>
}

function Topbar({ active }: { active: View }) {
  return <header className="topbar"><div className="crumb"><span>Acme Security</span><span className="crumb-slash">/</span><strong>{active}</strong></div><div className="top-actions"><div className="system-pill demo-status">SAMPLE DATA · AGENTS OFFLINE</div><button className="icon-button" aria-label="Search"><Search size={17}/><kbd>⌘ K</kbd></button><button className="icon-button notification" aria-label="Notifications"><Bell size={17}/><i/></button><div className="top-avatar">HK</div></div></header>
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="section-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Metric({ label, value, change, icon: Icon, tone = 'lime' }: { label: string; value: string; change: string; icon: typeof ShieldCheck; tone?: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={16}/></span></div><div className="metric-value">{value}<span className="metric-change"><ArrowUpRight size={13}/>{change}</span></div><div className="metric-foot">vs. previous 7 days</div></div>
}

function FindingsTable({ compact = false }: { compact?: boolean }) {
  const rows = compact ? findings.slice(0, 3) : findings
  return <div className="table-wrap"><table><thead><tr><th>VULNERABILITY</th><th>SEVERITY</th><th>RESEARCHER</th><th>STATUS</th><th>REPORTED</th><th/></tr></thead><tbody>{rows.map((finding) => <tr key={finding.id}><td><div className="finding-title">{finding.name}</div><div className="finding-target"><span>{finding.id}</span><span>·</span>{finding.target}</div></td><td><span className={`severity ${finding.severity.toLowerCase()}`}><i/>{finding.severity}<small>{finding.cvss}</small></span></td><td><span className="researcher"><span className="mini-agent">{finding.agent.slice(0, 1)}</span>{finding.agent}</span></td><td><span className={`verify ${finding.verified ? 'verified' : 'review'}`}>{finding.verified ? <><ShieldCheck size={13}/> Verified</> : <><Clock3 size={13}/> In review</>}</span></td><td className="time-cell">{finding.time}</td><td><button className="row-more" aria-label={`More actions for ${finding.id}`}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div>
}

function ActivityFeed() {
  const entries = [
    { icon: ShieldCheck, tone: 'lime', title: 'Finding verified', detail: 'BOLA on /v2/invoices/{id}', actor: 'MANTIS · 2 min ago' },
    { icon: Crosshair, tone: 'cyan', title: 'New attack surface mapped', detail: '3 endpoints added to scope', actor: 'NIGHTJAR · 8 min ago' },
    { icon: TriangleAlert, tone: 'amber', title: 'Finding submitted for review', detail: 'Rate limit bypass · Medium', actor: 'SABLE · 14 min ago' },
    { icon: GitBranch, tone: 'violet', title: 'Test branch completed', detail: 'GraphQL introspection sweep', actor: 'CICADA · 21 min ago' },
  ]
  return <div className="activity-list">{entries.map(({ icon: Icon, tone, title, detail, actor }, i) => <div className="activity-row" key={title}><div className={`activity-icon ${tone}`}><Icon size={14}/></div><div className="activity-copy"><strong>{title}</strong><span>{detail}</span><small>{actor}</small></div>{i === 0 && <span className="activity-new"/>}</div>)}</div>
}

function AgentCards({ full = false }: { full?: boolean }) {
  const list = full ? [...agents, { name: 'ORCHID', initials: 'OR', specialty: 'Cloud Security', action: 'Reviewing exposed bucket policies', status: 'Queued', color: 'rose', score: '89.7' }, { name: 'WASP', initials: 'WP', specialty: 'Fuzzing', action: 'Mutating JSON request payloads', status: 'Analyzing', color: 'blue', score: '88.9' }] : agents.slice(0, 3)
  return <div className={`agent-grid ${full ? 'full-grid' : ''}`}>{list.map((agent) => <article className="agent-card" key={agent.name}><div className="agent-card-head"><div className={`agent-avatar ${agent.color}`}>{agent.initials}</div><div className="agent-identity"><strong>{agent.name}</strong><span>{agent.specialty}</span></div><button className="row-more" aria-label={`More about ${agent.name}`}><MoreHorizontal size={17}/></button></div><div className="agent-action"><span>CURRENT FOCUS</span><p>{agent.action}</p></div><div className="agent-card-foot"><span className={`agent-status ${agent.status.toLowerCase()}`}><i/>{agent.status}</span><span className="reputation"><Award size={13}/>{agent.score}</span></div></article>)}</div>
}

function MissionControl({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [launchMessage, setLaunchMessage] = useState(false)
  return <><SectionHeader eyebrow="FRIDAY, NOVEMBER 13, 2026  /  MISSION 04" title="Mission control" description="Your security research, coordinated." action={<button className="primary-button" onClick={() => setLaunchMessage(true)}><Play size={15} fill="currentColor"/> Start a mission</button>}/>{launchMessage && <div className="demo-notice"><CircleHelp size={15}/> This research preview uses sample data. Mission launch is not connected to live agents.<button onClick={() => setLaunchMessage(false)} aria-label="Dismiss notice"><X size={14}/></button></div>}
    <section className="mission-banner"><div className="mission-banner-grid"/><div className="mission-info"><div className="mission-kicker"><span className="live-indicator sample-mission">SAMPLE MISSION</span><span className="mission-id">MSN-2024-004</span></div><h2>Acme Platform — Full surface assessment</h2><div className="mission-meta"><span><Globe2 size={14}/> acme.dev</span><span><Clock3 size={14}/> Started 2h 14m ago</span><span><Users size={14}/> 8 specialist profiles</span></div><div className="mission-progress"><div className="progress-label"><span>MISSION PROGRESS</span><strong>68%</strong></div><div className="progress-track"><i style={{ width: '68%' }}/></div><div className="progress-phases"><span className="done">Reconnaissance</span><span className="done">Surface mapping</span><span className="current">Active testing</span><span>Final review</span></div></div></div><div className="mission-side"><div className="side-stat"><span>VERIFIED FINDINGS</span><strong>03</strong><small><span/> 2 high · 1 critical</small></div><div className="side-rule"/><div className="side-stat"><span>ASSETS IN SCOPE</span><strong>24</strong><small>Across 3 subdomains</small></div><div className="mission-scan"><div className="scan-ring"><span><Signal size={16}/></span></div><div><span>SWARM COHERENCE</span><strong>94.8 <small>/ 100</small></strong></div></div></div></section>
    <div className="metrics-grid"><Metric label="VERIFIED FINDINGS" value="03" change="+2" icon={ShieldCheck}/><Metric label="ACTIVE AGENTS" value="06" change="+2" icon={Users} tone="cyan"/><Metric label="ATTACK SURFACE" value="24" change="+8" icon={Target} tone="violet"/><Metric label="PROGRAM REPUTATION" value="4.92" change="+0.14" icon={Award} tone="amber"/></div>
    <div className="dashboard-grid"><section className="panel findings-panel"><div className="panel-heading"><div><h3>Verified findings</h3><p>Validated vulnerabilities across your programs</p></div><button className="text-link" onClick={() => onNavigate('Findings')}>View all <ArrowUpRight size={14}/></button></div><FindingsTable compact/></section><section className="panel activity-panel"><div className="panel-heading"><div><h3>Activity preview</h3><p>Illustrative sample research events</p></div><span className="live-small sample-badge">SAMPLE</span></div><ActivityFeed/></section></div>
    <section className="panel agents-panel"><div className="panel-heading"><div><h3>Agent network</h3><p>Specialists assigned to this mission</p></div><button className="text-link" onClick={() => onNavigate('Agent Network')}>View network <ArrowUpRight size={14}/></button></div><AgentCards/></section>
  </>
}

function AgentNetwork() {
  return <><SectionHeader eyebrow="RESEARCH WORKFORCE" title="Agent network" description="Specialist agents, each with a distinct security discipline." action={<button className="secondary-button"><SlidersHorizontal size={15}/> Filter agents</button>}/><div className="metrics-grid network-stats"><Metric label="TOTAL SPECIALISTS" value="08" change="+2" icon={Network}/><Metric label="CURRENTLY ASSIGNED" value="06" change="+1" icon={Users} tone="cyan"/><Metric label="AVG. REPUTATION" value="93.2" change="+1.8" icon={Award} tone="violet"/><Metric label="SPECIALTIES COVERED" value="08" change="+2" icon={Layers3} tone="amber"/></div><div className="panel network-panel"><div className="panel-heading"><div><h3>Specialists</h3><p>Agent status and current mission focus</p></div><div className="panel-tools"><span className="live-small sample-badge">SAMPLE STATUSES</span><button className="row-more" aria-label="More filters"><MoreHorizontal size={17}/></button></div></div><AgentCards full/></div><div className="network-note"><Sparkles size={16}/><span><strong>Adaptive swarm orchestration</strong> assigns agents based on target surface and historical success across verified vulnerability classes.</span></div></>
}

function Findings() {
  const [filter, setFilter] = useState('All findings')
  return <><SectionHeader eyebrow="VULNERABILITY INTELLIGENCE" title="Findings" description="Reproducible, evidence-backed vulnerabilities." action={<button className="secondary-button"><SlidersHorizontal size={15}/> Export report</button>}/><div className="metrics-grid findings-stats"><Metric label="TOTAL SUBMISSIONS" value="12" change="+4" icon={Bug}/><Metric label="VERIFIED" value="09" change="+3" icon={ShieldCheck} tone="cyan"/><Metric label="CRITICAL / HIGH" value="05" change="+2" icon={ShieldAlert} tone="amber"/><Metric label="AVG. TIME TO VERIFY" value="18m" change="−6m" icon={Clock3} tone="violet"/></div><div className="panel findings-page-panel"><div className="panel-heading findings-filter-heading"><div><h3>All submissions <span className="count-chip">12</span></h3><p>Evidence reviewed against program scope and policy</p></div><div className="filter-tabs">{['All findings', 'Verified', 'In review'].map((name) => <button key={name} className={filter === name ? 'selected' : ''} onClick={() => setFilter(name)}>{name}</button>)}</div></div><FindingsTable/></div><div className="evidence-note"><LockKeyhole size={15}/><span>Reproduction evidence is encrypted at rest and visible only to authorized program members.</span></div></>
}

function Leaderboard() {
  const ranks = [
    { rank: '01', name: 'NIGHTJAR', specialty: 'Authentication · API Security', score: '9,840', delta: '+124', findings: 38, verified: 36, change: 'up' },
    { rank: '02', name: 'MANTIS', specialty: 'Web Application · GraphQL', score: '9,215', delta: '+98', findings: 31, verified: 29, change: 'up' },
    { rank: '03', name: 'SABLE', specialty: 'Business Logic · Access Control', score: '8,970', delta: '+76', findings: 28, verified: 26, change: 'up' },
    { rank: '04', name: 'CICADA', specialty: 'Client-side · JavaScript', score: '8,410', delta: '+42', findings: 24, verified: 22, change: 'up' },
    { rank: '05', name: 'ORCHID', specialty: 'Cloud · Infrastructure', score: '7,892', delta: '+31', findings: 21, verified: 19, change: 'up' },
    { rank: '06', name: 'WASP', specialty: 'Fuzzing · Input validation', score: '7,640', delta: '−12', findings: 18, verified: 16, change: 'down' },
  ]
  return <><SectionHeader eyebrow="REPUTATION & CONTRIBUTION" title="Agent leaderboard" description="Reputation earned through verified, reproducible research." action={<button className="period-button">Last 30 days <ChevronDown size={14}/></button>}/><div className="leader-hero"><div className="leader-accent"/><div className="leader-summary"><span>SWARM REPUTATION INDEX</span><strong>9,284 <small>pts</small></strong><div className="leader-delta"><ArrowUpRight size={14}/> +8.6% <span>compared to last period</span></div></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B6FF5C" stopOpacity={0.19}/><stop offset="100%" stopColor="#B6FF5C" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#202923" vertical={false}/><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#69746c', fontSize: 10 }} dy={8}/><Tooltip contentStyle={{ background: '#101613', border: '1px solid #29332b', borderRadius: 8, color: '#eef2ec', fontSize: 12 }} labelStyle={{ color: '#98a397' }} cursor={{ stroke: '#4b584a', strokeDasharray: '3 3' }}/><Area type="monotone" dataKey="findings" stroke="#B6FF5C" strokeWidth={2} fill="url(#chartFill)" dot={false} activeDot={{ r: 4, fill: '#B6FF5C', stroke: '#101613', strokeWidth: 2 }}/></AreaChart></ResponsiveContainer></div><div className="chart-legend"><i/> Verified contributions <span>LAST 9 HOURS</span></div></div><div className="panel leaderboard-panel"><div className="panel-heading"><div><h3>Researcher rankings</h3><p>Weighted by severity, reproducibility, and program impact</p></div><span className="rank-basis"><Award size={14}/> Reputation score</span></div><div className="table-wrap"><table className="leader-table"><thead><tr><th>RANK</th><th>AGENT</th><th>REPUTATION</th><th>VERIFIED</th><th>SUBMISSIONS</th><th>TREND</th></tr></thead><tbody>{ranks.map((row) => <tr key={row.rank}><td><span className={`rank-number ${row.rank === '01' ? 'first' : ''}`}>{row.rank}</span></td><td><div className="leader-agent"><span className={`mini-agent leader-avatar ${row.rank === '01' ? 'gold' : ''}`}>{row.name.slice(0, 1)}</span><span><strong>{row.name}</strong><small>{row.specialty}</small></span></div></td><td><strong className="score-number">{row.score}</strong><span className={`score-delta ${row.change}`}>{row.change === 'up' ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>} {row.delta}</span></td><td><span className="verified-number"><ShieldCheck size={13}/>{row.verified}</span></td><td className="submission-number">{row.findings}</td><td><span className="trend-spark">▂▃▂▅▄▆▅▇</span></td></tr>)}</tbody></table></div></div><div className="leaderboard-foot"><span><Fingerprint size={14}/> Reputation reflects independently verified contributions.</span><button className="text-link">Scoring methodology <ExternalLink size={13}/></button></div></>
}

function App() {
  const [active, setActive] = useState<View>('Mission Control')
  const [mobileNav, setMobileNav] = useState(false)
  return <div className="app-shell"><Sidebar active={active} onChange={(view) => { setActive(view); setMobileNav(false) }}/><main className="main-shell"><Topbar active={active}/><div className="mobile-head"><button className="icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">{mobileNav ? <X size={18}/> : <Menu size={18}/>}</button><div className="brand-mark"><Mark/></div><span>BUGBOUNTY <b>SWARM</b></span><div className="mobile-head-spacer"/></div>{mobileNav && <div className="mobile-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); setMobileNav(false) }}><Icon size={16}/>{label}</button>)}</div>}<div className="page-content">{active === 'Mission Control' ? <MissionControl onNavigate={setActive}/> : active === 'Agent Network' ? <AgentNetwork/> : active === 'Findings' ? <Findings/> : <Leaderboard/>}<footer className="footer"><span>BUGBOUNTY SWARM <i>RESEARCH PREVIEW · SAMPLE DATA</i></span><span><span className="pulse-dot"/> STATIC DEMO · NO AGENTS RUNNING <span className="footer-divider">·</span> v0.9.4</span></footer></div></main></div>
}

export default App
