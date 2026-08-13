import { useState, useEffect, useMemo, useCallback } from 'react';
import { CreditCard, Search, Plus, X, Trash2, Eye, IndianRupee, TrendingUp, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Clock, Wallet, Calendar, ChevronDown, ChevronRight, DollarSign, ShoppingCart } from 'lucide-react';
import { supabase } from './lib/supabase';

const SALE_STATUS_LABELS = {
  completed: 'Completed', emi_active: 'EMI Active', emi_completed: 'EMI Completed',
};

const EMI_STATUS_LABELS = {
  paid: 'Paid', due: 'Due', overdue: 'Overdue',
};

export default function FinancialLedger({ showToast, customers, products, onRefresh }) {
  const [sales, setSales] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedSale, setExpandedSale] = useState(null);
  const [showAddSale, setShowAddSale] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const safe = (r, fallback) => {
      if (r.error) { console.warn('Supabase query failed:', r.error.message); return fallback; }
      return r.data || fallback;
    };
    try {
      const [s, i] = await Promise.all([
        supabase
          .from('sales')
          .select('*, customer:customers(name, phone), product:products(name, category)')
          .order('created_at', { ascending: false }),
        supabase
          .from('emi_installments')
          .select('*, sale:sales(customer:customers(name))')
          .order('due_date', { ascending: true }),
      ]);
      setSales(safe(s, []));
      setInstallments(safe(i, []));
    } catch (err) {
      console.warn('fetchData failed, using empty fallbacks:', err.message);
      setSales([]);
      setInstallments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteSale = async (id) => {
    if (!window.confirm('Delete this sale record? This will also delete its EMI schedule.')) return;
    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      showToast('Sale deleted');
      fetchData();
      onRefresh?.();
    } catch (err) {
      console.warn('handleDeleteSale failed:', err.message);
    }
  };

  const handleCollectInstallment = async (installmentId) => {
    try {
      const { error } = await supabase
        .from('emi_installments')
        .update({ status: 'paid', paid_date: new Date().toISOString() })
        .eq('id', installmentId);
      if (error) throw error;

      const installment = installments.find((i) => i.id === installmentId);
      if (installment) {
        const saleInstallments = installments.filter((i) => i.sale_id === installment.sale_id);
        const allPaid = saleInstallments.every((i) =>
          i.id === installmentId ? true : i.status === 'paid'
        );
        if (allPaid) {
          await supabase
            .from('sales')
            .update({ status: 'emi_completed', remaining_balance: 0 })
            .eq('id', installment.sale_id);
        } else {
          const remaining = saleInstallments
            .filter((i) => i.id !== installmentId && i.status !== 'paid')
            .reduce((sum, i) => sum + Number(i.amount), 0);
          await supabase
            .from('sales')
            .update({ remaining_balance: remaining })
            .eq('id', installment.sale_id);
        }
      }

      showToast('Installment collected');
      fetchData();
      onRefresh?.();
    } catch (err) {
      console.warn('handleCollectInstallment failed:', err.message);
    }
  };

  const totalSalesValue = useMemo(() => {
    return sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  }, [sales]);

  const outstandingEMI = useMemo(() => {
    return sales
      .filter((s) => s.status === 'emi_active')
      .reduce((sum, s) => sum + Number(s.remaining_balance || 0), 0);
  }, [sales]);

  const overdueCount = useMemo(() => {
    return installments.filter((i) => i.status === 'overdue').length;
  }, [installments]);

  const filteredSales = useMemo(() => {
    if (!search) return sales;
    const q = search.toLowerCase();
    return sales.filter((s) =>
      s.customer?.name?.toLowerCase().includes(q) ||
      s.product?.name?.toLowerCase().includes(q) ||
      s.status?.toLowerCase().includes(q)
    );
  }, [sales, search]);

  const getInstallmentsForSale = useCallback((saleId) => {
    return installments
      .filter((i) => i.sale_id === saleId)
      .sort((a, b) => a.installment_number - b.installment_number);
  }, [installments]);

  return (
    <>
      {/* Summary Metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp /></div>
          <div>
            <div className="stat-value">Rs {totalSalesValue.toLocaleString('en-IN')}</div>
            <div className="stat-label">Total Sales Value</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><Wallet /></div>
          <div>
            <div className="stat-value">Rs {outstandingEMI.toLocaleString('en-IN')}</div>
            <div className="stat-label">Outstanding EMI Balance</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><AlertCircle /></div>
          <div>
            <div className="stat-value">{overdueCount}</div>
            <div className="stat-label">Overdue EMI Collections</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input
            className="search-input"
            placeholder="Search by customer, product, status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddSale(true)}>
          <Plus />
          Record New Sale
        </button>
      </div>

      {/* Sales Ledger Table */}
      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Customer</th>
                  <th>Asset / RO Model</th>
                  <th>Total Amount</th>
                  <th>Upfront Paid</th>
                  <th>EMI Balance</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="table-empty">
                      <CreditCard />
                      No sales recorded yet. Click "Record New Sale" to get started.
                    </div>
                  </td></tr>
                ) : filteredSales.map((s) => {
                  const saleInstallments = getInstallmentsForSale(s.id);
                  const hasEMI = s.emi_months > 0;
                  const isExpanded = expandedSale === s.id;
                  return (
                    <>
                      <tr key={s.id}>
                        <td>
                          {hasEMI && (
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 4 }}
                              onClick={() => setExpandedSale(isExpanded ? null : s.id)}
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.customer?.name || '—'}
                        </td>
                        <td>{s.product?.name || '—'}</td>
                        <td style={{ fontWeight: 600 }}>Rs {Number(s.total_amount || 0).toLocaleString('en-IN')}</td>
                        <td style={{ color: 'var(--success-500)', fontWeight: 500 }}>
                          Rs {Number(s.upfront_paid || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontWeight: 600, color: Number(s.remaining_balance || 0) > 0 ? 'var(--warning-500)' : 'var(--text-dim)' }}>
                          Rs {Number(s.remaining_balance || 0).toLocaleString('en-IN')}
                        </td>
                        <td>
                          <span className={`badge badge-${s.status}`}>
                            <span className="badge-dot" />
                            {SALE_STATUS_LABELS[s.status] || s.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-ghost" onClick={() => handleDeleteSale(s.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasEMI && (
                        <tr key={s.id + '-emi'} className="emi-expanded-row">
                          <td colSpan={8} style={{ padding: 0, background: 'var(--bg-surface-2)' }}>
                            <div className="emi-breakdown">
                              <div className="emi-breakdown-header">
                                <Calendar size={16} />
                                EMI Installment Schedule — {s.emi_months} months at Rs {Number(s.emi_monthly || 0).toLocaleString('en-IN')}/mo
                              </div>
                              <table className="emi-table">
                                <thead>
                                  <tr>
                                    <th>Installment</th>
                                    <th>Due Date</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th style={{ width: 140 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {saleInstallments.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                                      No installment schedule generated.
                                    </td></tr>
                                  ) : saleInstallments.map((inst) => (
                                    <tr key={inst.id}>
                                      <td style={{ fontWeight: 600 }}>
                                        Month {inst.installment_number} of {inst.total_installments}
                                      </td>
                                      <td>{inst.due_date ? new Date(inst.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                      <td style={{ fontWeight: 600 }}>Rs {Number(inst.amount || 0).toLocaleString('en-IN')}</td>
                                      <td>
                                        <span className={`badge badge-${inst.status === 'paid' ? 'paid_on_site' : inst.status}`}>
                                          <span className="badge-dot" />
                                          {EMI_STATUS_LABELS[inst.status] || inst.status}
                                        </span>
                                      </td>
                                      <td>
                                        {inst.status !== 'paid' ? (
                                          <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleCollectInstallment(inst.id)}
                                          >
                                            <CheckCircle size={14} />
                                            Collect
                                          </button>
                                        ) : (
                                          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                            Paid {inst.paid_date ? new Date(inst.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record New Sale Modal */}
      {showAddSale && (
        <AddSaleModal
          customers={customers}
          products={products}
          onClose={() => setShowAddSale(false)}
          onSubmit={async (saleData, installmentData) => {
            try {
              const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert([saleData])
                .select()
                .single();
              if (saleError) throw saleError;

              if (installmentData && installmentData.length > 0) {
                const installmentsWithSale = installmentData.map((i) => ({
                  ...i,
                  sale_id: sale.id,
                }));
                const { error: instError } = await supabase
                  .from('emi_installments')
                  .insert(installmentsWithSale);
                if (instError) throw instError;
              }

              showToast('Sale recorded successfully');
              fetchData();
              onRefresh?.();
            } catch (err) {
              console.warn('Failed to record sale:', err.message);
              showToast('Could not save sale. Check your connection.', true);
            } finally {
              // Always close the modal so the user is never stuck on the form.
              setShowAddSale(false);
            }
          }}
        />
      )}
    </>
  );
}

function AddSaleModal({ customers, products, onClose, onSubmit }) {
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [totalAmount, setTotalAmount] = useState(0);
  const [upfrontPaid, setUpfrontPaid] = useState(0);
  const [emiMonths, setEmiMonths] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  useEffect(() => {
    if (selectedProduct) {
      setTotalAmount(Number(selectedProduct.price) * Number(quantity));
    }
  }, [selectedProduct, quantity]);

  const emiMonthly = emiMonths > 0
    ? Math.ceil((Number(totalAmount) - Number(upfrontPaid)) / Number(emiMonths))
    : 0;
  const remainingBalance = Math.max(0, Number(totalAmount) - Number(upfrontPaid));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerId) { setError('Please select a customer'); return; }
    if (!productId) { setError('Please select a product'); return; }
    if (Number(upfrontPaid) > Number(totalAmount)) { setError('Upfront paid cannot exceed total amount'); return; }
    if (emiMonths > 0 && Number(upfrontPaid) >= Number(totalAmount)) { setError('EMI not needed if full amount paid upfront'); return; }

    setSubmitting(true);
    setError('');

    const status = emiMonths > 0 ? 'emi_active' : 'completed';

    const saleData = {
      customer_id: customerId,
      product_id: productId,
      quantity: Number(quantity),
      total_amount: Number(totalAmount),
      upfront_paid: Number(upfrontPaid),
      emi_months: Number(emiMonths),
      emi_monthly: emiMonthly,
      remaining_balance: emiMonths > 0 ? remainingBalance : 0,
      status,
    };

    let installmentData = [];
    if (emiMonths > 0) {
      const today = new Date();
      for (let i = 1; i <= emiMonths; i++) {
        const dueDate = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
        installmentData.push({
          installment_number: i,
          total_installments: Number(emiMonths),
          due_date: dueDate.toISOString().split('T')[0],
          amount: emiMonthly,
          status: 'due',
        });
      }
    }

    try {
      await onSubmit(saleData, installmentData);
    } catch (err) {
      console.warn('AddSaleModal submit failed:', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Record New Sale</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

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
              <label className="form-label">Product / RO Model *</label>
              <select
                className="form-select"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — Rs {Number(p.price || 0).toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Total Amount (Rs)</label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Upfront Paid (Rs)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={upfrontPaid}
                onChange={(e) => setUpfrontPaid(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">EMI Months (0 = full payment)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                max="60"
                value={emiMonths}
                onChange={(e) => setEmiMonths(e.target.value)}
                placeholder="0"
              />
            </div>

            {emiMonths > 0 && (
              <div className="billing-section">
                <div className="billing-row">
                  <span>Total Amount</span>
                  <span className="billing-amount">Rs {Number(totalAmount).toLocaleString('en-IN')}</span>
                </div>
                <div className="billing-row">
                  <span>Upfront Paid</span>
                  <span className="billing-amount">Rs {Number(upfrontPaid || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="billing-row">
                  <span>EMI Duration</span>
                  <span className="billing-amount">{emiMonths} months</span>
                </div>
                <div className="billing-row">
                  <span>Monthly EMI</span>
                  <span className="billing-amount">Rs {emiMonthly.toLocaleString('en-IN')}</span>
                </div>
                <div className="billing-row total">
                  <span>Remaining Balance</span>
                  <span className="billing-amount">Rs {remainingBalance.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Record Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
