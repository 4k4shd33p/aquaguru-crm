import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [activeTab, setActiveTab] = useState('customers')
  const [customers, setCustomers] = useState([])
  const [serviceTickets, setServiceTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal States
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [selectedCustomerForAsset, setSelectedCustomerForAsset] = useState(null)
  const [selectedAssetForTicket, setSelectedAssetForTicket] = useState(null)

  // Form States
  const [newCust, setNewCust] = useState({ full_name: '', primary_phone: '', address: '', area_zone: '', customer_type: 'Residential' })
  const [newAsset, setNewAsset] = useState({ asset_tag_nickname: '', asset_category: 'Domestic RO', model_name: '', serial_number: '', membrane_gpd: '100 GPD', initial_tds_inlet: '', initial_tds_outlet: '' })
  const [newTicket, setNewTicket] = useState({ visit_reason: 'Scheduled Check', service_type_tag: '🟢 AMC Service', work_performed_notes: '', tds_inlet_reading: '', tds_outlet_reading: '', internal_parts_cost: '0', technician_payout_fee: '200', final_amount_billed: '0', amount_collected_on_site: '0', payment_mode: 'UPI' })

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

  async function handleCreateCustomer(e) {
    e.preventDefault()
    const { error } = await supabase.from('customers').insert([newCust])
    if (!error) {
      setShowCustomerModal(false)
      setNewCust({ full_name: '', primary_phone: '', address: '', area_zone: '', customer_type: 'Residential' })
      fetchAllData()
    } else {
      alert('Error creating customer: ' + error.message)
    }
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
      setNewAsset({ asset_tag_nickname: '', asset_category: 'Domestic RO', model_name: '', serial_number: '', membrane_gpd: '100 GPD', initial_tds_inlet: '', initial_tds_outlet: '' })
      fetchAllData()
    } else {
      alert('Error registering asset: ' + error.message)
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
      setNewTicket({ visit_reason: 'Scheduled Check', service_type_tag: '🟢 AMC Service', work_performed_notes: '', tds_inlet_reading: '', tds_outlet_reading: '', internal_parts_cost: '0', technician_payout_fee: '200', final_amount_billed: '0', amount_collected_on_site: '0', payment_mode: 'UPI' })
      fetchAllData()
    } else {
      alert('Error logging ticket: ' + error.message)
    }
  }

  const filteredCustomers = customers.filter(c => 
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.primary_phone?.includes(searchQuery) ||
    c.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.area_zone?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate high-level stats
  const totalAssetsCount = customers.reduce((acc, c) => acc + (c.assets?.length || 0), 0)
  const totalTicketsCount = serviceTickets.length

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>AquaGuru CRM</h1>
          <p style={styles.subtitle}>Asset-Based Water Purification Management & Unit Economics</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => setShowCustomerModal(true)} style={styles.primaryBtn}>
            + Add Customer
          </button>
        </div>
      </header>

      {/* Metric Cards Banner */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Customers</span>
          <span style={styles.statValue}>{customers.length}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Active Purifier Assets</span>
          <span style={styles.statValue}>{totalAssetsCount}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Logged Service Visits</span>
          <span style={styles.statValue}>{totalTicketsCount}</span>
        </div>
      </div>

      <div style={styles.navBar}>
        <button 
          onClick={() => setActiveTab('customers')} 
          style={{...styles.navBtn, ...(activeTab === 'customers' ? styles.activeNavBtn : {})}}
        >
          👥 Customers & Assets
        </button>
        <button 
          onClick={() => setActiveTab('tickets')} 
          style={{...styles.navBtn, ...(activeTab === 'tickets' ? styles.activeNavBtn : {})}}
        >
          🔧 Service Tickets & Unit Costs
        </button>
        <button 
          onClick={() => setActiveTab('ledger')} 
          style={{...styles.navBtn, ...(activeTab === 'ledger' ? styles.activeNavBtn : {})}}
        >
          💳 Sales & EMIs
        </button>
      </div>

      {loading ? (
        <div style={styles.loadingState}>
          <div style={styles.spinner}></div>
          <p>Syncing relational database from Supabase...</p>
        </div>
      ) : (
        <main style={styles.mainContent}>
          {activeTab === 'customers' && (
            <div>
              <div style={styles.sectionHeader}>
                <h2>Customer Accounts & Hardware Registry</h2>
                <input 
                  type="text" 
                  placeholder="Search name, phone, address, or zone..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
              </div>

              {filteredCustomers.length === 0 ? (
                <div style={styles.emptyCard}>
                  <p>No customer records found. Click "+ Add Customer" above to begin building your database.</p>
                </div>
              ) : (
                <div style={styles.grid}>
                  {filteredCustomers.map((c) => (
                    <div key={c.id} style={styles.card}>
                      <div style={styles.cardHeader}>
                        <div>
                          <h3 style={styles.customerName}>{c.full_name}</h3>
                          <span style={styles.phoneBadge}>📞 {c.primary_phone || 'No Phone'}</span>
                        </div>
                        <span style={styles.zoneTag}>{c.area_zone || 'Zone 1'}</span>
                      </div>
                      
                      <p style={styles.addressText}>📍 {c.address || 'No Address Provided'}</p>
                      
                      <div style={styles.assetsSection}>
                        <div style={styles.assetHeaderRow}>
                          <h4 style={styles.assetsTitle}>Installed Machines ({c.assets?.length || 0})</h4>
                          <button 
                            onClick={() => { setSelectedCustomerForAsset(c); setShowAssetModal(true); }}
                            style={styles.smallAddBtn}
                          >
                            + Add Machine
                          </button>
                        </div>

                        {c.assets?.length === 0 ? (
                          <p style={styles.noAssetText}>No purifiers registered for this client yet.</p>
                        ) : (
                          c.assets?.map((asset) => (
                            <div key={asset.id} style={styles.assetCard}>
                              <div>
                                <strong style={{ color: '#0f172a' }}>{asset.model_name}</strong>
                                <div style={styles.serialText}>S/N: {asset.serial_number || 'N/A'} | {asset.asset_category}</div>
                              </div>
                              <div style={styles.assetRight}>
                                <span style={styles.badge}>{asset.membrane_gpd || '100 GPD'}</span>
                                <button 
                                  onClick={() => { setSelectedAssetForTicket(asset); setShowTicketModal(true); }}
                                  style={styles.ticketBtn}
                                  title="Log Service Ticket for this machine"
                                >
                                  🔧 Log Visit
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
              <div style={styles.sectionHeader}>
                <h2>Service & Maintenance Log</h2>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Every service visit, warranty check, and AMC filter replacement mapped directly to hardware units.</p>
              </div>

              {serviceTickets.length === 0 ? (
                <div style={styles.emptyCard}>
                  <p>No service tickets recorded yet. Click "Log Visit" on any customer's machine card to create one.</p>
                </div>
              ) : (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeadRow}>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Customer & Machine</th>
                        <th style={styles.th}>Service Type</th>
                        <th style={styles.th}>Reason</th>
                        <th style={styles.th}>Parts Cost</th>
                        <th style={styles.th}>Tech Payout</th>
                        <th style={styles.th}>Billed / Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceTickets.map((t) => (
                        <tr key={t.id} style={styles.tr}>
                          <td style={styles.td}>{new Date(t.visit_date).toLocaleDateString()}</td>
                          <td style={styles.td}>
                            <strong>{t.assets?.customers?.full_name || 'Customer'}</strong>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{t.assets?.model_name} ({t.assets?.serial_number})</div>
                          </td>
                          <td style={styles.td}><span style={styles.ticketTag}>{t.service_type_tag}</span></td>
                          <td style={styles.td}>{t.visit_reason}</td>
                          <td style={styles.td}>₹{t.internal_parts_cost || 0}</td>
                          <td style={styles.td}>₹{t.technician_payout_fee || 0}</td>
                          <td style={styles.td}><strong>₹{t.amount_collected_on_site || 0}</strong> ({t.payment_mode})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ledger' && (
            <div style={styles.placeholderTab}>
              <h2>Sales, Installments & EMI Financial Ledger</h2>
              <p style={{ color: '#64748b', maxWidth: '600px', margin: '10px auto' }}>
                Track initial machine sale margins, down payments, monthly EMI balances, and AMC contract renewals independently per machine unit.
              </p>
            </div>
          )}
        </main>
      )}

      {/* Modal: Add Customer */}
      {showCustomerModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3>Add New Customer Account</h3>
            <form onSubmit={handleCreateCustomer} style={styles.form}>
              <label style={styles.label}>Full Name</label>
              <input type="text" required value={newCust.full_name} onChange={e => setNewCust({...newCust, full_name: e.target.value})} style={styles.input} />
              
              <label style={styles.label}>Primary Phone</label>
              <input type="text" required value={newCust.primary_phone} onChange={e => setNewCust({...newCust, primary_phone: e.target.value})} style={styles.input} />

              <label style={styles.label}>Installation Address</label>
              <textarea value={newCust.address} onChange={e => setNewCust({...newCust, address: e.target.value})} style={{...styles.input, height: '70px'}} />

              <label style={styles.label}>Area Zone / Landmark</label>
              <input type="text" value={newCust.area_zone} onChange={e => setNewCust({...newCust, area_zone: e.target.value})} style={styles.input} />

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCustomerModal(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Asset */}
      {showAssetModal && selectedCustomerForAsset && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3>Register Water Purifier Asset</h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>For: <strong>{selectedCustomerForAsset.full_name}</strong></p>
            <form onSubmit={handleCreateAsset} style={styles.form}>
              <label style={styles.label}>Machine Nickname / Location</label>
              <input type="text" placeholder="e.g. Main Kitchen RO, 3rd Floor Plant" value={newAsset.asset_tag_nickname} onChange={e => setNewAsset({...newAsset, asset_tag_nickname: e.target.value})} style={styles.input} />

              <label style={styles.label}>Category</label>
              <select value={newAsset.asset_category} onChange={e => setNewAsset({...newAsset, asset_category: e.target.value})} style={styles.input}>
                <option value="Domestic RO">Domestic RO</option>
                <option value="Commercial RO">Commercial RO</option>
                <option value="Industrial Plant">Industrial Plant</option>
                <option value="Water Softener">Water Softener</option>
              </select>

              <label style={styles.label}>Model Name</label>
              <input type="text" required placeholder="e.g. AquaGuard Aquafresh / 100 LPH" value={newAsset.model_name} onChange={e => setNewAsset({...newAsset, model_name: e.target.value})} style={styles.input} />

              <label style={styles.label}>Serial Number</label>
              <input type="text" placeholder="S/N 983247923" value={newAsset.serial_number} onChange={e => setNewAsset({...newAsset, serial_number: e.target.value})} style={styles.input} />

              <label style={styles.label}>Membrane GPD / Capacity</label>
              <input type="text" value={newAsset.membrane_gpd} onChange={e => setNewAsset({...newAsset, membrane_gpd: e.target.value})} style={styles.input} />

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowAssetModal(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Service Ticket */}
      {showTicketModal && selectedAssetForTicket && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3>Log Service Visit & Unit Costs</h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Machine: <strong>{selectedAssetForTicket.model_name}</strong> (S/N: {selectedAssetForTicket.serial_number || 'N/A'})</p>
            <form onSubmit={handleCreateTicket} style={styles.form}>
              <label style={styles.label}>Service Coverage Tag</label>
              <select value={newTicket.service_type_tag} onChange={e => setNewTicket({...newTicket, service_type_tag: e.target.value})} style={styles.input}>
                <option value="🟡 Warranty Service">🟡 Warranty Service (Billed ₹0)</option>
                <option value="🟢 AMC Service">🟢 AMC Service (Billed ₹0)</option>
                <option value="🔵 Paid On-Demand">🔵 Paid On-Demand Service</option>
              </select>

              <label style={styles.label}>Visit Reason</label>
              <input type="text" value={newTicket.visit_reason} onChange={e => setNewTicket({...newTicket, visit_reason: e.target.value})} style={styles.input} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Internal Parts Cost (₹)</label>
                  <input type="number" value={newTicket.internal_parts_cost} onChange={e => setNewTicket({...newTicket, internal_parts_cost: e.target.value})} style={styles.input} />
                </div>
                <div>
                  <label style={styles.label}>Technician Fee (₹)</label>
                  <input type="number" value={newTicket.technician_payout_fee} onChange={e => setNewTicket({...newTicket, technician_payout_fee: e.target.value})} style={styles.input} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Amount Collected (₹)</label>
                  <input type="number" value={newTicket.amount_collected_on_site} onChange={e => setNewTicket({...newTicket, amount_collected_on_site: e.target.value})} style={styles.input} />
                </div>
                <div>
                  <label style={styles.label}>Payment Mode</label>
                  <select value={newTicket.payment_mode} onChange={e => setNewTicket({...newTicket, payment_mode: e.target.value})} style={styles.input}>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <label style={styles.label}>Work Performed Notes</label>
              <textarea value={newTicket.work_performed_notes} onChange={e => setNewTicket({...newTicket, work_performed_notes: e.target.value})} style={{...styles.input, height: '60px'}} placeholder="Replaced 100GPD membrane and pre-filters..." />

              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowTicketModal(false)} style={styles.secondaryBtn}>Cancel</button>
                <button type="submit" style={styles.primaryBtn}>Save Ticket Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh', padding: '30px 20px', color: '#333' },
  header: { maxWidth: '1200px', margin: '0 auto 20px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px' },
  title: { margin: 0, fontSize: '26px', fontWeight: '800', color: '#1e293b' },
  subtitle: { margin: '5px 0 0 0', fontSize: '14px', color: '#64748b' },
  headerActions: { display: 'flex', gap: '10px' },
  statsGrid: { maxWidth: '1200px', margin: '0 auto 25px auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' },
  statCard: { background: '#fff', padding: '18px 20px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' },
  statLabel: { fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statValue: { fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '5px' },
  navBar: { maxWidth: '1200px', margin: '0 auto 25px auto', display: 'flex', gap: '10px', flexWrap: 'wrap' },
  navBtn: { background: '#fff', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569', transition: 'all 0.2s' },
  activeNavBtn: { background: '#0284c7', color: '#fff', borderColor: '#0284c7', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)' },
  mainContent: { maxWidth: '1200px', margin: '0 auto' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' },
  searchInput: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '320px', fontSize: '14px', outline: 'none' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' },
  customerName: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' },
  phoneBadge: { display: 'inline-block', fontSize: '13px', color: '#0284c7', fontWeight: '600', marginTop: '4px' },
  zoneTag: { background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' },
  addressText: { fontSize: '14px', color: '#475569', margin: '10px 0 15px 0' },
  assetsSection: { borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '12px' },
  assetHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  assetsTitle: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', margin: 0 },
  smallAddBtn: { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0284c7', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  noAssetText: { fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', margin: '5px 0' },
  assetCard: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', fontSize: '13px' },
  serialText: { color: '#64748b', fontSize: '11px', marginTop: '2px' },
  assetRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  badge: { background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  ticketBtn: { background: '#0284c7', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  tableWrapper: { background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' },
  th: { background: '#f8fafc', padding: '14px 16px', color: '#475569', fontWeight: '700', borderBottom: '1px solid #e2e8f0' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '14px 16px', color: '#334155' },
  ticketTag: { background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' },
  primaryBtn: { background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)' },
  secondaryBtn: { background: '#e2e8f0', color: '#334155', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalCard: { background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '16px', padding: '25px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' },
  label: { fontSize: '13px', fontWeight: '700', color: '#475569' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' },
  loadingState: { textAlign: 'center', padding: '60px 0', color: '#64748b' },
  spinner: { width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' },
  placeholderTab: { background: '#fff', padding: '50px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }
}
