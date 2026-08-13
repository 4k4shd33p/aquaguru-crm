import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// Connect to Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'
export const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [activeTab, setActiveTab] = useState('customers')
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch Customers with their Assets, Contracts & Tickets
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

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1>AquaGuru CRM (Asset-Based)</h1>
        <nav style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setActiveTab('customers')} 
            style={{ fontWeight: activeTab === 'customers' ? 'bold' : 'normal', padding: '8px 16px', cursor: 'pointer' }}
          >
            Customers & Assets
          </button>
          <button 
            onClick={() => setActiveTab('tickets')} 
            style={{ fontWeight: activeTab === 'tickets' ? 'bold' : 'normal', padding: '8px 16px', cursor: 'pointer' }}
          >
            Service Tickets
          </button>
          <button 
            onClick={() => setActiveTab('ledger')} 
            style={{ fontWeight: activeTab === 'ledger' ? 'bold' : 'normal', padding: '8px 16px', cursor: 'pointer' }}
          >
            Sales & EMIs
          </button>
        </nav>
      </header>

      {loading ? (
        <p>Loading records from Supabase...</p>
      ) : (
        <main>
          {activeTab === 'customers' && (
            <div>
              <h2>Customers & Asset Breakdown</h2>
              {customers.length === 0 ? (
                <p>No customers found. Database is ready for new records!</p>
              ) : (
                customers.map((c) => (
                  <div key={c.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <h3>{c.full_name} ({c.phone})</h3>
                    <p>Address: {c.address || 'N/A'}</p>
                    <h4>Owned Assets ({c.assets?.length || 0}):</h4>
                    <ul>
                      {c.assets?.map((asset) => (
                        <li key={asset.id}>
                          <strong>{asset.model_name}</strong> - Serial: {asset.serial_number || 'N/A'} (GPD: {asset.membrane_gpd || 'Standard'})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'tickets' && (
            <div>
              <h2>Service Tickets</h2>
              <p>Tickets linked directly to specific assets will appear here.</p>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div>
              <h2>Sales & EMI Ledger</h2>
              <p>Payment logs, down payments, and AMC balances per asset.</p>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
