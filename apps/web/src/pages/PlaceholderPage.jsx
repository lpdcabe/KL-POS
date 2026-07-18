import { Construction } from 'lucide-react'

export function PlaceholderPage({ title, description }) {
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Module foundation</span><h1>{title}</h1><p>{description}</p></div></header>
      <section className="empty-state empty-state--large">
        <div className="empty-state__art"><Construction size={28} /></div>
        <div><h2>{title} is next in the build sequence</h2><p>The navigation and permission boundary are ready for the operational workflow.</p></div>
      </section>
    </div>
  )
}
