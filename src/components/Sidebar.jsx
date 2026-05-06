import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth.js'
import { fmt } from '../lib/utils.js'
import { useToast } from './Toast.jsx'

const NAVS = [
  { to: '/', label: 'Dashboard', dot: '#c9a84c' },
  { to: '/cs2', label: 'CS2 Skins', dot: '#ff6b35' },
  { to: '/pokemon', label: 'Pokémon TCG', dot: '#ffd60a' },
  { to: '/wine', label: 'Wine Cellar', dot: '#c44569' },
  { to: '/cellar-log', label: 'Cellar Log', dot: '#7a1f3d' },
  { to: '/sold', label: 'Sold Items', dot: '#4caf50' },
]

export default function Sidebar({ user, netWorth }) {
  const toast = useToast()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await signOut()
      navigate('/')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">VAULT</div>

      <nav className="sidebar-nav">
        {NAVS.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-dot" style={{ background: n.dot }} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-net-worth">
        <div className="net-worth-label">Net Worth</div>
        <div className="net-worth-value">{fmt(netWorth)}</div>
      </div>

      <div className="sidebar-user">
        <span className="user-email">{user?.email}</span>
        <button className="btn-logout" onClick={handleLogout}>Sign out</button>
      </div>
    </aside>
  )
}
