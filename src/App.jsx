import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Droplets, Users, Wrench, Package, CreditCard, Search, Plus, X, Menu,
  CircleCheck as CheckCircle, CircleAlert as AlertCircle, Mail, Phone, MapPin,
  Trash2, TrendingUp, DollarSign, Clock, ArrowUp, ArrowDown
} from 'lucide-react';
import { supabase } from './lib/supabase';
import ServiceTicketLog from './ServiceTicketLog';
import FinancialLedger from './FinancialLedger';
import ProductCatalog from './ProductCatalog';
import './App.css';

const TABS = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'tickets', label: 'Service Tickets', icon: Wrench },
  { id: 'products', label: 'Product Catalog', icon: Package },
  { id: 'sales', label: 'Financial Ledger', icon: CreditCard },
];

const TAB_META = {
  customers: { title: 'Customers', subtitle: 'Manage your customer relationships' },
  tickets: { title: 'Service Tickets', subtitle: 'Track and resolve service requests' },
  products: { title: 'Product Catalog', subtitle: 'Manage your RO models, parts & inventory' },
  sales: { title: 'Financial Ledger', subtitle: 'Track sales, EMI collections & outstanding balances' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('customers');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const safe = (r, fallback) => {
      if (r.error) { console.warn('Supabase query failed:', r.error.message); return fallback; }
      return r.data || fallback;
    };
    try {
      const [c, t, p, s] = await Promise.all([
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('service_tickets').select('*, customer:customers(name), product:products(name)').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('sales').select('*, customer:customers(name), product:products(name)').order('created_at', { ascending: false }),
      ]);
      setCustomers(safe(c, []));
      setTickets(safe(t, []));
      setProducts(safe(p, []));
      setSales(safe(s, []));
    } catch (err) {
      console.warn('fetchData failed, using empty fallbacks:', err.message);
      setCustomers([]);
      setTickets([]);
      setProducts([]);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Command palette keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCmdkOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAddCustomer = async (formData) => {
    try {
      const { error } = await supabase.from('customers').insert([formData]);
      if (error) throw error;
      showToast('Customer added successfully');
      fetchData();
    } catch (err) {
      console.warn('handleAddCustomer failed:', err.message);
      showToast('Could not save customer. Check your connection.', true);
    } finally {
      // Always close the modal so the user is never stuck on the form.
      setShowAddCustomer(false);
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!window.confirm('Delete this customer? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      showToast('Customer deleted');
      fetchData();
    } catch (err) {
      console.warn('handleDeleteCustomer failed:', err.message);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
  });

  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const activeEMI = sales.filter((s) => s.status === 'emi_active').length;

  const meta = TAB_META[activeTab];

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    setSearch('');
    setCmdkOpen(false);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Droplets />
          </div>
          <div>
            <div className="sidebar-title">AquaGuru</div>
            <div className="sidebar-subtitle">CRM System</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => switchTab(tab.id)}
              >
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">AquaGuru CRM v1.0</div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={22} />
            </button>
            <div>
              <div className="topbar-title">{meta.title}</div>
              <div className="topbar-subtitle">{meta.subtitle}</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-stat">
              <Users size={16} />
              {customers.length} Customers
            </div>
            <div className="topbar-stat">
              <Clock size={16} />
              {openTickets} Open Tickets
            </div>
            <div className="topbar-stat">
              <DollarSign size={16} />
              Rs {totalRevenue.toLocaleString('en-IN')}
            </div>
            <button
              className="topbar-stat"
              onClick={() => setCmdkOpen(true)}
              style={{ cursor: 'pointer', gap: '6px' }}
              title="Search (Cmd+K)"
            >
              <Search size={16} />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Search</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-surface-3)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}>⌘K</span>
            </button>
          </div>
        </header>

        <main className="content">
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue"><Users /></div>
              <div>
                <div className="stat-value">{customers.length}</div>
                <div className="stat-label">Total Customers</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber"><Wrench /></div>
              <div>
                <div className="stat-value">{openTickets}</div>
                <div className="stat-label">Open Tickets</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon cyan"><Package /></div>
              <div>
                <div className="stat-value">{products.length}</div>
                <div className="stat-label">Products</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><TrendingUp /></div>
              <div>
                <div className="stat-value">{activeEMI}</div>
                <div className="stat-label">Active EMIs</div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-box">
              <Search />
              <input
                className="search-input"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {activeTab === 'customers' && (
              <button className="btn btn-primary" onClick={() => setShowAddCustomer(true)}>
                <Plus />
                Add Customer
              </button>
            )}
          </div>

          {/* Content per tab */}
          {loading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : activeTab === 'customers' ? (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>City</th>
                      <th>Notes</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 ? (
                      <tr><td colSpan={5}>
                        <div className="table-empty">
                          <Users />
                          No customers yet. Click "Add Customer" to get started.
                        </div>
                      </td></tr>
                    ) : filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</td>
                        <td>
                          {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}><Mail size={13} style={{ color: 'var(--text-dim)' }} />{c.email}</div>}
                          {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} style={{ color: 'var(--text-dim)' }} />{c.phone}</div>}
                        </td>
                        <td>{c.city ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} style={{ color: 'var(--text-dim)' }} />{c.city}</span> : '—'}</td>
                        <td style={{ maxWidth: 200, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '—'}</td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteCustomer(c.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'tickets' ? (
            <ServiceTicketLog
              showToast={showToast}
              customers={customers}
              products={products}
              onRefresh={fetchData}
            />
          ) : activeTab === 'products' ? (
            <ProductCatalog
              showToast={showToast}
              products={products}
              onRefresh={fetchData}
            />
          ) : activeTab === 'sales' ? (
            <FinancialLedger
              showToast={showToast}
              customers={customers}
              products={products}
              onRefresh={fetchData}
            />
          ) : null}
        </main>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSubmit={handleAddCustomer}
        />
      )}

      {/* Command Palette */}
      {cmdkOpen && (
        <CommandPalette
          customers={customers}
          products={products}
          tickets={tickets}
          sales={sales}
          onClose={() => setCmdkOpen(false)}
          onNavigate={switchTab}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <AlertCircle /> : <CheckCircle />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function CommandPalette({ customers, products, tickets, sales, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = (() => {
    if (!query) {
      return [
        { type: 'nav', items: TABS.map((t) => ({ label: t.label, desc: 'Navigate to tab', icon: t.icon, action: () => onNavigate(t.id) })) },
      ];
    }
    const q = query.toLowerCase();
    const navItems = TABS.filter((t) => t.label.toLowerCase().includes(q))
      .map((t) => ({ label: t.label, desc: 'Navigate to tab', icon: t.icon, action: () => onNavigate(t.id) }));
    const customerItems = customers.filter((c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 5).map((c) => ({ label: c.name, desc: c.email || c.phone || 'Customer', icon: Users, action: () => onNavigate('customers') }));
    const productItems = products.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 5).map((p) => ({ label: p.name, desc: `Rs ${Number(p.price || 0).toLocaleString('en-IN')} · ${p.category || ''}`, icon: Package, action: () => onNavigate('products') }));
    const ticketItems = tickets.filter((t) => t.issue?.toLowerCase().includes(q) || t.customer?.name?.toLowerCase().includes(q))
      .slice(0, 5).map((t) => ({ label: t.customer?.name || 'Ticket', desc: t.issue?.slice(0, 50) || '', icon: Wrench, action: () => onNavigate('tickets') }));
    const saleItems = sales.filter((s) => s.customer?.name?.toLowerCase().includes(q) || s.product?.name?.toLowerCase().includes(q))
      .slice(0, 5).map((s) => ({ label: s.customer?.name || 'Sale', desc: `Rs ${Number(s.total_amount || 0).toLocaleString('en-IN')}`, icon: CreditCard, action: () => onNavigate('sales') }));

    const sections = [];
    if (navItems.length) sections.push({ type: 'nav', items: navItems });
    if (customerItems.length) sections.push({ type: 'customers', items: customerItems });
    if (productItems.length) sections.push({ type: 'products', items: productItems });
    if (ticketItems.length) sections.push({ type: 'tickets', items: ticketItems });
    if (saleItems.length) sections.push({ type: 'sales', items: saleItems });
    return sections;
  })();

  const flatItems = results.flatMap((s) => s.items);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flatItems[selectedIndex]?.action();
    }
  };

  let runningIndex = -1;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <Search />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search customers, products, tickets, sales..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="cmdk-kbd">ESC</span>
        </div>
        <div className="cmdk-results">
          {flatItems.length === 0 ? (
            <div className="cmdk-empty">No results found for "{query}"</div>
          ) : results.map((section) => (
            <div key={section.type}>
              <div className="cmdk-section-label">{section.type}</div>
              {section.items.map((item) => {
                runningIndex++;
                const idx = runningIndex;
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className={`cmdk-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="cmdk-item-icon"><Icon /></div>
                    <div>
                      <div className="cmdk-item-label">{item.label}</div>
                      <div className="cmdk-item-desc">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-footer">
          <kbd>↑</kbd><kbd>↓</kbd> Navigate
          <kbd>↵</kbd> Select
          <kbd>ESC</kbd> Close
        </div>
      </div>
    </div>
  );
}

function AddCustomerModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', notes: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      console.warn('AddCustomerModal submit failed:', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add New Customer</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Rajesh Kumar"
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="rajesh@email.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                className="form-input"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Street address"
              />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                className="form-input"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Mumbai"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Any additional notes about this customer..."
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
