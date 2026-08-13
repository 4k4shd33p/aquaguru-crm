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
  const [expandedAssets, setExpandedAssets] = useState({})

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showEditTicketModal, setShowEditTicketModal] = useState(false)
  
  // Editing & Selection States
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [editingTicket, setEditingTicket] = useState(null)
  const [selectedCustomerForAsset, setSelectedCustomerForAsset] = useState(null)
  const [selectedAssetForTicket, setSelectedAssetForTicket] = useState(null)

  // Form States (With Custom Metadata JSONB Support for Dropdowns & Dates)
  const [newCust, setNewCust] = useState({ 
    full_name: '', 
    primary_phone: '', 
    address: '', 
    area_zone: 'Zone 1 - Central', 
    customer_type: 'Residential',
    custom_metadata: {
      water_source: 'Borewell',
      installation_date: '',
      service_frequency: 'Monthly'
    }
  })

  const [newAsset, setNewAsset] = useState({ asset_tag_nickname: 'Main Kitchen Unit', asset_category: 'Domestic RO', model_name: 'AquaGuard Elite Pro', serial_number: '', membrane_gpd: '100 GPD' })
  const [newTicket, setNewTicket] = useState({ visit_reason: 'Quarterly Servicing', service_type_tag: '🟢 AMC Enrolled', work_performed_notes: 'Sanitized storage tank, replaced sediment filter cartridge.', internal_parts_cost: '0', technician_payout_fee: '300', amount_collected_on_site: '0', payment_mode: 'UPI' })

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
    
    const customerPayload = {
      full_name: newCust.full_name,
      primary_phone: newCust.primary_phone,
      address: newCust.address,
      area_zone: newCust.area_zone,
      customer_type: newCust.customer_type,
      custom_metadata: newCust.custom_metadata // Syncs all custom dates & dropdowns seamlessly
    }

    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(customerPayload).eq('id', editingCustomer.id)
      if (!error) { closeCustomerModal(); fetchAllData(); } else { alert('Error updating client: ' + error.message); }
    } else {
      const { error } = await supabase.from('customers').insert([customerPayload])
      if (!error) { closeCustomerModal(); fetchAllData(); } else { alert('Error creating client: ' + error.message); }
    }
  }

  async function handleDeleteCustomer(id) {
    if (!window.confirm('Revoke this client profile and erase linked hardware history?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (!error) fetchAllData(); else alert('Error deleting client: ' + error.message)
  }

  function openEditCustomer(cust) {
    setEditingCustomer(cust)
    setNewCust({
      full_name: cust.full_name || '',
      primary_phone: cust.primary_phone || '',
      address: cust.address || '',
      area_zone: cust.area_zone || 'Zone 1 - Central',
      customer_type: cust.customer_type || 'Residential',
      custom_metadata: cust.custom_metadata || {
        water_source: 'Borewell',
        installation_date: '',
        service_frequency: 'Monthly'
      }
    })
    setShowCustomerModal(true)
  }

  function closeCustomerModal() {
    setShowCustomerModal(false)
    setEditingCustomer(null)
    setNewCust({ 
      full_name: '', 
      primary_phone: '', 
      address: '', 
      area_zone: 'Zone 1 - Central', 
      customer_type: 'Residential',
      custom_metadata: {
        water_source: 'Borewell',
        installation_date: '',
        service_frequency: 'Monthly'
      }
    })
  }

  async function handleCreateAsset(e) {
    e.preventDefault()
    if (!selectedCustomerForAsset) return
    const { error } = await supabase.from('assets').insert([{
      ...newAsset,
      customer_id: selectedCustomerForAsset.id,
      installation_date: new Date().toISOString().split('T')[0]
    }])
    if (!error) { setShowAssetModal(false); fetchAllData(); } else { alert('Error deploying asset: ' + error.message); }
  }

  async function handleDeleteAsset(assetId) {
    if (!window.confirm('Decommission this purifier node?')) return
    const { error } = await supabase.from('assets').delete().eq('id', assetId)
    if (!error) fetchAllData(); else alert('Error removing asset: ' + error.message)
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
    if (!window.confirm('Erase this field service record?')) return
    const { error } = await supabase.from('service_tickets').delete().eq('id', ticketId)
    if (!error) fetchAllData(); else alert('Error deleting ticket: ' + error.message)
  }

  function openEditTicket(t) {
    setEditingTicket(t)
    setNewTicket({
      visit_reason: t.visit_reason || '',
      service_type_tag: t.service_type_tag || '🟢 AMC Enrolled',
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
  const totalCollections = serviceTickets.reduce((acc, t) => acc + Number(t.amount_collected_on_site || 0), 0)

  return (
    <div style={styles.layout}>
      {/* Sleek Obsidian Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.brandContainer}>
          <div style={styles.logoBadge}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          </div>
          <div>
            <h2 style={styles.brandTitle}>AquaGuru <span style={{ color: '#38bdf8' }}>2026</span></h2>
            <span style={styles.brandSubtitle}>Autonomous CRM Core</span>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          <button onClick={() => setActiveTab('dashboard')} style={{...styles.sidebarBtn, ...(activeTab === 'dashboard' ? styles.activeSidebarBtn : {})}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
            Dashboard
          </button>
          <button onClick={() => setActiveTab('customers')} style={{...styles.sidebarBtn, ...(activeTab === 'customers' ? styles.activeSidebarBtn : {})}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Clients & Hardware
          </button>
          <button onClick={() => setActiveTab('tickets')} style={{...styles.sidebarBtn, ...(activeTab === 'tickets' ? styles.activeSidebarBtn : {})}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Service Dispatch
          </button>
          <button onClick={() => setActiveTab('ledger')} style={{...styles.sidebarBtn, ...(activeTab === 'ledger' ? styles.activeSidebarBtn : {})}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Revenue Ledger
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.connectionPulse}></div>
          <span style={styles.connectionText}>Supabase Telemetry Live</span>
        </div>
      </aside>

      {/* Main Workspace */}
      <main style={styles.mainArea}>
        <header style={styles.topHeader}>
          <div>
            <h1 style={styles.pageTitle}>
              {activeTab === 'dashboard' && 'Executive Performance Overview'}
              {activeTab === 'customers' && 'Client Directory & Water Infrastructure'}
              {activeTab === 'tickets' && 'Field Operations & Service Telemetry'}
              {activeTab === 'ledger' && 'Financial Ledger & Collections'}
            </h1>
            <p style={styles.pageSub}>Next-generation purification asset & client lifecycle management</p>
          </div>
          <button onClick={() => setShowCustomerModal(true)} style={styles.primaryNeonBtn}>
            <span style={{ fontSize: '18px', lineHeight: 0 }}>+</span> New Client Account
          </button>
        </header>

        {loading ? (
          <div style={styles.loadingBox}>
            <div style={styles.quantumSpinner}></div>
            <p style={{ color: '#94a3b8', fontWeight: '500', fontSize: '14px', letterSpacing: '0.5px' }}>SYNCING SECURE CLOUD NODES...</p>
          </div>
        ) : (
          <div style={styles.contentBody}>
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <div style={styles.statIconBox}>👥</div>
                    <div>
                      <span style={styles.statLabel}>Active Accounts</span>
                      <div style={styles.statValue}>{customers.length}</div>
                      <span style={styles.statSub}>Verified client records</span>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{...styles.statIconBox, background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8'}}>💧</div>
                    <div>
                      <span style={styles.statLabel}>Deployed Units</span>
                      <div style={styles.statValue}>{totalAssetsCount}</div>
                      <span style={styles.statSub}>Active RO/Softener nodes</span>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={{...styles.statIconBox, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e'}}>₹</div>
                    <div>
                      <span style={styles.statLabel}>Field Collections</span>
                      <div style={styles.statValue}>₹{totalCollections.toLocaleString()}</div>
                      <span style={styles.statSub}>Total on-site revenue logged</span>
                    </div>
                  </div>
                </div>

                <div style={styles.heroGlassCard}>
                  <div style={{ maxWidth: '640px' }}>
                    <span style={styles.bannerTag}>Autonomous Operations 2026</span>
                    <h2 style={{ margin: '10px 0 12px 0', fontSize: '22px', color: '#fff', fontWeight: '700', letterSpacing: '-0.3px' }}>Enterprise Water Purification Grid</h2>
                    <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: '1.7' }}>
                      Your field service network is synchronized. Manage multi-stage domestic and commercial RO machines, track automated AMC coverage intervals, and dispatch maintenance engineers seamlessly.
                    </p>
                  </div>
                  <button onClick={() => setActiveTab('customers')} style={styles.bannerActionBtn}>
                    Launch Client Directory →
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div>
                <div style={styles.filterBar}>
                  <div style={styles.searchWrapper}>
                    <svg style={styles.searchIconSvg} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input 
                      type="text" 
                      placeholder="Instant search by name, mobile number, zone, or address..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={styles.searchBox}
                    />
                  </div>
                  <span style={styles.resultCountBadge}>{filteredCustomers.length} Active Records Filtered</span>
                </div>

                {filteredCustomers.length === 0 ? (
                  <div style={styles.emptyGlassState}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                    <h3 style={{ margin: '0 0 6px 0', color: '#fff', fontSize: '18px' }}>No matching accounts found</h3>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>Initialize a new customer profile using the action button above.</p>
                  </div>
                ) : (
                  <div style={styles.customerGrid}>
                    {filteredCustomers.map(c => (
                      <div key={c.id} style={styles.customerCard}>
                        <div style={styles.custCardHeader}>
                          <div>
                            <h3 style={styles.custName}>{c.full_name}</h3>
                            <a href={`tel:${c.primary_phone}`} style={styles.phoneLink}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                              {c.primary_phone || 'No Phone Registered'}
                            </a>
                          </div>
                          <span style={styles.zonePill}>{c.area_zone || 'Zone 1'}</span>
                        </div>
                        <p style={styles.addressLine}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-1px' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {c.address || 'No address specified'}
                        </p>

                        {/* Display Custom Fields from JSONB metadata if available */}
                        {c.custom_metadata && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            {c.custom_metadata.water_source && (
                              <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                Water: {c.custom_metadata.water_source}
                              </span>
                            )}
                            {c.custom_metadata.installation_date && (
                              <span style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                Installed: {c.custom_metadata.installation_date}
                              </span>
                            )}
                            {c.custom_metadata.service_frequency && (
                              <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                Freq: {c.custom_metadata.service_frequency}
                              </span>
                            )}
                          </div>
                        )}

                        <div style={styles.custActionRow}>
                          <button onClick={() => openEditCustomer(c)} style={styles.actionSubBtn}>Edit Profile</button>
                          <button onClick={() => handleDeleteCustomer(c.id)} style={styles.actionDeleteBtn}>Delete Client</button>
                        </div>

                        {/* INSTALLED MACHINES */}
                        <div style={styles.machineSection}>
                          <div style={styles.machineHeaderRow}>
                            <h4 style={styles.machineTitle}>Registered Hardware ({c.assets?.length || 0})</h4>
                            <button onClick={() => { setSelectedCustomerForAsset(c); setShowAssetModal(true); }} style={styles.addMachineBtn}>
                              + Deploy Machine
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
                                        <strong style={{ color: '#fff', fontSize: '13px' }}>{asset.model_name}</strong>
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
                                      <button onClick={() => handleDeleteAsset(asset.id)} style={styles.deleteAssetBtn} title="Decommission Asset">
                                        ✕
                                      </button>
                                    </div>
                                  </div>

                                  {/* EXPANDABLE ASSET DETAILS & HISTORY */}
                                  {isExpanded && (
                                    <div style={styles.assetExpandedDrawer}>
                                      <div style={styles.drawerGrid}>
                                        <div style={styles.drawerBox}>
                                          <span style={styles.drawerBoxTitle}>💳 Hardware Telemetry</span>
                                          <p style={styles.drawerText}>Category: {asset.asset_category}</p>
                                          <p style={styles.drawerText}>Warranty Status: Standard 1-Yr Active</p>
                                        </div>
                                        <div style={styles.drawerBox}>
                                          <span style={styles.drawerBoxTitle}>🛡️ AMC Maintenance Plan</span>
                                          {activeAMC ? (
                                            <p style={{ ...styles.drawerText, color: '#4ade80', fontWeight: '600' }}>Active AMC Contract Enrolled</p>
                                          ) : (
                                            <p style={{ ...styles.drawerText, color: '#f59e0b', fontStyle: 'italic' }}>No AMC Plan Enrolled</p>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ marginTop: '14px' }}>
                                        <h5 style={styles.drawerSubHeading}>Chronological Service Log</h5>
                                        {machineTickets.length === 0 ? (
                                          <p style={styles.emptyHistoryText}>No maintenance logs recorded for this machine.</p>
                                        ) : (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {machineTickets.map(t => (
                                              <div key={t.id} style={styles.ticketHistoryRow}>
                                                <div>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={styles.tagBadge}>{t.service_type_tag}</span>
                                                    <strong style={{ fontSize: '12px', color: '#fff' }}>{t.visit_reason}</strong>
                                                  </div>
                                                  <p style={styles.ticketNotes}>{t.work_performed_notes} (Parts: ₹{t.internal_parts_cost} | Payout: ₹{t.technician_payout_fee})</p>
                                                </div>
                                                <div style={styles.ticketRowRight}>
                                                  <span style={styles.amountCollected}>₹{t.amount_collected_on_site} <small style={{ color: '#94a3b8' }}>({t.payment_mode})</small></span>
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
              <div style={styles.tableGlassCard}>
                <div style={styles.tableHeaderContainer}>
                  <h3 style={styles.tableHeading}>Master Field Service Log</h3>
                  <span style={styles.resultCountBadge}>{serviceTickets.length} Dispatch Records</span>
                </div>
                {serviceTickets.length === 0 ? (
                  <div style={styles.emptyGlassState}><p style={{ color: '#94a3b8' }}>No service tickets recorded in system.</p></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Timestamp</th>
                          <th style={styles.th}>Client & Purifier Unit</th>
                          <th style={styles.th}>Coverage Tier</th>
                          <th style={styles.th}>Visit Reason & Field Notes</th>
                          <th style={styles.th}>Site Collection</th>
                          <th style={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceTickets.map(t => (
                          <tr key={t.id} style={styles.tr}>
                            <td style={styles.td}>{new Date(t.visit_date).toLocaleDateString()}</td>
                            <td style={styles.td}>
                              <strong style={{ color: '#fff' }}>{t.assets?.customers?.full_name || 'Client'}</strong>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.assets?.model_name}</div>
                            </td>
                            <td style={styles.td}><span style={styles.tagBadge}>{t.service_type_tag}</span></td>
                            <td style={styles.td}>
                              <strong style={{ color: '#e2e8f0' }}>{t.visit_reason}</strong>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{t.work_performed_notes}</div>
                            </td>
                            <td style={styles.td}>
                              <strong style={{ color: '#4ade80' }}>₹{t.amount_collected_on_site || 0}</strong> 
                              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>({t.payment_mode})</span>
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
              <div style={styles.emptyGlassState}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
                <h3 style={{ color: '#fff', fontSize: '18px' }}>Executive Revenue Ledger</h3>
                <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '13px' }}>Monitor initial hardware margins, down payments, and AMC renewal installments in real time.</p>
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
              <h3 style={styles.modalTitle}>{editingCustomer ? 'Edit Client Profile' : 'New Client Registration'}</h3>
              <button onClick={closeCustomerModal} style={styles.modalCloseBtn}>✕</button>
            </div>
            <form onSubmit={handleSaveCustomer} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Full Client Name</label>
                <input type="text" required value={newCust.full_name} onChange={e => setNewCust({...newCust, full_name: e.target.value})} style={styles.inputField} placeholder="e.g. Anand Sharma" />
              </div>
              <div>
                <label style={styles.formLabel}>Primary Mobile Number</label>
                <input type="text" required value={newCust.primary_phone} onChange={e => setNewCust({...newCust, primary_phone: e.target.value})} style={styles.inputField} placeholder="98432XXXXX" />
              </div>
              <div>
                <label style={styles.formLabel}>Installation Site Address</label>
                <textarea value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} style={{...styles.inputField, height: '60px', resize: 'none'}} placeholder="Apartment name, street, landmark..." />
              </div>
              <div>
                <label style={styles.formLabel}>Assigned Area Zone</label>
                <input type="text" value={newCust.area_zone} onChange={e => setNewCust({...newCust, area_zone: e.target.value})} style={styles.inputField} placeholder="Zone 1 - Central" />
              </div>

              {/* DYNAMIC CUSTOMIZATION FIELDS (Dates & Dropdowns) */}
              <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Custom Fields & Metadata</span>
                
                <div>
                  <label style={styles.formLabel}>Water Source (Dropdown)</label>
                  <select 
                    value={newCust.custom_metadata?.water_source || 'Borewell'} 
                    onChange={e => setNewCust({
                      ...newCust, 
                      custom_metadata: { ...newCust.custom_metadata, water_source: e.target.value }
                    })} 
                    style={styles.inputField}
                  >
                    <option value="Borewell">Borewell</option>
                    <option value="Municipal">Municipal</option>
                    <option value="Tanker">Tanker</option>
                    <option value="RO Plant">RO Plant</option>
                  </select>
                </div>

                <div>
                  <label style={styles.formLabel}>Installation Date</label>
                  <input 
                    type="date" 
                    value={newCust.custom_metadata?.installation_date || ''} 
                    onChange={e => setNewCust({
                      ...newCust, 
                      custom_metadata: { ...newCust.custom_metadata, installation_date: e.target.value }
                    })} 
                    style={styles.inputField} 
                  />
                </div>

                <div>
                  <label style={styles.formLabel}>Service Frequency</label>
                  <select 
                    value={newCust.custom_metadata?.service_frequency || 'Monthly'} 
                    onChange={e => setNewCust({
                      ...newCust, 
                      custom_metadata: { ...newCust.custom_metadata, service_frequency: e.target.value }
                    })} 
                    style={styles.inputField}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Half-Yearly">Half-Yearly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div style={styles.modalActionRow}>
                <button type="button" onClick={closeCustomerModal} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryNeonBtn}>{editingCustomer ? 'Save Changes' : 'Initialize Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssetModal && selectedCustomerForAsset && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Deploy Purifier Hardware</h3>
              <button onClick={() => setShowAssetModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 14px 0' }}>Client Account: <strong style={{ color: '#fff' }}>{selectedCustomerForAsset.full_name}</strong></p>
            <form onSubmit={handleCreateAsset} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Asset Nickname Tag</label>
                <input type="text" value={newAsset.asset_tag_nickname} onChange={e => setNewAsset({...newAsset, asset_tag_nickname: e.target.value})} style={styles.inputField} />
              </div>
              <div>
                <label style={styles.formLabel}>Machine Category</label>
                <select value={newAsset.asset_category} onChange={e => setNewAsset({...newAsset, asset_category: e.target.value})} style={styles.inputField}>
                  <option value="Domestic RO">Domestic RO</option>
                  <option value="Commercial RO">Commercial RO</option>
                  <option value="Industrial Plant">Industrial Plant</option>
                  <option value="Water Softener">Water Softener</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Model Specification</label>
                <input type="text" required value={newAsset.model_name} onChange={e => setNewAsset({...newAsset, model_name: e.target.value})} style={styles.inputField} placeholder="AquaGuard Elite Pro" />
              </div>
              <div>
                <label style={styles.formLabel}>Serial Number (S/N)</label>
                <input type="text" value={newAsset.serial_number} onChange={e => setNewAsset({...newAsset, serial_number: e.target.value})} style={styles.inputField} placeholder="SN-948239" />
              </div>
              <div>
                <label style={styles.formLabel}>Membrane Capacity</label>
                <input type="text" value={newAsset.membrane_gpd} onChange={e => setNewAsset({...newAsset, membrane_gpd: e.target.value})} style={styles.inputField} placeholder="100 GPD" />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowAssetModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryNeonBtn}>Deploy Unit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTicketModal && selectedAssetForTicket && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Log Field Service Visit</h3>
              <button onClick={() => setShowTicketModal(false)} style={styles.modalCloseBtn}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 14px 0' }}>Machine: <strong style={{ color: '#fff' }}>{selectedAssetForTicket.model_name}</strong></p>
            <form onSubmit={handleCreateTicket} style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Coverage Tier</label>
                <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.inputField}>
                  <option value="🟡 Warranty Service">🟡 Warranty Service</option>
                  <option value="🟢 AMC Enrolled">🟢 AMC Enrolled</option>
                  <option value="🔵 Paid On-Demand">🔵 Paid On-Demand</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Visit Reason</label>
                <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.inputField} placeholder="Quarterly Servicing / Filter Replacement" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Parts Cost (₹)</label><input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.inputField} /></div>
                <div><label style={styles.formLabel}>Tech Payout (₹)</label><input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.inputField} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Site Collection (₹)</label><input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.inputField} /></div>
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
                <label style={styles.formLabel}>Field Service Notes</label>
                <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.inputField, height: '60px', resize: 'none'}} />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowTicketModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryNeonBtn}>Save Visit Record</button>
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
                <label style={styles.formLabel}>Coverage Tier</label>
                <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.inputField}>
                  <option value="🟡 Warranty Service">🟡 Warranty Service</option>
                  <option value="🟢 AMC Enrolled">🟢 AMC Enrolled</option>
                  <option value="🔵 Paid On-Demand">🔵 Paid On-Demand</option>
                </select>
              </div>
              <div>
                <label style={styles.formLabel}>Visit Reason</label>
                <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.inputField} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Parts Cost (₹)</label><input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.inputField} /></div>
                <div><label style={styles.formLabel}>Tech Payout (₹)</label><input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.inputField} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={styles.formLabel}>Site Collection (₹)</label><input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.inputField} /></div>
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
                <label style={styles.formLabel}>Field Service Notes</label>
                <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.inputField, height: '60px', resize: 'none'}} />
              </div>
              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowEditTicketModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryNeonBtn}>Update Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', backgroundColor: '#030712', color: '#f8fafc' },
  sidebar: { width: '270px', backgroundColor: '#090d16', color: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  brandContainer: { padding: '26px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  logoBadge: { width: '42px', height: '42px', background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 20px rgba(14, 165, 233, 0.35)' },
  brandTitle: { margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px', color: '#fff' },
  brandSubtitle: { fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  sidebarNav: { padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 },
  sidebarBtn: { width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#94a3b8', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' },
  activeSidebarBtn: { backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)', boxShadow: '0 4px 16px rgba(14, 165, 233, 0.15)' },
  sidebarFooter: { padding: '18px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '10px' },
  connectionPulse: { width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%', boxShadow: '0 0 10px rgba(34, 197, 94, 0.8)' },
  connectionText: { fontSize: '11.5px', color: '#94a3b8', fontWeight: '600' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', backgroundColor: '#030712' },
  topHeader: { padding: '28px 36px', backgroundColor: 'rgba(9, 13, 22, 0.75)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', position: 'sticky', top: 0, zIndex: 10 },
  pageTitle: { margin: 0, fontSize: '22px', fontWeight: '800', color: '#fff', letterSpacing: '-0.4px' },
  pageSub: { margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' },
  contentBody: { padding: '36px', maxWidth: '1440px', width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' },
  statCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '24px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
  statIconBox: { width: '48px', height: '48px', backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', border: '1px solid rgba(14, 165, 233, 0.2)' },
  statLabel: { fontSize: '11.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' },
  statValue: { fontSize: '28px', fontWeight: '800', color: '#fff', margin: '4px 0 2px 0', letterSpacing: '-0.5px' },
  statSub: { fontSize: '11.5px', color: '#64748b' },
  heroGlassCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '36px', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.95) 100%)' },
  bannerTag: { backgroundColor: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', border: '1px solid rgba(14, 165, 233, 0.3)' },
  bannerActionBtn: { backgroundColor: '#0ea5e9', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 8px 20px rgba(14, 165, 233, 0.35)', fontSize: '13.5px', transition: 'transform 0.2s' },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' },
  searchWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIconSvg: { position: 'absolute', left: '16px', color: '#64748b' },
  searchBox: { padding: '12px 16px 12px 44px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.1)', width: '380px', fontSize: '13.5px', outline: 'none', backgroundColor: 'rgba(15, 23, 42, 0.6)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  resultCountBadge: { fontSize: '12px', color: '#94a3b8', fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' },
  customerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '22px' },
  customerCard: { backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '26px', boxShadow: '0 12px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
  custCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  custName: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#fff', letterSpacing: '-0.3px' },
  phoneLink: { fontSize: '12.5px', color: '#38bdf8', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px' },
  zonePill: { backgroundColor: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.4px', border: '1px solid rgba(14, 165, 233, 0.3)' },
  addressLine: { fontSize: '13px', color: '#94a3b8', margin: '8px 0 16px 0', lineHeight: '1.4' },
  custActionRow: { display: 'flex', gap: '8px', marginBottom: '18px' },
  actionSubBtn: { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  actionDeleteBtn: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  machineSection: { borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', marginTop: 'auto' },
  machineHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  machineTitle: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 },
  addMachineBtn: { backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#38bdf8', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  noMachineText: { fontSize: '12px', color: '#64748b', fontStyle: 'italic', margin: '4px 0' },
  assetContainer: { marginBottom: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', overflow: 'hidden', backgroundColor: 'rgba(9, 13, 22, 0.5)' },
  machineRow: { padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  nicknameBadge: { backgroundColor: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', border: '1px solid rgba(14, 165, 233, 0.2)' },
  serialSub: { fontSize: '11px', color: '#64748b', marginTop: '3px' },
  machineRowRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  gpdPill: { backgroundColor: 'rgba(34, 197, 94, 0.12)', color: '#4ade80', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', border: '1px solid rgba(34, 197, 94, 0.25)' },
  expandToggleBtn: { backgroundColor: 'rgba(255, 255, 255, 0.06)', border: 'none', color: '#cbd5e1', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  visitBtn: { backgroundColor: '#0ea5e9', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)' },
  deleteAssetBtn: { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'none', width: '24px', height: '24px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  assetExpandedDrawer: { backgroundColor: 'rgba(15, 23, 42, 0.8)', padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' },
  drawerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  drawerBox: { backgroundColor: 'rgba(9, 13, 22, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '12px' },
  drawerBoxTitle: { fontWeight: '700', color: '#fff', display: 'block', marginBottom: '6px' },
  drawerText: { margin: '2px 0', color: '#94a3b8' },
  drawerSubHeading: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '14px 0 8px 0' },
  emptyHistoryText: { fontSize: '12px', color: '#64748b', fontStyle: 'italic', margin: 0 },
  ticketHistoryRow: { backgroundColor: 'rgba(9, 13, 22, 0.6)', padding: '10px 12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '12px' },
  ticketNotes: { fontSize: '11px', color: '#94a3b8', margin: '3px 0 0 0' },
  ticketRowRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  amountCollected: { fontWeight: '700', color: '#4ade80', fontSize: '12px' },
  tagBadge: { backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: '#cbd5e1' },
  smallEditBtn: { backgroundColor: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  smallDeleteBtn: { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#f87171', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  tableGlassCard: { backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.2)' },
  tableHeaderContainer: { padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
  tableHeading: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' },
  th: { backgroundColor: 'rgba(9, 13, 22, 0.8)', padding: '14px 24px', color: '#94a3b8', fontWeight: '700', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.8px' },
  tr: { borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background-color 0.15s ease' },
  td: { padding: '14px 24px', color: '#cbd5e1' },
  tableDeleteBtn: { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  primaryNeonBtn: { backgroundColor: '#0ea5e9', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 8px 24px rgba(14, 165, 233, 0.35)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' },
  cancelBtn: { backgroundColor: 'rgba(255, 255, 255, 0.06)', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '10px 18px', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', fontSize: '13.5px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(3, 7, 18, 0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalBox: { backgroundColor: '#090d16', width: '100%', maxWidth: '500px', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  modalTitle: { margin: 0, fontSize: '18px', fontWeight: '800', color: '#fff', letterSpacing: '-0.3px' },
  modalCloseBtn: { background: 'transparent', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer', fontWeight: '700' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' },
  formLabel: { fontSize: '11.5px', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.8px' },
  inputField: { width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', backgroundColor: 'rgba(15, 23, 42, 0.8)', color: '#fff', transition: 'border-color 0.2s' },
  modalActionRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' },
  loadingBox: { textAlign: 'center', padding: '120px 0' },
  quantumSpinner: { width: '42px', height: '42px', border: '3px solid rgba(255,255,255,0.08)', borderTop: '3px solid #0ea5e9', borderRadius: '50%', animation: 'spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite', margin: '0 auto 16px auto' },
  emptyGlassState: { backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '60px 20px', borderRadius: '20px', textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.08)' }
}
