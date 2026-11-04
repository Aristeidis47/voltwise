export function Bolt({ large = false }: { large?: boolean }) {
  return <span className={large ? 'bolt-mark large' : 'bolt-mark'} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M13.5 2.5 5.5 13h6l-1 8.5 8-11h-6l1-8Z" fill="currentColor" /></svg></span>;
}
export default function Brand() {
  return <header className="brand-bar"><a className="skip-link" href="#main-content">Μετάβαση στο περιεχόμενο</a><div className="brand"><Bolt /><span>VoltWise</span></div><span className="demo-badge">Εκπαιδευτικό demo</span></header>;
}
