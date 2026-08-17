import { Mail, Phone, StickyNote } from 'lucide-react'
import { Card } from '../../../components/ui/Card'

function DataItem({ icon: Icon, label, value }) { return <div className="detail-item"><Icon size={17} /><div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div></div> }

export function CustomerOverview({ customer }) {
  return <Card className="customer-overview"><h2>Overview</h2><div className="customer-overview__grid"><DataItem icon={Phone} label="Phone" value={customer.phone} /><DataItem icon={Phone} label="Alternate phone" value={customer.alternate_phone} /><DataItem icon={Mail} label="Email" value={customer.email} /><DataItem icon={StickyNote} label="Notes" value={customer.notes} /></div></Card>
}
