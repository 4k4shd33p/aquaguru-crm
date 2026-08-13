import { useState, useEffect, useMemo, useCallback } from 'react';
import { Wrench, Plus, X, Search, Trash2, Check, ChevronDown, Shield, RefreshCw, Wallet, Clock, Ban, FileText, Package, Settings, User, Eye, IndianRupee, Calculator, ListFilter as Filter, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Cpu } from 'lucide-react';
import { supabase } from './lib/supabase';

const COVERAGE_TYPES = [
  { id: 'warranty', label: 'Warranty', icon: Shield },
  { id: 'amc', label: 'AMC', icon: RefreshCw },
  { id: 'paid_on_demand', label: 'Paid On-Demand', icon: Wallet },
];

const TICKET_TYPES = [
  { id: 'filter_replacement', label: 'Filter Replacement' },
  { id: 'leakage_repair', label: 'Leakage Repair' },
  { id: 'low_flow', label: 'Low Flow / Pressure Issue' },
  { id: 'installation', label: 'Installation' },
  { id: 'routine_maintenance', label: 'Routine Maintenance' },
];

const TICKET_TYPE_LABELS = Object.fromEntries(TICKET_TYPES.map((t) => [t.id, t.label]));

const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const PAYMENT_STATUSES = [
  { id: 'paid_on_site', label: 'Paid On-Site', icon: CheckCircle },
  { id: 'pending', label: 'Pending / Pay Later', icon: Clock },
  { id: 'waived', label: 'Waived', icon: Ban },
];

const PAYMENT_STATUS_LABELS = Object.fromEntries(PAYMENT_STATUSES.map((p) => [p.id, p.label]));

const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];

const QUICK_FITTINGS = [
  { name: 'FR Tube 1/4"', price: 15 },
  { name: 'Connectors', price: 25 },
  { name: 'Teflon Tape', price: 10 },
  { name: 'Diverter Valve', price: 180 },
  { name: 'Inline T', price: 45 },
  { name: 'Ball Valve', price: 65 },
];

export default function ServiceTicketLog({ showToast, customers, products, onRefresh }) {
  const [tickets, setTickets] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const safe = (r, fallback) => {
      if (r.error) { console.warn('Supabase query failed:', r.error.message); return fallback; }
      return r.data || fallback;
    };
    try {
      const [t, a] = await Promise.all([
        supabase
          .from('service_tickets')
          .select('*, customer:customers(name, phone, city), asset:customer_assets(machine_name, model, serial_number), parts:ticket_parts(*)')
          .order('created_at', { ascending: false }),
        supabase.from('customer_assets').select('*, customer:customers(name)'),
      ]);
      setTickets(safe(t, []));
      setAssets(safe(a, []));
    } catch (err) {
      console.warn('fetchData failed, using empty fallbacks:', err.message);
      setTickets([]);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this service ticket? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('service_tickets').delete().eq('id', id);
      if (error) throw error;
      showToast('Ticket deleted');
      fetchData();
      onRefresh?.();
    } catch (err) {
      console.warn('handleDelete failed:', err.message);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase.from('service_tickets').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      showToast('Status updated');
      fetchData();
      onRefresh?.();
    } catch (err) {
      console.warn('handleStatusChange failed:', err.message);
    }
  };

  const counts = useMemo(() => {
    const c = { all: tickets.length, open: 0, in_progress: 0, resolved: 0 };
    tickets.forEach((t) => {
      if (t.status === 'open') c.open++;
      else if (t.status === 'in_progress') c.in_progress++;
      else if (t.status === 'resolved') c.resolved++;
    });
    return c;
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    let result = tickets;
    if (filterTab !== 'all') {
      result = result.filter((t) => t.status === filterTab);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.customer?.name?.toLowerCase().includes(q) ||
        t.issue?.toLowerCase().includes(q) ||
        TICKET_TYPE_LABELS[t.ticket_type]?.toLowerCase().includes(q) ||
        t.coverage_type?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tickets, filterTab, search]);

  return (
    <>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input
            className="search-input"
            placeholder="Search tickets by customer, issue, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus />
          Log New Ticket
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`filter-tab ${filterTab === tab.id ? 'active' : ''}`}
            onClick={() => setFilterTab(tab.id)}
          >
            {tab.label}
            <span className="filter-tab-count">{counts[tab.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Ticket Table */}
      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Ticket Type</th>
                  <th>Coverage</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Final Amount</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="table-empty">
                      <Wrench />
                      No service tickets found. Click "Log New Ticket" to get started.
                    </div>
                  </td></tr>
                ) : filteredTickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t.customer?.name || '—'}
                    </td>
                    <td>{TICKET_TYPE_LABELS[t.ticket_type] || t.ticket_type || '—'}</td>
                    <td>
                      {t.coverage_type && (
                        <span className={`badge badge-${t.coverage_type}`}>
                          <span className="badge-dot" />
                          {COVERAGE_TYPES.find((c) => c.id === t.coverage_type)?.label || t.coverage_type}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${t.priority}`}>
                        <span className="badge-dot" />
                        {t.priority || 'medium'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select"
                        style={{ width: 'auto', padding: '4px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
                        value={t.status}
                        onChange={(e) => handleStatusChange(t.id, e.target.value)}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    <td>
                      {t.payment_status && (
                        <span className={`badge badge-${t.payment_status}`}>
                          <span className="badge-dot" />
                          {PAYMENT_STATUS_LABELS[t.payment_status] || t.payment_status}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--primary-400)' }}>
                      Rs {Number(t.final_amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" onClick={() => setShowDetail(t)} title="View details">
                          <Eye size={16} />
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleDelete(t.id)} title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log New Ticket Modal */}
      {showForm && (
        <TicketForm
          customers={customers}
          products={products}
          assets={assets}
          onClose={() => setShowForm(false)}
          onSubmit={async (ticketData, partsData) => {
            try {
              const { data: ticket, error: ticketError } = await supabase
                .from('service_tickets')
                .insert([ticketData])
                .select()
                .single();
              if (ticketError) throw ticketError;

              if (partsData && partsData.length > 0) {
                const partsWithTicket = partsData.map((p) => ({
                  ...p,
                  ticket_id: ticket.id,
                  line_total: Number(p.quantity) * Number(p.unit_price),
                }));
                const { error: partsError } = await supabase.from('ticket_parts').insert(partsWithTicket);
                if (partsError) throw partsError;
              }

              showToast('Service ticket logged successfully');
              fetchData();
              onRefresh?.();
            } catch (err) {
              console.warn('Failed to log ticket:', err.message);
              showToast('Could not save ticket. Check your connection.', true);
            } finally {
              // Always close the modal so the user is never stuck on the form.
              setShowForm(false);
            }
          }}
        />
      )}

      {/* Ticket Detail Modal */}
      {showDetail && (
        <TicketDetailModal
          ticket={showDetail}
          onClose={() => setShowDetail(null)}
        />
      )}
    </>
  );
}

function TicketForm({ customers, products, assets, onClose, onSubmit }) {
  const [customerId, setCustomerId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [coverageType, setCoverageType] = useState('paid_on_demand');
  const [ticketType, setTicketType] = useState('');
  const [issue, setIssue] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('open');
  const [notes, setNotes] = useState('');
  const [laborCharge, setLaborCharge] = useState(0);
  const [goodwillDiscount, setGoodwillDiscount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Parts state
  const [coreParts, setCoreParts] = useState([]); // [{product_id, name, unit_price, quantity}]
  const [fittings, setFittings] = useState({}); // {name: true/false}
  const [customItems, setCustomItems] = useState([]); // [{name, unit_price, quantity}]

  const customerAssets = useMemo(() => {
    if (!customerId) return [];
    return assets.filter((a) => a.customer_id === customerId);
  }, [assets, customerId]);

  const primaryAsset = useMemo(() => {
    return customerAssets.find((a) => a.is_primary) || customerAssets[0] || null;
  }, [customerAssets]);

  // Auto-select primary asset when customer changes
  useEffect(() => {
    if (primaryAsset) {
      setAssetId(primaryAsset.id);
    } else {
      setAssetId('');
    }
  }, [primaryAsset]);

  const selectedAsset = useMemo(() => {
    return customerAssets.find((a) => a.id === assetId) || null;
  }, [customerAssets, assetId]);

  const corePartProducts = useMemo(() => {
    return products.filter((p) => p.category === 'Core Part');
  }, [products]);

  // Billing calculations
  const partsSubtotal = useMemo(() => {
    const coreTotal = coreParts.reduce((sum, p) => sum + Number(p.unit_price) * Number(p.quantity), 0);
    const fittingsTotal = Object.entries(fittings)
      .filter(([_, checked]) => checked)
      .reduce((sum, [name]) => {
        const fitting = QUICK_FITTINGS.find((f) => f.name === name);
        return sum + (fitting ? fitting.price : 0);
      }, 0);
    const customTotal = customItems.reduce((sum, p) => sum + Number(p.unit_price) * Number(p.quantity), 0);
    return coreTotal + fittingsTotal + customTotal;
  }, [coreParts, fittings, customItems]);

  const subtotal = partsSubtotal + Number(laborCharge || 0);

  const coverageDiscount = useMemo(() => {
    if (coverageType === 'warranty' || coverageType === 'amc') {
      return subtotal;
    }
    return 0;
  }, [coverageType, subtotal]);

  const finalAmount = useMemo(() => {
    const result = subtotal - coverageDiscount - Number(goodwillDiscount || 0);
    return Math.max(0, result);
  }, [subtotal, coverageDiscount, goodwillDiscount]);

  // Auto-set payment status to waived when coverage is warranty/amc and no goodwill
  useEffect(() => {
    if ((coverageType === 'warranty' || coverageType === 'amc') && finalAmount === 0) {
      setPaymentStatus('waived');
    }
  }, [coverageType, finalAmount]);

  const addCorePart = (productId) => {
    if (!productId) return;
    const product = corePartProducts.find((p) => p.id === productId);
    if (!product) return;
    if (coreParts.some((p) => p.product_id === productId)) return;
    setCoreParts([...coreParts, {
      product_id: productId,
      name: product.name,
      unit_price: Number(product.price),
      quantity: 1,
    }]);
  };

  const updateCorePartQty = (productId, qty) => {
    setCoreParts(coreParts.map((p) =>
      p.product_id === productId ? { ...p, quantity: Math.max(1, parseInt(qty) || 1) } : p
    ));
  };

  const removeCorePart = (productId) => {
    setCoreParts(coreParts.filter((p) => p.product_id !== productId));
  };

  const toggleFitting = (name) => {
    setFittings({ ...fittings, [name]: !fittings[name] });
  };

  const addCustomItem = () => {
    setCustomItems([...customItems, { name: '', unit_price: 0, quantity: 1 }]);
  };

  const updateCustomItem = (index, field, value) => {
    setCustomItems(customItems.map((item, i) =>
      i === index ? { ...item, [field]: field === 'name' ? value : Math.max(0, Number(value) || 0) } : item
    ));
  };

  const removeCustomItem = (index) => {
    setCustomItems(customItems.filter((_, i) => i !== index));
  };

  const allParts = useMemo(() => {
    const parts = [];
    coreParts.forEach((p) => {
      parts.push({ part_type: 'core', name: p.name, quantity: p.quantity, unit_price: p.unit_price });
    });
    Object.entries(fittings).forEach(([name, checked]) => {
      if (checked) {
        const fitting = QUICK_FITTINGS.find((f) => f.name === name);
        parts.push({ part_type: 'fitting', name, quantity: 1, unit_price: fitting ? fitting.price : 0 });
      }
    });
    customItems.forEach((p) => {
      if (p.name.trim()) {
        parts.push({ part_type: 'custom', name: p.name, quantity: p.quantity, unit_price: p.unit_price });
      }
    });
    return parts;
  }, [coreParts, fittings, customItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerId) { setError('Please select a customer'); return; }
    if (!ticketType) { setError('Please select a ticket type'); return; }
    if (!issue.trim()) { setError('Please describe the issue'); return; }

    setSubmitting(true);
    setError('');

    const ticketData = {
      customer_id: customerId,
      asset_id: assetId || null,
      coverage_type: coverageType,
      ticket_type: ticketType,
      issue: issue.trim(),
      priority,
      status,
      notes: notes.trim() || null,
      labor_charge: Number(laborCharge) || 0,
      subtotal,
      coverage_discount: coverageDiscount,
      goodwill_discount: Number(goodwillDiscount) || 0,
      final_amount: finalAmount,
      payment_status: paymentStatus,
    };

    try {
      await onSubmit(ticketData, allParts);
    } catch (err) {
      console.warn('TicketForm submit failed:', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Log New Service Ticket</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            {/* Coverage Type */}
            <div className="modal-section">
              <div className="modal-section-title"><Shield size={16} /> Coverage Type</div>
              <div className="coverage-selector">
                {COVERAGE_TYPES.map((ct) => {
                  const Icon = ct.icon;
                  return (
                    <div
                      key={ct.id}
                      className={`coverage-option ${coverageType === ct.id ? 'active' : ''}`}
                      data-coverage={ct.id}
                      onClick={() => setCoverageType(ct.id)}
                    >
                      <div className="coverage-option-icon"><Icon /></div>
                      <div className="coverage-option-label">{ct.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer & Asset */}
            <div className="modal-section">
              <div className="modal-section-title"><User size={16} /> Customer & Machine</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Customer *</label>
                  <select
                    className="form-select"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Machine / Asset</label>
                  <select
                    className="form-select"
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    disabled={!customerId}
                  >
                    <option value="">Select asset...</option>
                    {customerAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.machine_name}{a.model ? ` (${a.model})` : ''}{a.is_primary ? ' — Primary' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedAsset && (
                <div className="asset-info">
                  <div className="asset-info-item">
                    <div className="asset-info-label">Machine</div>
                    <div className="asset-info-value">{selectedAsset.machine_name}</div>
                  </div>
                  {selectedAsset.model && (
                    <div className="asset-info-item">
                      <div className="asset-info-label">Model</div>
                      <div className="asset-info-value">{selectedAsset.model}</div>
                    </div>
                  )}
                  {selectedAsset.serial_number && (
                    <div className="asset-info-item">
                      <div className="asset-info-label">Serial</div>
                      <div className="asset-info-value">{selectedAsset.serial_number}</div>
                    </div>
                  )}
                  {selectedAsset.warranty_expiry && (
                    <div className="asset-info-item">
                      <div className="asset-info-label">Warranty Until</div>
                      <div className="asset-info-value">{selectedAsset.warranty_expiry}</div>
                    </div>
                  )}
                  {selectedAsset.amc_expiry && (
                    <div className="asset-info-item">
                      <div className="asset-info-label">AMC Until</div>
                      <div className="asset-info-value">{selectedAsset.amc_expiry}</div>
                    </div>
                  )}
                </div>
              )}
              {customerId && !selectedAsset && (
                <div className="asset-info-empty">No machines registered for this customer.</div>
              )}
            </div>

            {/* Ticket Type & Priority */}
            <div className="modal-section">
              <div className="modal-section-title"><Wrench size={16} /> Ticket Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Ticket Type *</label>
                  <select
                    className="form-select"
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                  >
                    <option value="">Select type...</option>
                    {TICKET_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Issue Description *</label>
                <textarea
                  className="form-textarea"
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="Describe the problem reported by the customer..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Technician Notes</label>
                <textarea
                  className="form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes, diagnosis, actions taken..."
                  rows={2}
                />
              </div>
            </div>

            {/* Parts Picker */}
            <div className="modal-section">
              <div className="modal-section-title"><Package size={16} /> Parts Used</div>

              {/* Core Parts Dropdown */}
              <div className="parts-section">
                <div className="parts-section-title"><Cpu size={16} /> Core Parts</div>
                <div className="core-parts-list">
                  {coreParts.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '4px 0' }}>
                      No core parts selected yet.
                    </div>
                  )}
                  {coreParts.map((p) => (
                    <div key={p.product_id} className="core-part-row">
                      <div className="core-part-name">{p.name}</div>
                      <div className="core-part-price">Rs {Number(p.unit_price).toLocaleString('en-IN')}</div>
                      <input
                        type="number"
                        className="qty-input"
                        value={p.quantity}
                        min="1"
                        onChange={(e) => updateCorePartQty(p.product_id, e.target.value)}
                      />
                      <button type="button" className="remove-part-btn" onClick={() => removeCorePart(p.product_id)}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <select
                    className="form-select"
                    value=""
                    onChange={(e) => { addCorePart(e.target.value); e.target.value = ''; }}
                    disabled={corePartProducts.length === 0}
                  >
                    <option value="">+ Add core part...</option>
                    {corePartProducts
                      .filter((p) => !coreParts.some((cp) => cp.product_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — Rs {Number(p.price).toLocaleString('en-IN')}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Quick Fittings Checklist */}
              <div className="parts-section">
                <div className="parts-section-title"><Settings size={16} /> Quick Fittings</div>
                <div className="parts-grid">
                  {QUICK_FITTINGS.map((f) => {
                    const checked = !!fittings[f.name];
                    return (
                      <div
                        key={f.name}
                        className={`fitting-item ${checked ? 'checked' : ''}`}
                        onClick={() => toggleFitting(f.name)}
                      >
                        <div className="fitting-checkbox"><Check /></div>
                        <div className="fitting-info">
                          <span>{f.name}</span>
                          <span className="fitting-price">Rs {f.price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Miscellaneous Items */}
              <div className="parts-section">
                <div className="parts-section-title"><FileText size={16} /> Custom / Miscellaneous Items</div>
                {customItems.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '4px 0 8px' }}>
                    No custom items added.
                  </div>
                )}
                {customItems.map((item, index) => (
                  <div key={index} className="custom-item-row">
                    <input
                      className="form-input custom-item-name"
                      placeholder="Item description (e.g. Extra 5m Inlet Pipe)"
                      value={item.name}
                      onChange={(e) => updateCustomItem(index, 'name', e.target.value)}
                    />
                    <input
                      className="form-input custom-item-qty"
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateCustomItem(index, 'quantity', e.target.value)}
                    />
                    <input
                      className="form-input custom-item-price"
                      type="number"
                      min="0"
                      placeholder="Price"
                      value={item.unit_price}
                      onChange={(e) => updateCustomItem(index, 'unit_price', e.target.value)}
                    />
                    <button type="button" className="remove-part-btn" onClick={() => removeCustomItem(index)}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addCustomItem} style={{ marginTop: 4 }}>
                  <Plus size={14} />
                  Add Custom Item
                </button>
              </div>
            </div>

            {/* Billing Calculator */}
            <div className="modal-section">
              <div className="modal-section-title"><Calculator size={16} /> Field Payment Calculator</div>
              <div className="billing-section">
                <div className="form-group">
                  <label className="form-label">Labor Charge (Rs)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    value={laborCharge}
                    onChange={(e) => setLaborCharge(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="billing-row">
                  <span>Parts Subtotal</span>
                  <span className="billing-amount">Rs {partsSubtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="billing-row">
                  <span>Labor Charge</span>
                  <span className="billing-amount">Rs {Number(laborCharge || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="billing-row">
                  <span>Subtotal</span>
                  <span className="billing-amount">Rs {subtotal.toLocaleString('en-IN')}</span>
                </div>

                {(coverageType === 'warranty' || coverageType === 'amc') && (
                  <div className="billing-row coverage-discount discount">
                    <span>
                      <Shield size={14} style={{ display: 'inline', marginRight: 4 }} />
                      Coverage Discount ({coverageType === 'amc' ? 'AMC' : 'Warranty'} — 100%)
                    </span>
                    <span className="billing-amount">- Rs {coverageDiscount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="billing-row">
                  <span>Goodwill Discount (Rs)</span>
                  <div className="billing-input-group">
                    <span className="rupee">Rs</span>
                    <input
                      type="number"
                      className="billing-input"
                      min="0"
                      value={goodwillDiscount}
                      onChange={(e) => setGoodwillDiscount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="billing-row total">
                  <span>Final Payable Amount</span>
                  <span className="billing-amount">Rs {finalAmount.toLocaleString('en-IN')}</span>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label className="form-label">Payment Status</label>
                  <div className="payment-options">
                    {PAYMENT_STATUSES.map((ps) => {
                      const Icon = ps.icon;
                      return (
                        <div
                          key={ps.id}
                          className={`payment-option ${paymentStatus === ps.id ? 'active' : ''}`}
                          data-status={ps.id}
                          onClick={() => setPaymentStatus(ps.id)}
                        >
                          <Icon />
                          {ps.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Log Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketDetailModal({ ticket, onClose }) {
  const coverageLabel = COVERAGE_TYPES.find((c) => c.id === ticket.coverage_type)?.label || ticket.coverage_type;

  return (
    <div className="ticket-detail-overlay" onClick={onClose}>
      <div className="ticket-detail" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-detail-header">
          <div>
            <div className="ticket-detail-title">Service Ticket</div>
            <div className="ticket-detail-id">#{ticket.id?.slice(0, 8)}</div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="ticket-detail-body">
          <div className="ticket-detail-badges">
            {ticket.coverage_type && (
              <span className={`badge badge-${ticket.coverage_type}`}>
                <span className="badge-dot" />
                {coverageLabel}
              </span>
            )}
            <span className={`badge badge-${ticket.priority}`}>
              <span className="badge-dot" />
              {ticket.priority}
            </span>
            <span className={`badge badge-${ticket.status}`}>
              <span className="badge-dot" />
              {STATUS_LABELS[ticket.status] || ticket.status}
            </span>
            {ticket.payment_status && (
              <span className={`badge badge-${ticket.payment_status}`}>
                <span className="badge-dot" />
                {PAYMENT_STATUS_LABELS[ticket.payment_status] || ticket.payment_status}
              </span>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="ticket-detail-row">
              <span className="ticket-detail-label">Customer</span>
              <span className="ticket-detail-value">{ticket.customer?.name || '—'}</span>
            </div>
            <div className="ticket-detail-row">
              <span className="ticket-detail-label">Ticket Type</span>
              <span className="ticket-detail-value">{TICKET_TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type || '—'}</span>
            </div>
            {ticket.asset && (
              <div className="ticket-detail-row">
                <span className="ticket-detail-label">Machine</span>
                <span className="ticket-detail-value">
                  {ticket.asset.machine_name}{ticket.asset.model ? ` (${ticket.asset.model})` : ''}
                </span>
              </div>
            )}
            <div className="ticket-detail-row">
              <span className="ticket-detail-label">Issue</span>
              <span className="ticket-detail-value" style={{ maxWidth: 360 }}>{ticket.issue}</span>
            </div>
            {ticket.notes && (
              <div className="ticket-detail-row">
                <span className="ticket-detail-label">Notes</span>
                <span className="ticket-detail-value" style={{ maxWidth: 360 }}>{ticket.notes}</span>
              </div>
            )}
          </div>

          {ticket.parts && ticket.parts.length > 0 && (
            <div className="ticket-detail-parts">
              <div className="modal-section-title"><Package size={16} /> Parts Used</div>
              {ticket.parts.map((p, i) => (
                <div key={i} className="ticket-detail-part">
                  <span className="ticket-detail-part-name">
                    {p.name} × {p.quantity}
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-dim)' }}>[{p.part_type}]</span>
                  </span>
                  <span className="ticket-detail-part-total">Rs {Number(p.line_total).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="modal-section-title"><Calculator size={16} /> Billing Summary</div>
            <div className="billing-section">
              <div className="billing-row">
                <span>Subtotal</span>
                <span className="billing-amount">Rs {Number(ticket.subtotal || 0).toLocaleString('en-IN')}</span>
              </div>
              {Number(ticket.coverage_discount || 0) > 0 && (
                <div className="billing-row coverage-discount discount">
                  <span>Coverage Discount</span>
                  <span className="billing-amount">- Rs {Number(ticket.coverage_discount).toLocaleString('en-IN')}</span>
                </div>
              )}
              {Number(ticket.goodwill_discount || 0) > 0 && (
                <div className="billing-row discount">
                  <span>Goodwill Discount</span>
                  <span className="billing-amount">- Rs {Number(ticket.goodwill_discount).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="billing-row total">
                <span>Final Amount</span>
                <span className="billing-amount">Rs {Number(ticket.final_amount || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
