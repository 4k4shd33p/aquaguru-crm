export function Button({ className = '', variant = 'primary', type = 'button', children, ...props }) {
  return <button type={type} className={`button button--${variant} ${className}`.trim()} {...props}>{children}</button>
}
