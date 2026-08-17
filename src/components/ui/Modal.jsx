import { X } from 'lucide-react'
import { useEffect } from 'react'
import { IconButton } from './IconButton'

export function Modal({ title, description, children, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined} onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal__header"><div><h2 id="modal-title">{title}</h2>{description && <p id="modal-description">{description}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={19} /></IconButton></header>
      {children}
    </section>
  </div>
}
