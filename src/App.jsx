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

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  
  // Editing States
  const [editingCustomer, setEditingCustomer] = useState(null)
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
      // Update existing
      const { error } = await supabase
        .from('customers')
        .update(newCust)
        .eq('id', editingCustomer.id)
      
      if (!error) {
        closeCustomerModal()
        fetchAllData()
      } else {
        alert('Error updating customer: ' + error.message)
      }
    } else {
      // Create new
      const { error } = await supabase.from('customers').insert([newCust])
      if (!error) {
        closeCustomerModal()
        fetchAllData()
      } else {
        alert('Error creating customer: ' + error.message)
      }
    }
  }

  async function handleDeleteCustomer(id) {
    if (!window.confirm('Are you sure you want to delete this customer and their linked records?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (!error) {
      fetchAllData()
    } else {
      alert('Error deleting customer: ' + error.message)
    }
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
    if (!error) {
      setShowAssetModal(false)
      fetchAllData()
    } else {
      alert('Error registering asset: ' + error.message)
    }
  }

  async function handleDeleteAsset(assetId) {
    if (!window.confirm('Are you sure you want to delete this machine asset?')) return
    const { error } = await supabase.from('assets').delete().eq('id', assetId)
    if (!error) {
      fetchAllData()
    } else {
      alert('Error deleting asset: ' + error.message)
    }
  }

  async function handleCreateTicket(e) {
    e.preventDefault()
    if (!selectedAssetForTicket) return
    const { error } = await supabase.from('service_tickets').insert([{
      ...newTicket,
      asset_id: selectedAssetForTicket.id,
      visit_date: new Date().toISOString()
    }])
    if (!error) {
      setShowTicketModal(false)
      fetchAllData()
    } else {
      alert('Error logging ticket: ' + error.message)
    }
  }

  async function handleDeleteTicket(ticketId) {
    if (!window.confirm('Are you sure you want to delete this service ticket?')) return
    const { error } = await supabase.from('service_tickets').delete().eq('id', ticketId)
    if (!error) {
      fetchAllData()
    } else {
      alert('Error deleting ticket: ' + error.message)
    }
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
            <span style={styles.brandSubtitle}>Asset CRM v2.5</span>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          <button 
            onClick={() => setActiveTab('dashboard')} 
            style={{...styles.sidebarBtn, ...(activeTab === 'dashboard' ? styles.activeSidebarBtn : {})}}
          >
            📊 Executive Overview
          </button>
          <button 
            onClick={() => setActiveTab('customers')} 
            style={{...styles.sidebarBtn, ...(activeTab === 'customers' ? styles.activeSidebarBtn : {})}}
          >
            👥 Customers & Machines
          </button>
          <button 
            onClick={() => setActiveTab('tickets')} 
            style={{...styles.sidebarBtn, ...(activeTab === 'tickets' ? styles.activeSidebarBtn : {})}}
          >
            🔧 Service & Unit Costs
          </button>
          <button 
            onClick={() => setActiveTab('ledger')} 
            style={{...styles.sidebarBtn, ...(activeTab === 'ledger' ? styles.activeSidebarBtn : {})}}
          >
            💳 Sales & EMI Ledger
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.connectionDot}></div>
          <span style={styles.connectionText}>Supabase Connected</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={styles.mainArea}>
        <header style={styles.topHeader}>
          <div>
            <h1 style={styles.pageTitle}>
              {activeTab === 'dashboard' && 'Executive Dashboard'}
              {activeTab === 'customers' && 'Customer & Asset Registry'}
              {activeTab === 'tickets' && 'Service Tickets & Technician Log'}
              {activeTab === 'ledger' && 'Sales & Financial Ledger'}
            </h1>
            <p style={styles.pageSub}>Real-time unit economics and hardware lifecycle tracking</p>
          </div>
          <div style={styles.headerActions}>
            <button onClick={() => setShowCustomerModal(true)} style={styles.primaryBtn}>
              + Add Customer
            </button>
          </div>
        </header>

        {loading ? (
          <div style={styles.loadingBox}>
            <div style={styles.spinner}></div>
            <p style={{ color: '#64748b', fontWeight: '500' }}>Loading relational ledger from Supabase...</p>
          </div>
        ) : (
          <div style={styles.contentBody}>
            {activeTab === 'dashboard' && (
              <div>
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Total Customers</span>
                    <span style={styles.statValue}>{customers.length}</span>
                    <span style={styles.statSub}>Active Accounts</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Purifier Units</span>
                    <span style={styles.statValue}>{totalAssetsCount}</span>
                    <span style={styles.statSub}>Tracked Hardware Assets</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>Service Visits</span>
                    <span style={styles.statValue}>{serviceTickets.length}</span>
                    <span style={styles.statSub}>Logged Maintenance Calls</span>
                  </div>
                </div>

                <div style={styles.quickStartCard}>
                  <h3>🚀 Welcome to your Asset-First Workflow</h3>
                  <p>Unlike standard CRMs, AquaGuru anchors every service call, warranty cycle, and financial installment directly to the individual water purification machine serial number.</p>
                  <button onClick={() => setActiveTab('customers')} style={styles.inlineActionBtn}>
                    View Customer Directory →
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div>
                <div style={styles.filterBar}>
                  <input 
                    type="text" 
                    placeholder="Search by customer name, phone, zone, or address..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.searchBox}
                  />
                  <span style={styles.resultCount}>Showing {filteredCustomers.length} clients</span>
                </div>

                {filteredCustomers.length === 0 ? (
                  <div style={styles.emptyState}>
                    <p>No customer records found. Click "+ Add Customer" in the top right to start.</p>
                  </div>
                ) : (
                  <div style={styles.customerGrid}>
                    {filteredCustomers.map(c => (
                      <div key={c.id} style={styles.customerCard}>
                        <div style={styles.custCardHeader}>
                          <div>
                            <h3 style={styles.custName}>{c.full_name}</h3>
                            <span style={styles.phoneTag}>📞 {c.primary_phone || 'N/A'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={styles.zonePill}>{c.area_zone || 'Zone 1'}</span>
                          </div>
                        </div>
                        <p style={styles.addressLine}>📍 {c.address || 'No address specified'}</p>

                        <div style={styles.custActionRow}>
                          <button onClick={() => openEditCustomer(c)} style={styles.editCustBtn}>Edit Customer</button>
                          <button onClick={() => handleDeleteCustomer(c.id)} style={styles.deleteCustBtn}>Delete</button>
                        </div>

                        <div style={styles.machineSection}>
                          <div style={styles.machineHeaderRow}>
                            <h4 style={styles.machineTitle}>Installed Hardware ({c.assets?.length || 0})</h4>
                            <button 
                              onClick={() => { setSelectedCustomerForAsset(c); setShowAssetModal(true); }}
                              style={styles.addMachineBtn}
                            >
                              + Add Machine
                            </button>
                          </div>

                          {c.assets?.length === 0 ? (
                            <p style={styles.noMachineText}>No purifier units registered.</p>
                          ) : (
                            c.assets?.map(asset => (
                              <div key={asset.id} style={styles.machineRow}>
                                <div>
                                  <strong>{asset.model_name}</strong>
                                  <div style={styles.serialSub}>S/N: {asset.serial_number || 'N/A'} | {asset.asset_category}</div>
                                </div>
                                <div style={styles.machineRowRight}>
                                  <span style={styles.gpdPill}>{asset.membrane_gpd}</span>
                                  <button 
                                    onClick={() => { setSelectedAssetForTicket(asset); setShowTicketModal(true); }}
                                    style={styles.visitBtn}
                                  >
                                    Log Visit
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteAsset(asset.id)}
                                    style={styles.deleteAssetBtn}
                                    title="Delete Machine"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tickets' && (
              <div>
                <div style={styles.tableCard}>
                  <h3 style={styles.tableHeading}>Service Visit Log & Unit Costs</h3>
                  {serviceTickets.length === 0 ? (
                    <p style={{ color: '#64748b', padding: '20px' }}>No service tickets recorded yet.</p>
                  ) : (
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Date</th>
                          <th style={styles.th}>Customer & Machine</th>
                          <th style={styles.th}>Coverage</th>
                          <th style={styles.th}>Reason</th>
                          <th style={styles.th}>Parts Cost</th>
                          <th style={styles.th}>Tech Fee</th>
                          <th style={styles.th}>Collected</th>
                          <th style={styles.th}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceTickets.map(t => (
                          <tr key={t.id} style={styles.tr}>
                            <td style={styles.td}>{new Date(t.visit_date).toLocaleDateString()}</td>
                            <td style={styles.td}>
                              <strong>{t.assets?.customers?.full_name || 'Customer'}</strong>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>{t.assets?.model_name}</div>
                            </td>
                            <td style={styles.td}><span style={styles.tagBadge}>{t.service_type_tag}</span></td>
                            <td style={styles.td}>{t.visit_reason}</td>
                            <td style={styles.td}>₹{t.internal_parts_cost || 0}</td>
                            <td style={styles.td}>₹{t.technician_payout_fee || 0}</td>
                            <td style={styles.td}><strong>₹{t.amount_collected_on_site || 0}</strong> ({t.payment_mode})</td>
                            <td style={styles.td}>
                              <button onClick={() => handleDeleteTicket(t.id)} style={styles.tableDeleteBtn}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ledger' && (
              <div style={styles.emptyState}>
                <h2>Sales & EMI Financial Ledger</h2>
                <p style={{ color: '#64748b', marginTop: '10px' }}>Track initial machine margins, down payments, and AMC balances per unit.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Add/Edit Customer */}
      {showCustomerModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3>{editingCustomer ? 'Edit Customer Account' : 'Add New Customer Account'}</h3>
            <form onSubmit={handleSaveCustomer} style={styles.formGrid}>
              <label style={styles.formLabel}>Full Name</label>
              <input type="text" required value={newCust.full_name} onChange={e => setNewCust({...newCust, full_name: e.target.value})} style={styles.inputField} />
              
              <label style={styles.formLabel}>Primary Phone</label>
              <input type="text" required value={newCust.primary_phone} onChange={e => setNewCust({...newCust, primary_phone: e.target.value})} style={styles.inputField} />

              <label style={styles.formLabel}>Installation Address</label>
              <textarea value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} style={{...styles.inputField, height: '70px'}} />

              <label style={styles.formLabel}>Area Zone / Location</label>
              <input type="text" value={newCust.area_zone} onChange={e => setNewCust({...newCust, area_zone: e.target.value})} style={styles.inputField} />

              <div style={styles.modalActionRow}>
                <button type="button" onClick={closeCustomerModal} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>{editingCustomer ? 'Update Customer' : 'Save Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Machine Asset */}
      {showAssetModal && selectedCustomerForAsset && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3>Register Water Purifier Asset</h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>For Client: <strong>{selectedCustomerForAsset.full_name}</strong></p>
            <form onSubmit={handleCreateAsset} style={styles.formGrid}>
              <label style={styles.formLabel}>Machine Location Tag</label>
              <input type="text" value={newAsset.asset_tag_nickname} onChange={e => setNewAsset({...newAsset, asset_tag_nickname: e.target.value})} style={styles.inputField} />

              <label style={styles.formLabel}>Category</label>
              <select value={newAsset.asset_category} onChange={e => setNewAsset({...newAsset, asset_category: e.target.value})} style={styles.inputField}>
                <option value="Domestic RO">Domestic RO</option>
                <option value="Commercial RO">Commercial RO</option>
                <option value="Industrial Plant">Industrial Plant</option>
                <option value="Water Softener">Water Softener</option>
              </select>

              <label style={styles.formLabel}>Model Name</label>
              <input type="text" required value={newAsset.model_name} onChange={e => setNewAsset({...newAsset, model_name: e.target.value})} style={styles.inputField} />

              <label style={styles.formLabel}>Serial Number</label>
              <input type="text" placeholder="S/N 94823924" value={newAsset.serial_number} onChange={e => setNewAsset({...newAsset, serial_number: e.target.value})} style={styles.inputField} />

              <label style={styles.formLabel}>Membrane Capacity</label>
              <input type="text" value={newAsset.membrane_gpd} onChange={e => setNewAsset({...newAsset, membrane_gpd: e.target.value})} style={styles.inputField} />

              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowAssetModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Machine</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Service Ticket */}
      {showTicketModal && selectedAssetForTicket && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3>Log Service Visit & Unit Costs</h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Machine: <strong>{selectedAssetForTicket.model_name}</strong></p>
            <form onSubmit={handleCreateTicket} style={styles.formGrid}>
              <label style={styles.formLabel}>Coverage Type</label>
              <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.inputField}>
                <option value="🟡 Warranty Service">🟡 Warranty Service (₹0 Bill)</option>
                <option value="🟢 AMC Service">🟢 AMC Service (₹0 Bill)</option>
                <option value="🔵 Paid On-Demand">🔵 Paid On-Demand Service</option>
              </select>

              <label style={styles.formLabel}>Visit Reason</label>
              <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.inputField} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.formLabel}>Parts Cost (₹)</label>
                  <input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.inputField} />
                </div>
                <div>
                  <label style={styles.formLabel}>Tech Fee (₹)</label>
                  <input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.inputField} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.formLabel}>Amount Collected (₹)</label>
                  <input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.inputField} />
                </div>
                <div>
                  <label style={styles.formLabel}>Payment Mode</label>
                  <select value={newTicket.payment_mode} onChange={e => setNewTicket({...newTicket, payment_mode: e.target.value})} style={styles.inputField}>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <label style={styles.formLabel}>Work Notes</label>
              <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.inputField, height: '60px'}} />

              <div style={styles.modalActionRow}>
                <button type="button" onClick={() => setShowTicketModal(false)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  layout: { display: 'flex', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f8fafc' },
  sidebar: { width: '260px', backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b' },
  brandContainer: { padding: '24px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #1e293b' },
  logoBadge: { width: '38px', height: '38px', backgroundColor: '#0284c7', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  brandTitle: { margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px' },
  brandSubtitle: { fontSize: '11px', color: '#94a3b8' },
  sidebarNav: { padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
  sidebarBtn: { width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#94a3b8', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' },
  activeSidebarBtn: { backgroundColor: '#0284c7', color: '#fff', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' },
  sidebarFooter: { padding: '16px 20px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '8px' },
  connectionDot: { width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' },
  connectionText: { fontSize: '12px', color: '#cbd5e1', fontWeight: '500' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' },
  topHeader: { padding: '24px 30px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' },
  pageTitle: { margin: 0, fontSize: '22px', fontWeight: '800', color: '#0f172a' },
  pageSub: { margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' },
  headerActions: { display: 'flex', gap: '10px' },
  contentBody: { padding: '30px', maxWidth: '1300px', width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '25px' },
  statCard: { backgroundColor: '#fff', padding: '20px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' },
  statLabel: { fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statValue: { fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '6px 0 2px 0' },
  statSub: { fontSize: '12px', color: '#94a3b8' },
  quickStartCard: { backgroundColor: '#fff', border: '1px solid #e2e8f0', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  inlineActionBtn: { marginTop: '15px', backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' },
  searchBox: { padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '320px', fontSize: '14px', outline: 'none', backgroundColor: '#fff' },
  resultCount: { fontSize: '13px', color: '#64748b', fontWeight: '600' },
  customerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' },
  customerCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  custCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  custName: { margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' },
  phoneTag: { fontSize: '13px', color: '#0284c7', fontWeight: '600' },
  zonePill: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' },
  addressLine: { fontSize: '13px', color: '#64748b', margin: '8px 0 12px 0' },
  custActionRow: { display: 'flex', gap: '8px', marginBottom: '14px' },
  editCustBtn: { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  deleteCustBtn: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  machineSection: { borderTop: '1px solid #f1f5f9', paddingTop: '12px' },
  machineHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  machineTitle: { fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', margin: 0 },
  addMachineBtn: { backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0284c7', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  noMachineText: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: '4px 0' },
  machineRow: { backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', fontSize: '13px' },
  serialSub: { fontSize: '11px', color: '#64748b', marginTop: '2px' },
  machineRowRight: { display: 'flex', alignItems: 'center', gap: '6px' },
  gpdPill: { backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  visitBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  deleteAssetBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', width: '22px', height: '22px', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tableCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  tableHeading: { padding: '20px', margin: 0, fontSize: '16px', fontWeight: '700', borderBottom: '1px solid #e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' },
  th: { backgroundColor: '#f8fafc', padding: '12px 16px', color: '#475569', fontWeight: '700', borderBottom: '1px solid #e2e8f0' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '12px 16px', color: '#334155' },
  tagBadge: { backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' },
  tableDeleteBtn: { background: '#fee2e2', color: '#dc2626', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  primaryBtn: { backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)' },
  cancelBtn: { backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalBox: { backgroundColor: '#fff', width: '100%', maxWidth: '480px', borderRadius: '16px', padding: '25px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' },
  formLabel: { fontSize: '12px', fontWeight: '700', color: '#475569' },
  inputField: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' },
  modalActionRow: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' },
  loadingBox: { textAlign: 'center', padding: '80px 0' },
  spinner: { width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTop: '3px solid #0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' },
  emptyState: { backgroundColor: '#fff', padding: '50px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }
}
