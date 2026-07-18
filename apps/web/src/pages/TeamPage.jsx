import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Plus, ShieldCheck, UserRoundCheck, Users, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import { permissionGroups, rolePermissionDefaults } from '../lib/permissions.js'

const roleLabels = {
  owner_admin: 'Owner / Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  rider: 'Rider'
}

function makeTemporaryPassword() {
  const values = new Uint32Array(14)
  crypto.getRandomValues(values)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return `KLCW!${Array.from(values, (value) => alphabet[value % alphabet.length]).join('')}`
}

export function TeamPage({ accessToken, profile }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', employeeCode: '', role: 'cashier', password: makeTemporaryPassword(), permissions: rolePermissionDefaults.cashier })

  const loadEmployees = useCallback(async () => {
    setError('')
    try {
      const result = await apiRequest('/api/team', { accessToken })
      setEmployees(result.employees)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { loadEmployees() }, [loadEmployees])

  const activeCount = useMemo(() => employees.filter((employee) => employee.is_active).length, [employees])
  const canCreate = profile.role === 'owner_admin'

  function openCreate() {
    setCreatedCredentials(null)
    setForm({ fullName: '', email: '', employeeCode: '', role: 'cashier', password: makeTemporaryPassword(), permissions: rolePermissionDefaults.cashier })
    setShowCreate(true)
  }

  async function handleCreate(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await apiRequest('/api/team', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(form)
      })
      setCreatedCredentials({ email: form.email, password: form.password })
      setShowCreate(false)
      await loadEmployees()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function selectRole(role) {
    setForm({ ...form, role, permissions: [...rolePermissionDefaults[role]] })
  }

  function togglePermission(permission) {
    setForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((key) => key !== permission) : [...current.permissions, permission] }))
  }

  async function copyCredentials() {
    if (!createdCredentials) return
    await navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nTemporary password: ${createdCredentials.password}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="page team-page">
      <header className="page-header">
        <div><span className="eyebrow">Access management</span><h1>Team</h1><p>Create employee accounts and assign operational roles.</p></div>
        {canCreate && <button className="primary-button" type="button" onClick={openCreate}><Plus size={18} />Add employee</button>}
      </header>

      {error && <div className="notice notice--error">{error}</div>}
      {createdCredentials && (
        <section className="credentials-card">
          <div className="credentials-card__icon"><Check size={22} /></div>
          <div><strong>Employee account created</strong><span>{createdCredentials.email}</span><code>{createdCredentials.password}</code><small>Copy this temporary password now. It will not be shown again after leaving this page.</small></div>
          <button className="secondary-button" type="button" onClick={copyCredentials}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copied' : 'Copy credentials'}</button>
        </section>
      )}

      <section className="team-summary">
        <article><Users size={22} /><div><strong>{employees.length}</strong><span>Total employees</span></div></article>
        <article><UserRoundCheck size={22} /><div><strong>{activeCount}</strong><span>Active accounts</span></div></article>
        <article><ShieldCheck size={22} /><div><strong>{employees.filter((employee) => employee.role === 'owner_admin').length}</strong><span>Owner admins</span></div></article>
      </section>

      <section className="team-table-card">
        <div className="team-table-card__heading"><div><span className="eyebrow">Employee directory</span><h2>Staff accounts</h2></div></div>
        {loading ? <div className="team-loading"><div className="spinner" />Loading employees...</div> : (
          <div className="team-table-wrap">
            <table className="team-table">
              <thead><tr><th>Employee</th><th>Role</th><th>Code</th><th>Status</th><th>Last sign-in</th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td><div className="employee-cell"><span className="avatar">{employee.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><div><strong>{employee.full_name}</strong><small>{employee.email}</small></div></div></td>
                    <td><span className={`role-pill role-pill--${employee.role}`}>{roleLabels[employee.role]}</span></td>
                    <td>{employee.employee_code || '—'}</td>
                    <td><span className={`status-pill ${employee.is_active ? 'status-pill--active' : ''}`}>{employee.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>{employee.last_sign_in_at ? new Date(employee.last_sign_in_at).toLocaleDateString('en-PH') : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false) }}>
          <section className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="create-employee-title">
            <header><div><span className="eyebrow">New staff account</span><h2 id="create-employee-title">Add employee</h2><p>Create a confirmed login and assign the employee’s role.</p></div><button className="icon-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close"><X size={19} /></button></header>
            <form onSubmit={handleCreate}>
              <div className="employee-form-grid">
                <label><span>Full name</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Employee name" required minLength={2} /></label>
                <label><span>Employee code</span><input value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value })} placeholder="e.g. CASH-001" /></label>
                <label className="employee-form-grid__wide"><span>Email address</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="employee@klwings.ph" required /></label>
                <label><span>Role</span><select value={form.role} onChange={(event) => selectRole(event.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Temporary password</span><input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={10} /></label>
                <fieldset className="employee-permissions employee-form-grid__wide">
                  <legend>Feature access</legend>
                  <p>The role selects recommended access. Customize any feature below.</p>
                  {permissionGroups.map((group) => <div className="permission-group" key={group.label}><strong>{group.label}</strong><div>{group.permissions.map(([key, label]) => <label key={key}><input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} /><span>{label}</span></label>)}</div></div>)}
                </fieldset>
              </div>
              <div className="employee-modal__actions"><button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create employee'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
