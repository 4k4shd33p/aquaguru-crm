import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [activeTab, setActiveTab] = useState('customers')
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data, error } = await supabase
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
      if (!error && data) setCustomers(data)
      setLoading(false)
    }
    fetchData()
  }, [])

  const filteredCustomers = customers.filter(c => 
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.primary_phone?.includes(searchQuery) ||
    c.address?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>AquaGuru CRM</h1>
          <p style={styles.subtitle}>Asset-Based Water Purification Management</p>
        </div>
        <div style={styles.navButtons}>
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
            🔧 Service Tickets
          </button>
          <button 
            onClick={() => setActiveTab('ledger')} 
            style={{...styles.navBtn, ...(activeTab === 'ledger' ? styles.activeNavBtn : {})}}
          >
            💳 Sales & EMIs
          </button>
        </div>
      </header>

      {loading ? (
        <div style={styles.loadingState}>
          <div style={styles.spinner}></div>
          <p>Loading your live CRM records...</p>
        </div>
      ) : (
        <main style={styles.mainContent}>
          {activeTab === 'customers' && (
            <div>
              <div style={styles.sectionHeader}>
                <h2>Customer & Asset Directory</h2>
                <input 
                  type="text" 
                  placeholder="Search by name, phone, or address..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
              </div>

              {filteredCustomers.length === 0 ? (
                <div style={styles.emptyCard}>
                  <p>No customers match your search, or your database is empty. Ready for records!</p>
                </div>
              ) : (
                <div style={styles.grid}>
                  {filteredCustomers.map((c) => (
                    <div key={c.id} style={styles.card}>
                      <div style={styles.cardHeader}>
                        <div>
                          <h3 style={styles.customerName}>{c.full_name}</h3>
                          <span style={styles.phoneBadge}>📞 {c.phone || c.primary_phone || 'No Phone'}</span>
                        </div>
                        <span style={styles.zoneTag}>{c.area_zone || 'General Zone'}</span>
                      </div>
                      
                      <p style={styles.addressText}>📍 {c.address || c.installation_address || 'No Address Provided'}</p>
                      
                      <div style={styles.assetsSection}>
                        <h4 style={styles.assetsTitle}>Installed Assets ({c.assets?.length || 0})</h4>
                        {c.assets?.length === 0 ? (
                          <p style={styles.noAssetText}>No assets registered for this customer.</p>
                        ) : (
                          c.assets?.map((asset) => (
                            <div key={asset.id} style={styles.assetCard}>
                              <div>
                                <strong>{asset.model_name || 'Purifier'}</strong>
                                <span style={styles.serialText}> S/N: {asset.serial_number || 'N/A'}</span>
                              </div>
                              <div style={styles.assetMeta}>
                                <span style={styles.badge}>GPD: {asset.membrane_gpd || 'Standard'}</span>
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
            <div style={styles.placeholderTab}>
              <h2>Service & Maintenance Tickets</h2>
              <p>Track active installations, periodic filter changes, and breakdown logs mapped directly to hardware serial numbers.</p>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div style={styles.placeholderTab}>
              <h2>Sales & EMI Financial Ledger</h2>
              <p>Monitor down payments, upcoming monthly installments, and AMC contract renewals.</p>
            </div>
          )}
        </main>
      )}
    </div>
  )
}

const styles = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh', padding: '30px 20px', color: '#333' },
  header: { maxWidth: '1200px', margin: '0 auto 30px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px' },
  title: { margin: 0, fontSize: '26px', fontWeight: '800', color: '#1e293b' },
  subtitle: { margin: '5px 0 0 0', fontSize: '14px', color: '#64748b' },
  navButtons: { display: 'flex', gap: '10px' },
  navBtn: { background: '#fff', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569', transition: 'all 0.2s' },
  activeNavBtn: { background: '#0284c7', color: '#fff', borderColor: '#0284c7', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)' },
  mainContent: { maxWidth: '1200px', margin: '0 auto' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' },
  searchInput: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '300px', fontSize: '14px', outline: 'none' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' },
  card: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' },
  customerName: { margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' },
  phoneBadge: { display: 'inline-block', fontSize: '13px', color: '#0284c7', fontWeight: '600', marginTop: '4px' },
  zoneTag: { background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' },
  addressText: { fontSize: '14px', color: '#475569', margin: '10px 0 15px 0' },
  assetsSection: { borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '12px' },
  assetsTitle: { fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '8px' },
  noAssetText: { fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' },
  assetCard: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', fontSize: '13px' },
  serialText: { color: '#64748b', fontSize: '12px' },
  badge: { background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  loadingState: { textAlign: 'center', padding: '60px 0', color: '#64748b' },
  spinner: { width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' },
  placeholderTab: { background: '#fff', padding: '40px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }
}
