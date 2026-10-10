import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, Check,
  ChevronDown, CircleHelp, Clock3, CreditCard, Fingerprint, Home, LayoutDashboard,
  LogOut, Menu, Moon, Palette, QrCode, ScanLine, Search, Settings, ShieldCheck,
  Sparkles, Sun, UserRound, Users, X, Camera, Upload, Monitor, LockKeyhole
} from 'lucide-react'

const DEMO_ID = '0103012156'
const DEMO_PROFILE = {
  name: 'Aziz Pratama',
  className: 'X-1',
  school: 'Student ID Hub Demo',
  email: 'aziz@example.com',
  avatar: '',
  accent: '#5ce1e6',
  theme: 'dark',
  background: 'aurora',
}
const storage = {
  get(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} },
}

function Brand({ small = false }) {
  return <div className="brand"><div className="brand-mark"><Fingerprint size={small ? 19 : 22} /></div>{!small && <div><strong>student<span>hub</span></strong><small>YOUR DIGITAL IDENTITY</small></div>}</div>
}
function Avatar({ profile, size = 'md' }) {
  return <div className={`avatar avatar-${size}`}>{profile.avatar ? <img src={profile.avatar} alt="Foto profil" /> : <span>{(profile.name || 'S').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}</span>}</div>
}
function App() {
  const [profile, setProfile] = useState(() => storage.get('sidh-profile', DEMO_PROFILE))
  const [registeredIds, setRegisteredIds] = useState(() => storage.get('sidh-ids', { [DEMO_ID]: true }))
  const [activeId, setActiveId] = useState(() => storage.get('sidh-active-id', DEMO_ID))
  const [isLoggedIn, setIsLoggedIn] = useState(() => storage.get('sidh-logged-in', true))
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => storage.set('sidh-profile', profile), [profile])
  useEffect(() => storage.set('sidh-ids', registeredIds), [registeredIds])
  useEffect(() => storage.set('sidh-active-id', activeId), [activeId])
  useEffect(() => storage.set('sidh-logged-in', isLoggedIn), [isLoggedIn])
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', profile.accent || '#5ce1e6')
    document.documentElement.dataset.theme = profile.theme || 'dark'
    document.documentElement.dataset.background = profile.background || 'aurora'
  }, [profile.accent, profile.theme, profile.background])

  const logout = () => { setIsLoggedIn(false); navigate('/'); }
  const login = (id) => { setActiveId(id); setIsLoggedIn(true); navigate('/dashboard'); }
  const register = (data) => {
    setProfile(p => ({ ...p, name: data.name, className: data.className }))
    setRegisteredIds(prev => ({ ...prev, [data.id]: true }))
    login(data.id)
  }

  return <div className="app-shell">
    {isLoggedIn && <Sidebar mobileOpen={mobileNav} closeMobile={() => setMobileNav(false)} profile={profile} onLogout={logout} />}
    <main className={isLoggedIn ? 'main-area' : 'main-area main-full'}>
      {isLoggedIn && <Topbar profile={profile} onMenu={() => setMobileNav(v => !v)} onAppearance={() => { setAppearanceOpen(true); navigate('/settings') }} />}
      <Routes>
        <Route path="/" element={<Welcome registeredIds={registeredIds} onLogin={login} onRegister={(id) => navigate('/register', { state: { id } })} />} />
        <Route path="/register" element={<Register onRegister={register} onBack={() => navigate('/')} />} />
        <Route path="/dashboard" element={isLoggedIn ? <Dashboard profile={profile} activeId={activeId} onCustomize={() => navigate('/settings')} /> : <Welcome registeredIds={registeredIds} onLogin={login} onRegister={(id) => navigate('/register', { state: { id } })} />} />
        <Route path="/card" element={isLoggedIn ? <MyCard profile={profile} activeId={activeId} /> : <Welcome registeredIds={registeredIds} onLogin={login} onRegister={(id) => navigate('/register', { state: { id } })} />} />
        <Route path="/profile" element={isLoggedIn ? <ProfilePage profile={profile} setProfile={setProfile} /> : <Welcome registeredIds={registeredIds} onLogin={login} onRegister={(id) => navigate('/register', { state: { id } })} />} />
        <Route path="/settings" element={isLoggedIn ? <SettingsPage profile={profile} setProfile={setProfile} /> : <Welcome registeredIds={registeredIds} onLogin={login} onRegister={(id) => navigate('/register', { state: { id } })} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  </div>
}

function Sidebar({ mobileOpen, closeMobile, profile, onLogout }) {
  const nav = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/card', label: 'My Student Card', icon: CreditCard },
    { to: '/profile', label: 'My Profile', icon: UserRound },
  ]
  return <>
    {mobileOpen && <button className="mobile-scrim" onClick={closeMobile} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand /></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="nav-list">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={closeMobile} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Icon size={18} /><span>{label}</span>{to === '/card' && <span className="nav-dot" />}</NavLink>)}</nav>
      <div className="nav-caption nav-caption-spaced">PREFERENCES</div>
      <nav className="nav-list">
        <NavLink to="/settings" onClick={closeMobile} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Palette size={18} /><span>Appearance</span></NavLink>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={16} /></div><strong>Make it yours</strong><p>Personalize your digital identity.</p><NavLink to="/settings" onClick={closeMobile}>Customize <ArrowRight size={13} /></NavLink></div>
      <div className="sidebar-user"><Avatar profile={profile} /><div className="sidebar-user-text"><strong>{profile.name}</strong><span>Class {profile.className}</span></div><button className="icon-btn logout-btn" title="Log out" onClick={onLogout}><LogOut size={16} /></button></div>
    </aside>
  </>
}
function Topbar({ profile, onMenu, onAppearance }) {
  const location = useLocation()
  const labels = { '/dashboard': 'Overview', '/card': 'My Student Card', '/profile': 'My Profile', '/settings': 'Appearance & Settings' }
  return <header className="topbar"><div className="topbar-left"><button className="icon-btn menu-btn" onClick={onMenu}><Menu size={20} /></button><span className="breadcrumb-muted">Workspace</span><span className="crumb-slash">/</span><strong>{labels[location.pathname] || 'Workspace'}</strong></div><div className="topbar-right"><div className="status-pill"><span className="status-pulse" /> Demo environment</div><button className="icon-btn" onClick={onAppearance} title="Appearance settings"><Palette size={18} /></button><button className="topbar-profile" onClick={() => window.location.assign('#/profile')}><Avatar profile={profile} size="sm" /><ChevronDown size={14} /></button></div></header>
}
function Welcome({ registeredIds, onLogin, onRegister }) {
  const [manualId, setManualId] = useState('')
  const [error, setError] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const scannerRef = useRef(null)
  const scannerInstance = useRef(null)

  const handleId = (raw) => {
    const id = String(raw || '').trim()
    if (!id) { setError('Masukkan ID yang terbaca dari barcode.'); return }
    setError('')
    if (registeredIds[id]) onLogin(id)
    else { setManualId(id); onRegister(id) }
  }
  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!scannerOpen || !scannerRef.current) return
      try {
        const scanner = new Html5Qrcode('barcode-reader')
        scannerInstance.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 140 }, aspectRatio: 1.5 }, decoded => {
          scanner.stop().catch(() => {})
          scannerInstance.current = null
          setScannerOpen(false)
          handleId(decoded)
        }, () => {})
      } catch {
        if (!cancelled) setScanMessage('Kamera tidak tersedia. Izinkan akses kamera atau gunakan input ID manual di bawah.')
      }
    }
    start()
    return () => {
      cancelled = true
      if (scannerInstance.current?.isScanning) scannerInstance.current.stop().catch(() => {})
      scannerInstance.current = null
    }
  }, [scannerOpen])
  return <div className="welcome-page">
    <div className="welcome-glow glow-one" /><div className="welcome-glow glow-two" />
    <div className="welcome-top"><Brand /><div className="welcome-badge"><span className="status-pulse" /> DIGITAL IDENTITY PLATFORM</div></div>
    <div className="welcome-content">
      <div className="eyebrow"><span className="eyebrow-line" /> YOUR IDENTITY, REIMAGINED</div>
      <h1>One ID.<br /><span>Your own space.</span></h1>
      <p className="welcome-subtitle">Your student identity, reimagined. Scan your student card to access your personal digital space.</p>
      <div className="welcome-actions"><button className="btn btn-primary btn-large" onClick={() => { setScannerOpen(true); setScanMessage('') }}><ScanLine size={19} /> Scan Student Card <ArrowRight size={17} /></button><button className="btn btn-secondary btn-large" onClick={() => { setManualId(''); setError(''); document.getElementById('manual-id')?.focus() }}>Enter ID manually</button></div>
      {scannerOpen && <div className="scanner-panel"><div className="scanner-panel-head"><div><strong>Scan your student card</strong><p>Place the barcode inside the frame.</p></div><button className="icon-btn" onClick={() => setScannerOpen(false)}><X size={17} /></button></div><div id="barcode-reader" ref={scannerRef} className="barcode-reader" />{scanMessage && <p className="inline-notice">{scanMessage}</p>}</div>}
      <form className="manual-id-form" onSubmit={e => { e.preventDefault(); handleId(manualId) }}><label htmlFor="manual-id">STUDENT ID</label><div className="manual-input-wrap"><Fingerprint size={17} /><input id="manual-id" value={manualId} onChange={e => setManualId(e.target.value)} placeholder="Enter the ID below your barcode" /><button type="submit" aria-label="Continue"><ArrowRight size={17} /></button></div>{error && <p className="form-error">{error}</p>}<p className="input-hint">Demo ID: <button type="button" className="text-link" onClick={() => setManualId('0103012156')}>0103012156</button> · new IDs can register</p></form>
      <div className="welcome-footnotes"><span><ShieldCheck size={15} /> Personal student space</span><span><LockKeyhole size={15} /> Demo data stored on this device</span></div>
    </div>
    <div className="welcome-preview"><div className="preview-label">A GLIMPSE OF YOUR SPACE</div><div className="preview-card"><div className="preview-card-top"><Brand small /><span className="preview-chip">STUDENT ID</span></div><div className="preview-user"><Avatar profile={DEMO_PROFILE} size="xl" /><div><span className="preview-overline">WELCOME BACK</span><h3>Aziz Pratama</h3><p>Class X-1 · Student</p></div></div><div className="preview-card-bottom"><div><span>STUDENT ID</span><strong>0103 •••• 2156</strong></div><div className="preview-qr"><QrCode size={36} /></div></div><div className="preview-shine" /></div><div className="preview-caption"><span className="preview-caption-dot" /> A personal space, made for you</div></div>
    <div className="welcome-footer"><span>© 2026 Student ID Hub</span><span>Built for your class <span className="footer-heart">✳</span></span></div>
  </div>
}
function Dashboard({ profile, activeId, onCustomize }) {
  const [showAll, setShowAll] = useState(false)
  const actions = [
    { icon: CreditCard, title: 'My Student Card', desc: 'View your digital identity', color: 'cyan', to: '/card' },
    { icon: UserRound, title: 'Profile settings', desc: 'Keep your details up to date', color: 'purple', to: '/profile' },
    { icon: Palette, title: 'Personalize space', desc: 'Themes, colors & appearance', color: 'blue', to: '/settings' },
  ]
  return <div className="page-content dashboard-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL SPACE</div><h1>Good to see you, <span>{profile.name.split(' ')[0]}.</span></h1><p>Here's your student hub at a glance.</p></div><button className="btn btn-secondary" onClick={onCustomize}><Palette size={16} /> Customize dashboard</button></div>
    <div className="welcome-banner"><div className="banner-orb orb-a" /><div className="banner-orb orb-b" /><div className="banner-content"><div className="banner-label"><Sparkles size={14} /> YOUR DIGITAL IDENTITY</div><h2>Your space. <span>Your style.</span></h2><p>Make your dashboard feel like you. Choose a theme, set your accent color, and keep your profile up to date.</p><button className="btn btn-banner" onClick={onCustomize}>Explore appearance <ArrowRight size={15} /></button></div><div className="banner-graphic"><div className="graphic-ring ring-one" /><div className="graphic-ring ring-two" /><div className="graphic-core"><Fingerprint size={48} /></div><span className="graphic-spark spark-one">✦</span><span className="graphic-spark spark-two">✧</span></div></div>
    <div className="section-title-row"><div><h2>Quick access</h2><p>Everything you need, right here.</p></div><span className="section-counter">03 ITEMS</span></div>
    <div className="quick-grid">{actions.map(({ icon: Icon, title, desc, color, to }) => <NavLink to={to} key={to} className="quick-card"><div className={`quick-icon ${color}`}><Icon size={20} /></div><div className="quick-card-copy"><strong>{title}</strong><span>{desc}</span></div><ArrowUpRight size={17} className="quick-arrow" /></NavLink>)}</div>
    <div className="dashboard-bottom-grid">
      <div className="panel recent-panel"><div className="panel-heading"><div><h3>Identity overview</h3><p>Your registered student details</p></div><span className="live-badge"><span /> ACTIVE</span></div><div className="identity-row"><Avatar profile={profile} size="lg" /><div className="identity-copy"><strong>{profile.name}</strong><span>Class {profile.className}</span></div><span className="verified-pill"><Check size={12} /> Demo profile</span></div><div className="detail-list"><div><span>Student ID</span><strong className="mono">{activeId}</strong></div><div><span>Institution</span><strong>{profile.school}</strong></div><div><span>Account status</span><strong className="accent-text">Local demo</strong></div></div></div>
      <div className="panel tips-panel"><div className="tips-icon"><Sparkles size={18} /></div><h3>Make it yours</h3><p>Your dashboard is personal. Try a new accent color or switch between dark and light mode.</p><button className="btn btn-outline-full" onClick={onCustomize}>Personalize appearance <ArrowRight size={15} /></button><div className="tips-footer"><ShieldCheck size={14} /> Your preferences stay on this device.</div></div>
    </div>
    <div className="demo-warning"><CircleHelp size={15} /><span><strong>Prototype mode:</strong> data is stored locally in this browser. There is no shared database or secure account verification yet.</span></div>
  </div>
}
function MyCard({ profile, activeId }) {
  return <div className="page-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR DIGITAL IDENTITY</div><h1>My student <span>card.</span></h1><p>A digital version of your student identity.</p></div><span className="live-badge"><span /> PREVIEW</span></div><div className="card-page-layout"><div className="student-card-wrap"><div className="digital-card"><div className="digital-card-top"><Brand /><span className="digital-card-type">STUDENT IDENTITY</span></div><div className="digital-card-main"><Avatar profile={profile} size="xxl" /><div className="digital-card-name"><span>STUDENT</span><h2>{profile.name}</h2><p>Class {profile.className}</p></div></div><div className="digital-card-bottom"><div><span>STUDENT ID</span><strong className="mono">{activeId}</strong><small>{profile.school}</small></div><div className="card-code"><QrCode size={54} /></div></div><div className="digital-card-watermark"><Fingerprint size={180} /></div></div><p className="card-note"><ShieldCheck size={15} /> This is a digital profile card, not an official school-issued ID.</p></div><div className="panel card-info-panel"><div className="panel-heading"><div><h3>Card details</h3><p>Information linked to your profile</p></div><CreditCard size={19} className="muted-icon" /></div><div className="detail-list"><div><span>Full name</span><strong>{profile.name}</strong></div><div><span>Class</span><strong>{profile.className}</strong></div><div><span>Student ID</span><strong className="mono">{activeId}</strong></div><div><span>Card status</span><strong className="accent-text">Preview only</strong></div></div><div className="notice-box"><LockKeyhole size={17} /><p>Your original barcode identifies your physical card. This preview QR is decorative and does not replace the original barcode.</p></div></div></div></div>
}
function ProfilePage({ profile, setProfile }) {
  const [saved, setSaved] = useState(false)
  const fileRef = useRef(null)
  const update = (key, value) => { setProfile(p => ({ ...p, [key]: value })); setSaved(false) }
  const handleAvatar = e => { const file = e.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) return; if (file.size > 2 * 1024 * 1024) { alert('Choose an image under 2 MB.'); return } const reader = new FileReader(); reader.onload = () => update('avatar', reader.result); reader.readAsDataURL(file) }
  return <div className="page-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR DETAILS</div><h1>My <span>profile.</span></h1><p>Manage how you appear in your personal student hub.</p></div></div><div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Profile information</h3><p>These details are used to personalize your space.</p></div><UserRound size={18} className="muted-icon" /></div><div className="avatar-editor"><Avatar profile={profile} size="xl" /><div><strong>Profile photo</strong><p>JPG, PNG or WebP · up to 2 MB</p><button className="btn btn-secondary btn-small" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload photo</button><input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatar} /></div></div><div className="form-grid"><label className="field"><span>Display name</span><input value={profile.name} onChange={e => update('name', e.target.value)} maxLength={70} /></label><label className="field"><span>Class</span><input value={profile.className} onChange={e => update('className', e.target.value)} maxLength={20} /></label><label className="field field-full"><span>School / institution label</span><input value={profile.school} onChange={e => update('school', e.target.value)} maxLength={100} /><small>This is a display label in this prototype, not a verified school record.</small></label></div><div className="form-footer"><span className="save-feedback">{saved ? <><Check size={14} /> Saved on this device</> : 'Changes are saved locally as you edit.'}</span><button className="btn btn-primary" onClick={() => { storage.set('sidh-profile', profile); setSaved(true) }}><Check size={16} /> Save profile</button></div></section><aside className="panel profile-preview-panel"><div className="panel-heading"><div><h3>Preview</h3><p>How others may see your card</p></div></div><div className="mini-profile-card"><div className="mini-card-glow" /><div className="mini-card-top"><Brand small /><span>STUDENT</span></div><Avatar profile={profile} size="xl" /><h3>{profile.name || 'Your name'}</h3><p>Class {profile.className || '—'}</p><div className="mini-profile-line" /><span className="mini-profile-id">DIGITAL PROFILE</span></div><p className="preview-caption-text">This preview is for the prototype only.</p></aside></div></div>
}
function SettingsPage({ profile, setProfile }) {
  const [saved, setSaved] = useState(false)
  const accents = [{ name: 'Cyan', value: '#5ce1e6' }, { name: 'Violet', value: '#a78bfa' }, { name: 'Blue', value: '#60a5fa' }, { name: 'Mint', value: '#6ee7b7' }, { name: 'Rose', value: '#fb7185' }, { name: 'Amber', value: '#fbbf24' }]
  const update = (key, value) => { setProfile(p => ({ ...p, [key]: value })); setSaved(false) }
  return <div className="page-content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> MAKE IT YOURS</div><h1>Appearance & <span>settings.</span></h1><p>A little customization goes a long way.</p></div><button className="btn btn-primary" onClick={() => { storage.set('sidh-profile', profile); setSaved(true) }}><Check size={16} /> Save preferences</button></div><div className="settings-layout"><div className="settings-main"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Interface theme</h3><p>Choose the atmosphere for your workspace.</p></div><Monitor size={18} className="muted-icon" /></div><div className="theme-options"><button className={`theme-option theme-dark-option ${profile.theme === 'dark' ? 'theme-selected' : ''}`} onClick={() => update('theme', 'dark')}><div className="theme-mock dark-mock"><div /><div /><div /></div><span><Moon size={15} /> Dark mode</span>{profile.theme === 'dark' && <Check size={15} className="theme-check" />}</button><button className={`theme-option theme-light-option ${profile.theme === 'light' ? 'theme-selected' : ''}`} onClick={() => update('theme', 'light')}><div className="theme-mock light-mock"><div /><div /><div /></div><span><Sun size={15} /> Light mode</span>{profile.theme === 'light' && <Check size={15} className="theme-check" />}</button></div></section><section className="panel settings-panel"><div className="panel-heading"><div><h3>Accent color</h3><p>Give your interface a color that feels like you.</p></div><Palette size={18} className="muted-icon" /></div><div className="accent-options">{accents.map(a => <button key={a.value} className={`accent-choice ${profile.accent === a.value ? 'accent-selected' : ''}`} onClick={() => update('accent', a.value)} title={a.name} aria-label={`${a.name} accent`}><span style={{ background: a.value }} />{profile.accent === a.value && <Check size={14} />}</button>)}</div><div className="selected-accent"><span className="selected-accent-dot" style={{ background: profile.accent }} /> Current accent <strong>{accents.find(a => a.value === profile.accent)?.name || 'Custom'}</strong></div></section><section className="panel settings-panel"><div className="panel-heading"><div><h3>Background atmosphere</h3><p>Choose a subtle backdrop for your workspace.</p></div><Sparkles size={18} className="muted-icon" /></div><div className="background-options"><button className={`background-choice bg-aurora ${profile.background === 'aurora' ? 'background-selected' : ''}`} onClick={() => update('background', 'aurora')}><span /><strong>Aurora</strong>{profile.background === 'aurora' && <Check size={14} />}</button><button className={`background-choice bg-midnight ${profile.background === 'midnight' ? 'background-selected' : ''}`} onClick={() => update('background', 'midnight')}><span /><strong>Midnight</strong>{profile.background === 'midnight' && <Check size={14} />}</button><button className={`background-choice bg-grid ${profile.background === 'grid' ? 'background-selected' : ''}`} onClick={() => update('background', 'grid')}><span /><strong>Grid</strong>{profile.background === 'grid' && <Check size={14} />}</button></div></section><div className="settings-bottom-note"><ShieldCheck size={16} /><span>Preferences are stored in this browser for this prototype. A future Supabase integration can sync settings across devices.</span></div>{saved && <div className="saved-toast"><Check size={15} /> Preferences saved</div>}</div><aside className="settings-preview-column"><div className="panel live-preview-panel"><div className="panel-heading"><div><h3>Live preview</h3><p>Changes update instantly</p></div><span className="live-badge"><span /> LIVE</span></div><div className="live-preview-frame"><div className="live-preview-nav"><Brand small /><span className="preview-nav-dot" /></div><div className="live-preview-body"><div className="preview-greeting">GOOD EVENING</div><div className="preview-headline">Your space.<br /><span>Your style.</span></div><div className="preview-preview-card"><Avatar profile={profile} /><div><strong>{profile.name}</strong><span>Class {profile.className}</span></div><QrCode size={26} /></div><div className="preview-bars"><span /><span /><span /></div></div></div><div className="preview-legend"><span><i style={{ background: profile.accent }} /> Accent color</span><span><i className="legend-bg" /> Background</span></div></div><div className="panel settings-help"><div className="help-icon"><CircleHelp size={18} /></div><h3>Your space, your rules.</h3><p>Try different combinations. You can change these settings whenever you like.</p></div></aside></div></div>
}
function Register({ onRegister, onBack }) {
  const location = useLocation()
  const [id, setId] = useState(location.state?.id || '')
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  return <div className="register-page"><div className="register-top"><button className="back-link" onClick={onBack}>← Back to scan</button><Brand /></div><div className="register-card"><div className="register-icon"><Fingerprint size={25} /></div><div className="eyebrow"><span className="eyebrow-line" /> FIRST-TIME SETUP</div><h1>Create your <span>student space.</span></h1><p className="register-intro">Set up your profile to get started. Your barcode ID links this profile to your physical student card.</p><form onSubmit={e => { e.preventDefault(); if (!id.trim() || !name.trim() || !className.trim()) { setError('Please fill in all fields.'); return } onRegister({ id: id.trim(), name: name.trim(), className: className.trim() }) }}><label className="field"><span>Student ID from barcode</span><input value={id} onChange={e => setId(e.target.value)} placeholder="e.g. 0103012156" required /></label><label className="field"><span>Full name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your full name" maxLength={70} required /></label><label className="field"><span>Class</span><input value={className} onChange={e => setClassName(e.target.value)} placeholder="e.g. X-1" maxLength={20} required /></label>{error && <p className="form-error">{error}</p>}<div className="register-note"><ShieldCheck size={16} /><span>Prototype note: this demo doesn't verify that the ID belongs to you. Use fictional data for testing.</span></div><button className="btn btn-primary btn-large register-submit" type="submit">Create my student space <ArrowRight size={17} /></button></form><p className="register-terms">By continuing, you create a local demo profile on this device.</p></div><div className="register-footer">STUDENT ID HUB · PROTOTYPE</div></div>
}
function NotFound() { return <div className="page-content"><div className="empty-state"><div className="register-icon"><Search size={24} /></div><h1>Page not found.</h1><p>The page you're looking for doesn't exist.</p><NavLink to="/dashboard" className="btn btn-primary">Back to dashboard <ArrowRight size={16} /></NavLink></div></div> }

export default App
