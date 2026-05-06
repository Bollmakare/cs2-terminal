import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth.js'
import { fmt } from '../lib/utils.js'
import { useToast } from './Toast.jsx'

const NAV_GROUPS = [
  {
    label: 'Portfolio',
    items: [
      { to: '/', label: 'Dashboard', dot: '#c9a84c' },
      { to: '/cs2', label: 'CS2 Skins', dot: '#ff6b35' },
      { to: '/pokemon', label: 'Pokémon TCG', dot: '#ffd60a' },
      { to: '/wine', label: 'Wine Cellar', dot: '#c44569' },
    ]
  },
  {
    label: 'History',
    items: [
      { to: '/cellar-log', label: 'Cellar Log', dot: '#7a1f3d' },
      { to: '/sold', label: 'Sold Items', dot: '#4caf50' },
    ]
  },
  {
    label: 'Planning',
    items: [
      { to: '/wishlist', label: 'Wishlist', dot: '#c9a84c' },
    ]
  },
]

export default function Sidebar({ user, netWorth, open, onClose }) {
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
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">VAULT</div>

      <nav className="sidebar-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.items.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="nav-dot" style={{ background: n.dot }} />
                {n.label}
              </NavLink>
            ))}
          </div>
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
