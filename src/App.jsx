import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [customers, setCustomers] = useState([])
  const [serviceTickets, setServiceTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Expanded Asset History Toggles
  const [expandedAssets, setExpandedAssets] = useState({})

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showEditTicketModal, setShowEditTicketModal] = useState(false)
  
  // Editing States
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [editingTicket, setEditingTicket] = useState(null)
  const [selectedCustomerForAsset, setSelectedCustomerForAsset] = useState(null)
  const [selectedAssetForTicket, setSelectedAssetForTicket] = useState(null)

  // Form States
  const [newCust, setNewCust] = useState({ full_name: '', primary_phone: '', address: '', area_zone: 'Zone 1', customer_type: 'Residential' })
  const [newAsset, setNewAsset] = useState({ asset_tag_nickname: 'Main Kitchen Unit', asset_category: 'Domestic RO', model_name: 'AquaGuard Classic', serial_number: '', membrane_gpd: '100 GPD' })
  const [newTicket, setNewTicket] = useState({ visit_reason: 'Scheduled Check', service_type_tag: '🟢 AMC Service', work_performed_notes: 'Cleaned filters and checked TDS levels.', internal_parts_cost: '0', technician_payout_fee: '250', amount_collected_on_site: '0', payment_mode: 'UPI' })

  useEffect(() => {
    fetchAllData()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    const { data: custData } = await supabase
      .from('customers')
      .select(`
        *,
        assets (
          *,
          sales_ledger (*),
          coverage_contracts (*),
          service_tickets (*)
        )
      `)
      .order('created_at', { ascending: false })

    if (custData) setCustomers(custData)

    const { data: ticketData } = await supabase
      .from('service_tickets')
      .select('*, assets(model_name, serial_number, customers(full_name))')
      .order('visit_date', { ascending: false })

    if (ticketData) setServiceTickets(ticketData)
    setLoading(false)
  }

  async function handleSaveCustomer(e) {
    e.preventDefault()
    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(newCust).eq('id', editingCustomer.id)
      if (!error) { closeCustomerModal(); fetchAllData(); } else { alert('Error updating customer: ' + error.message); }
    } else {
      const { error } = await supabase.from('customers').insert([newCust])
      if (!error) { closeCustomerModal(); fetchAllData(); } else { alert('Error creating customer: ' + error.message); }
    }
  }

  async function handleDeleteCustomer(id) {
    if (!window.confirm('Delete this customer account and all linked equipment?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (!error) fetchAllData(); else alert('Error deleting customer: ' + error.message)
  }

  function openEditCustomer(cust) {
    setEditingCustomer(cust)
    setNewCust({
      full_name: cust.full_name || '',
      primary_phone: cust.primary_phone || '',
      address: cust.address || '',
      area_zone: cust.area_zone || 'Zone 1',
      customer_type: cust.customer_type || 'Residential'
    })
    setShowCustomerModal(true)
  }

  function closeCustomerModal() {
    setShowCustomerModal(false)
    setEditingCustomer(null)
    setNewCust({ full_name: '', primary_phone: '', address: '', area_zone: 'Zone 1', customer_type: 'Residential' })
  }

  async function handleCreateAsset(e) {
    e.preventDefault()
    if (!selectedCustomerForAsset) return
    const { error } = await supabase.from('assets').insert([{
      ...newAsset,
      customer_id: selectedCustomerForAsset.id,
      installation_date: new Date().toISOString().split('T')[0]
    }])
    if (!error) { setShowAssetModal(false); fetchAllData(); } else { alert('Error registering asset: ' + error.message); }
  }

  async function handleDeleteAsset(assetId) {
    if (!window.confirm('Delete this purifier unit?')) return
    const { error } = await supabase.from('assets').delete().eq('id', assetId)
    if (!error) fetchAllData(); else alert('Error deleting asset: ' + error.message)
  }

  async function handleCreateTicket(e) {
    e.preventDefault()
    if (!selectedAssetForTicket) return
    const { error } = await supabase.from('service_tickets').insert([{
      ...newTicket,
      asset_id: selectedAssetForTicket.id,
      visit_date: new Date().toISOString()
    }])
    if (!error) { setShowTicketModal(false); fetchAllData(); } else { alert('Error logging ticket: ' + error.message); }
  }

  async function handleUpdateTicket(e) {
    e.preventDefault()
    if (!editingTicket) return
    const { error } = await supabase.from('service_tickets').update(newTicket).eq('id', editingTicket.id)
    if (!error) { setShowEditTicketModal(false); setEditingTicket(null); fetchAllData(); } else { alert('Error updating ticket: ' + error.message); }
  }

  async function handleDeleteTicket(ticketId) {
    if (!window.confirm('Delete this service ticket record?')) return
    const { error } = await supabase.from('service_tickets').delete().eq('id', ticketId)
    if (!error) fetchAllData(); else alert('Error deleting ticket: ' + error.message)
  }

  function openEditTicket(t) {
    setEditingTicket(t)
    setNewTicket({
      visit_reason: t.visit_reason || '',
      service_type_tag: t.service_type_tag || '🟢 AMC Service',
      work_performed_notes: t.work_performed_notes || '',
      internal_parts_cost: t.internal_parts_cost || '0',
      technician_payout_fee: t.technician_payout_fee || '0',
      amount_collected_on_site: t.amount_collected_on_site || '0',
      payment_mode: t.payment_mode || 'UPI'
    })
    setShowEditTicketModal(true)
  }

  function toggleAssetExpand(assetId) {
    setExpandedAssets(prev => ({ ...prev, [assetId]: !prev[assetId] }))
  }

  const filteredCustomers = customers.filter(c => 
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.primary_phone?.includes(searchQuery) ||
    c.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.area_zone?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalAssetsCount = customers.reduce((acc, c) => acc + (c.assets?.length || 0), 0)

  return (
    <div style={styles.layout}>
      {/* Sidebar Navigation */}
      <aside style={styles.sidebar}>
        <div style={styles.brandContainer}>
          <div style={styles.logoBadge}>💧</div>
          <div>
            <h2 style={styles.brandTitle}>AquaGuru</h2>
            <span style={styles.brandSubtitle}>Cloud CRM 2026</span>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          <button onClick={() => setActiveTab('dashboard')} style={{...styles.sidebarBtn, ...(activeTab === 'dashboard' ? styles.activeSidebarBtn : {})}}>
            <span style={styles.navIcon}>📊</span> Overview
          </button>
          <button onClick={() => setActiveTab('customers')} style={{...styles.sidebarBtn, ...(activeTab === 'customers' ? styles.activeSidebarBtn : {})}}>
            <span style={styles.navIcon}>👥</span> Customers & Assets
          </button>
          <button onClick={() => setActiveTab('tickets')} style={{...styles.sidebarBtn, ...(activeTab === 'tickets' ? styles.activeSidebarBtn : {})}}>
            <span style={styles.navIcon}>🔧</span> Service Log
          </button>
          <button onClick={() => setActiveTab('ledger')} style={{...styles.sidebarBtn, ...(activeTab === 'ledger' ? styles.activeSidebarBtn : {})}}>
            <span style={styles.navIcon}>💳</span> Financial Ledger
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.connectionDot}></div>
          <span style={styles.connectionText}>Supabase Connected</span>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main style={styles.mainArea}>
        <header style={styles.topHeader}>
          <div>
            <h1 style={styles.pageTitle}>
              {activeTab === 'dashboard' && 'Executive Performance'}
              {activeTab === 'customers' && 'Client & Hardware Tree'}
              {activeTab === 'tickets' && 'Service Tickets & Economics'}
              {activeTab === 'ledger' && 'Revenue & EMI Ledger'}
            </h1>
            <p style={styles.pageSub}>Real-time asset telemetry and customer lifecycle management</p>
          </div>
          <button onClick={() => setShowCustomerModal(true)} style={styles.primaryBtn}>
            <span>+</span> New Customer
          </button>
        </header>

        {loading ? (
          <div style={styles.loadingBox}>
            <div style={styles.spinner}></div>
            <p style={{ color: '#64748b', fontWeight: '500' }}>Synchronizing cloud database...</p>
          </div>
        ) : (
          <div style={styles.contentBody}>
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total Accounts</span>
                    <span style={styles.statValue}>{customers.length}</span>
                    <span style={styles.statSub}>Active client profiles</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Tracked Purifiers</span>
                    <span style={styles.statValue}>{totalAssetsCount}</span>
                    <span style={styles.statSub}>Hardware units deployed</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Service Visits</span>
                    <span style={styles.statValue}>{serviceTickets.length}</span>
                    <span style={styles.statSub}>Completed maintenance calls</span>
                  </div>
                </div>

                <div style={styles.heroBanner}>
                  <div style={{ maxWidth: '600px' }}>
                    <span style={styles.bannerTag}>Enterprise Field Operations</span>
                    <h2 style={{ margin: '8px 0 12px 0', fontSize: '20px', color: '#0f172a' }}>Asset-First Relational Architecture</h2>
                    <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
                      Every customer profile anchors directly to their physical water purifiers. Manage warranties, track active AMC coverage, and log maintenance tickets with instant cost breakdowns.
                    </p>
                  </div>
                  <button onClick={() => setActiveTab('customers')} style={styles.bannerBtn}>
                    Open Directory →
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div>
                <div style={styles.filterBar}>
                  <div style={styles.searchWrapper}>
                    <span style={styles.searchIcon}>🔍</span>
                    <input 
                      type="text" 
                      placeholder="Search by client name, phone, zone, or address..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={styles.searchBox}
                    />
                  </div>
                  <span style={styles.resultCount}>Showing {filteredCustomers.length} records</span>
                </div>

                {filteredCustomers.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>📂</div>
                    <h3 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No clients found</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Click "New Customer" in the header to initialize a record.</p>
                  </div>
                ) : (
                  <div style={styles.customerGrid}>
                    {filteredCustomers.map(c => (
                      <div key={c.id} style={styles.customerCard}>
                        <div style={styles.custCardHeader}>
                          <div>
                            <h3 style={styles.custName}>{c.full_name}</h3>
                            <a href={`tel:${c.primary_phone}`} style={styles.phoneLink}>📞 {c.primary_phone || 'No Phone'}</a>
                          </div>
                          <span style={styles.zonePill}>{c.area_zone || 'Zone 1'}</span>
                        </div>
                        <p style={styles.addressLine}>📍 {c.address || 'No address specified'}</p>

                        <div style={styles.custActionRow}>
                          <button onClick={() => openEditCustomer(c)} style={styles.actionSubBtn}>Edit Profile</button>
                          <button onClick={() => handleDeleteCustomer(c.id)} style={styles.actionDeleteBtn}>Delete Client</button>
                        </div>

                        {/* INSTALLED MACHINES */}
                        <div style={styles.machineSection}>
                          <div style={styles.machineHeaderRow}>
                            <h4 style={styles.machineTitle}>Installed Machines ({c.assets?.length || 0})</h4>
                            <button onClick={() => { setSelectedCustomerForAsset(c); setShowAssetModal(true); }} style={styles.addMachineBtn}>
                              + Add Machine
                            </button>
                          </div>

                          {c.assets?.length === 0 ? (
                            <p style={styles.noMachineText}>No purifier units registered to this profile.</p>
                          ) : (
                            c.assets?.map(asset => {
                              const isExpanded = expandedAssets[asset.id]
                              const activeAMC = asset.coverage_contracts?.[0]
                              const machineTickets = asset.service_tickets || []

                              return (
                                <div key={asset.id} style={styles.assetContainer}>
                                  <div style={styles.machineRow}>
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <strong style={{ color: '#0f172a', fontSize: '14px' }}>{asset.model_name}</strong>
                                        <span style={styles.nicknameBadge}>{asset.asset_tag_nickname}</span>
                                      </div>
                                      <div style={styles.serialSub}>S/N: {asset.serial_number || 'N/A'} • Installed: {asset.installation_date || 'N/A'}</div>
                                    </div>
                                    <div style={styles.machineRowRight}>
                                      <span style={styles.gpdPill}>{asset.membrane_gpd}</span>
                                      <button onClick={() => toggleAssetExpand(asset.id)} style={styles.expandToggleBtn}>
                                        {isExpanded ? 'Collapse ▲' : `History (${machineTickets.length}) ▼`}
                                      </button>
                                      <button onClick={() => { setSelectedAssetForTicket(asset); setShowTicketModal(true); }} style={styles.visitBtn}>
                                        Log Visit
                                      </button>
                                      <button onClick={() => handleDeleteAsset(asset.id)} style={styles.deleteAssetBtn} title="Delete Asset">
                                        ✕
                                      </button>
                                    </div>
                                  </div>

                                  {/* EXPANDABLE ASSET DETAILS & HISTORY */}
                                  {isExpanded && (
                                    <div style={styles.assetExpandedDrawer}>
                                      <div style={styles.drawerGrid}>
                                        <div style={styles.drawerBox}>
                                          <span style={styles.drawerBoxTitle}>💳 Sales & Warranty</span>
                                          <p style={styles.drawerText}>Category: {asset.asset_category}</p>
                                          <p style={styles.drawerText}>Warranty: Standard 1-Yr Active</p>
                                        </div>
                                        <div style={styles.drawerBox}>
                                          <span style={styles.drawerBoxTitle}>🛡️ AMC Status</span>
                                          {activeAMC ? (
                                            <p style={{ ...styles.drawerText, color: '#15803d', fontWeight: '600' }}>Active AMC Enrolled</p>
                                          ) : (
                                            <p style={{ ...styles.drawerText, color: '#b45309', fontStyle: 'italic' }}>No AMC Enrolled</p>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ marginTop: '12px' }}>
                                        <h5 style={styles.drawerSubHeading}>Service History Log</h5>
                                        {machineTickets.length === 0 ? (
                                          <p style={styles.emptyHistoryText}>No maintenance visits recorded for this machine.</p>
                                        ) : (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {machineTickets.map(t => (
                                              <div key={t.id} style={styles.ticketHistoryRow}>
                                                <div>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={styles.tagBadge}>{t.service_type_tag}</span>
                                                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>{t.visit_reason}</strong>
                                                  </div>
                                                  <p style={styles.ticketNotes}>{t.work_performed_notes} (Parts: ₹{t.internal_parts_cost} | Tech Fee: ₹{t.technician_payout_fee})</p>
                                                </div>
                                                <div style={styles.ticketRowRight}>
                                                  <span style={styles.amountCollected}>₹{t.amount_collected_on_site} <small>({t.payment_mode})</small></span>
                                                  <button onClick={() => openEditTicket(t)} style={styles.smallEditBtn}>Edit</button>
                                                  <button onClick={() => handleDeleteTicket(t.id)} style={styles.smallDeleteBtn}>Delete</button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tickets' && (
              <div style={styles.tableCard}>
                <div style={styles.tableHeaderContainer}>
                  <h3 style={styles.tableHeading}>Master Service Visit Log</h3>
                  <span style={styles.resultCount}>{serviceTickets.length} total tickets</span>
                </div>
                {serviceTickets.length === 0 ? (
                  <div style={styles.emptyState}><p>No service tickets recorded.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Date</th>
                          <th style={styles.th}>Customer & Machine</th>
                          <th style={styles.th}>Coverage</th>
                          <th style={styles.th}>Visit Reason & Notes</th>
                          <th style={styles.th}>Collection</th>
                          <th style={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceTickets.map(t => (
                          <tr key={t.id} style={styles.tr}>
                            <td style={styles.td}>{new Date(t.visit_date).toLocaleDateString()}</td>
                            <td style={styles.td}>
                              <strong style={{ color: '#0f172a' }}>{t.assets?.customers?.full_name || 'Customer'}</strong>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>{t.assets?.model_name}</div>
                            </td>
                            <td style={styles.td}><span style={styles.tagBadge}>{t.service_type_tag}</span></td>
                            <td style={styles.td}>
                              <strong style={{ color: '#1e293b' }}>{t.visit_reason}</strong>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{t.work_performed_notes}</div>
                            </td>
                            <td style={styles.td}>
                              <strong style={{ color: '#0f172a' }}>₹{t.amount_collected_on_site || 0}</strong> 
                              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>({t.payment_mode})</span>
                            </td>
                            <td style={styles.td}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => openEditTicket(t)} style={styles.smallEditBtn}>Edit</button>
                                <button onClick={() => handleDeleteTicket(t.id)} style={styles.tableDeleteBtn}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ledger' && (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>💳</div>
                <h3>Sales & Financial Ledger</h3>
                <p style={{ color: '#64748b', marginTop: '6px', fontSize: '14px' }}>Track initial machine margins, down payments, and AMC renewal balances.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALS */}
      {showCustomerModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editingCustomer ? 'Edit Client Account' : 'New Customer Account'}</h3>
              <button onClick={closeCustomerModal} style={styles.modalCloseBtn}>✕</button>
            </div>
            <form onSubmit={handleSaveCustomer} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Full Name</label>
                <input type="text" required value={newCust.full_name} onChange={e => setNewCust({...newCust, full_name: e.target.value})} style={styles.inputField} placeholder="e.g. Rajesh Kumar" />
              </div>
              <div>
                <label style={styles.formLabel}>Primary Phone</label>
                <input type="text" required value={newCust.primary_phone} onChange={e => setNewCust({...newCust, primary_phone: e.target.value})} style={styles.inputField} placeholder="98432XXXXX" />
              </div>
              <div>
                <label style={styles.formLabel}>Installation Address</label>
                <textarea value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} style={{...styles.inputField, height: '70px', resize: 'none'}} placeholder="Street address, apartment name..." />
              </div>
              <div>
                <label style={styles.formLabel}>Area Zone</label>
                <input type="text" value={newCust.area_zone} onChange={e => setNewCust({...newCust, area_zone: e.target.value})} style={styles.inputField} placeholder="Zone 1 / Adambakkam" />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={closeCustomerModal} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>{editingCustomer ? 'Save Changes' : 'Create Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssetModal && selectedCustomerForAsset && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Register Purifier Asset</h3>
              <button onClick={() => setShowAssetModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 12px 0' }}>Client: <strong>{selectedCustomerForAsset.full_name}</strong></p>
            <form onSubmit={handleCreateAsset} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Asset Nickname Tag</label>
                <input type="text" value={newAsset.asset_tag_nickname} onChange={e => setNewAsset({...newAsset, asset_tag_nickname: e.target.value})} style={styles.inputField} />
              </div>
              <div>
                <label style={styles.formLabel}>Category</label>
                <select value={newAsset.asset_category} onChange={e => setNewAsset({...newAsset, asset_category: e.target.value})} style={styles.inputField}>
                  <option value="Domestic RO">Domestic RO</option>
                  <option value="Commercial RO">Commercial RO</option>
                  <option value="Industrial Plant">Industrial Plant</option>
                  <option value="Water Softener">Water Softener</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Model Name</label>
                <input type="text" required value={newAsset.model_name} onChange={e => setNewAsset({...newAsset, model_name: e.target.value})} style={styles.inputField} placeholder="AquaGuard Classic" />
              </div>
              <div>
                <label style={styles.formLabel}>Serial Number</label>
                <input type="text" value={newAsset.serial_number} onChange={e => setNewAsset({...newAsset, serial_number: e.target.value})} style={styles.inputField} placeholder="S/N 948239" />
              </div>
              <div>
                <label style={styles.formLabel}>Membrane Capacity</label>
                <input type="text" value={newAsset.membrane_gpd} onChange={e => setNewAsset({...newAsset, membrane_gpd: e.target.value})} style={styles.inputField} placeholder="100 GPD" />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowAssetModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Register Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTicketModal && selectedAssetForTicket && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Log Service Visit</h3>
              <button onClick={() => setShowTicketModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 12px 0' }}>Machine: <strong>{selectedAssetForTicket.model_name}</strong></p>
            <form onSubmit={handleCreateTicket} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Coverage Type</label>
                <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.inputField}>
                  <option value="🟡 Warranty Service">🟡 Warranty Service</option>
                  <option value="🟢 AMC Service">🟢 AMC Service</option>
                  <option value="🔵 Paid On-Demand">🔵 Paid On-Demand</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Visit Reason</label>
                <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.inputField} placeholder="Scheduled Check / Filter Replacement" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Parts Cost (₹)</label><input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.inputField} /></div>
                <div><label style={styles.formLabel}>Tech Fee (₹)</label><input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.inputField} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Collected (₹)</label><input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.inputField} /></div>
                <div>
                  <label style={styles.formLabel}>Payment Mode</label>
                  <select value={newTicket.payment_mode} onChange={e => setNewTicket({...newTicket, payment_mode: e.target.value})} style={styles.inputField}>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={styles.formLabel}>Work Notes</label>
                <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.inputField, height: '60px', resize: 'none'}} />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowTicketModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditTicketModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Edit Service Ticket</h3>
              <button onClick={() => setShowEditTicketModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <form onSubmit={handleUpdateTicket} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Coverage Type</label>
                <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.inputField}>
                  <option value="🟡 Warranty Service">🟡 Warranty Service</option>
                  <option value="🟢 AMC Service">🟢 AMC Service</option>
                  <option value="🔵 Paid On-Demand">🔵 Paid On-Demand</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Visit Reason</label>
                <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.inputField} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Parts Cost (₹)</label><input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.inputField} /></div>
                <div><label style={styles.formLabel}>Tech Fee (₹)</label><input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.inputField} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Collected (₹)</label><input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.inputField} /></div>
                <div>
                  <label style={styles.formLabel}>Payment Mode</label>
                  <select value={newTicket.payment_mode} onChange={e => setNewTicket({...newTicket, payment_mode: e.target.value})} style={styles.inputField}>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={styles.formLabel}>Work Notes</label>
                <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.inputField, height: '60px', resize: 'none'}} />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowEditTicketModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Update Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc', color: '#1e293b' },
  sidebar: { width: '260px', backgroundColor: '#090d16', color: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b', flexShrink: 0 },
  brandContainer: { padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #1e293b' },
  logoBadge: { width: '40px', height: '40px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)' },
  brandTitle: { margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px' },
  brandSubtitle: { fontSize: '11px', color: '#64748b', fontWeight: '500' },
  sidebarNav: { padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
  sidebarBtn: { width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#94a3b8', padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s ease' },
  activeSidebarBtn: { backgroundColor: '#0284c7', color: '#fff', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)' },
  navIcon: { fontSize: '16px' },
  sidebarFooter: { padding: '16px 20px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '8px' },
  connectionDot: { width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%', boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)' },
  connectionText: { fontSize: '12px', color: '#cbd5e1', fontWeight: '500' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' },
  topHeader: { padding: '24px 32px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' },
  pageTitle: { margin: 0, fontSize: '22px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.4px' },
  pageSub: { margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' },
  contentBody: { padding: '32px', maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' },
  statCard: { backgroundColor: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' },
  statLabel: { fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statValue: { fontSize: '32px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px 0', letterSpacing: '-0.5px' },
  statSub: { fontSize: '12px', color: '#94a3b8' },
  heroBanner: { backgroundColor: '#fff', border: '1px solid #e2e8f0', padding: '32px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' },
  bannerTag: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
  bannerBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)', fontSize: '14px' },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '14px', fontSize: '14px' },
  searchBox: { padding: '12px 16px 12px 40px', borderRadius: '12px', border: '1px solid #cbd5e1', width: '360px', fontSize: '14px', outline: 'none', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' },
  resultCount: { fontSize: '13px', color: '#64748b', fontWeight: '600' },
  customerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' },
  customerCard: { backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' },
  custCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  custName: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.3px' },
  phoneLink: { fontSize: '13px', color: '#0284c7', fontWeight: '600', textDecoration: 'none', display: 'inline-block', marginTop: '2px' },
  zonePill: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.3px' },
  addressLine: { fontSize: '13px', color: '#64748b', margin: '6px 0 16px 0', lineHeight: '1.4' },
  custActionRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  actionSubBtn: { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  actionDeleteBtn: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  machineSection: { borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: 'auto' },
  machineHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  machineTitle: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 },
  addMachineBtn: { backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0284c7', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  noMachineText: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: '4px 0' },
  assetContainer: { marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#f8fafc' },
  machineRow: { padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  nicknameBadge: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600' },
  serialSub: { fontSize: '11px', color: '#64748b', marginTop: '3px' },
  machineRowRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  gpdPill: { backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' },
  expandToggleBtn: { backgroundColor: '#e2e8f0', border: 'none', color: '#334155', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  visitBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  deleteAssetBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', width: '24px', height: '24px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  assetExpandedDrawer: { backgroundColor: '#fff', padding: '16px', borderTop: '1px solid #e2e8f0' },
  drawerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  drawerBox: { backgroundColor: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' },
  drawerBoxTitle: { fontWeight: '700', color: '#0f172a', display: 'block', marginBottom: '6px' },
  drawerText: { margin: '2px 0', color: '#475569' },
  drawerSubHeading: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '14px 0 8px 0' },
  emptyHistoryText: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: 0 },
  ticketHistoryRow: { backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', fontSize: '12px' },
  ticketNotes: { fontSize: '11px', color: '#64748b', margin: '3px 0 0 0' },
  ticketRowRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  amountCollected: { fontWeight: '700', color: '#0f172a', fontSize: '12px' },
  tagBadge: { backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: '#334155' },
  smallEditBtn: { backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  smallDeleteBtn: { backgroundColor: '#fee2e2', border: 'none', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  tableCard: { backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  tableHeaderContainer: { padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' },
  tableHeading: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' },
  th: { backgroundColor: '#f8fafc', padding: '14px 20px', color: '#475569', fontWeight: '700', borderBottom: '1px solid #e2e8f0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tr: { borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' },
  td: { padding: '14px 20px', color: '#334155' },
  tableDeleteBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  primaryBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' },
  cancelBtn: { backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalBox: { backgroundColor: '#fff', width: '100%', maxWidth: '500px', borderRadius: '20px', padding: '30px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' },
  modalCloseBtn: { background: 'transparent', border: 'none', fontSize: '16px', color: '#64748b', cursor: 'pointer', fontWeight: '700' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' },
  formLabel: { fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' },
  inputField: { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#f8fafc', transition: 'border-color 0.2s' },
  modalActionRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' },
  loadingBox: { textAlign: 'center', padding: '100px 0' },
  spinner: { width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #0284c7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px auto' },
  emptyState: { backgroundColor: '#fff', padding: '60px 20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0' }
}
