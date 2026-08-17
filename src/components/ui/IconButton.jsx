export function IconButton({ label, className = '', children, ...props }) {
  return <button type="button" className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>{children}</button>
}
