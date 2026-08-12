import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Seller = { name: string; earnings: string; notableSale: string }
type Shoutout = { id: string; name: string; note: string }
type FormState = {
  budget: string
  earnings: string
  sellers: Seller[]
  shoutouts: Shoutout[]
  glazeLevel: number
  resultLevel: number
  draft: string
}

const storageKey = 'dagens-tall-form'
const newId = () => crypto.randomUUID()

const defaultState: FormState = {
  budget: '',
  earnings: '',
  sellers: Array.from({ length: 3 }, () => ({ name: '', earnings: '', notableSale: '' })),
  shoutouts: [],
  glazeLevel: 3,
  resultLevel: 3,
  draft: '',
}

const resultLabels = ['Langt under budsjett', 'Under budsjett', 'Rett under budsjett', 'På budsjett', 'Over budsjett', 'Knust budsjettet']
const glazeLabels = ['Nøktern', 'Litt ekstra', 'Varm', 'Entusiastisk', 'Full glaze']

function readStoredState(): FormState {
  try {
    const stored = sessionStorage.getItem(storageKey)
    if (!stored) return defaultState
    const parsed = JSON.parse(stored) as Partial<FormState>
    return {
      ...defaultState,
      ...parsed,
      sellers: parsed.sellers?.length === 3 ? parsed.sellers : defaultState.sellers,
      shoutouts: parsed.shoutouts ?? [],
    }
  } catch {
    return defaultState
  }
}

const toNumber = (value: string) => {
  const norwegianNumber = value.trim().replace(/[\s.]/g, '').replace(',', '.')
  return norwegianNumber ? Number(norwegianNumber) : Number.NaN
}
const money = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 })

function App() {
  const [form, setForm] = useState<FormState>(readStoredState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form))
  }, [form])

  const budget = toNumber(form.budget)
  const earnings = toNumber(form.earnings)
  const hasNumbers = Number.isFinite(budget) && Number.isFinite(earnings) && form.budget !== '' && form.earnings !== ''
  const difference = hasNumbers ? earnings - budget : 0
  const percentage = hasNumbers && budget !== 0 ? (difference / budget) * 100 : 0

  const tokens = useMemo(() => {
    const values: Record<string, string> = {}
    if (hasNumbers) {
      values.B = money.format(budget)
      values.I = money.format(earnings)
      const direction = difference === 0 ? 'på budsjett' : difference > 0 ? 'over budsjett' : 'under budsjett'
      values.AVVIK = `${money.format(Math.abs(difference))} (${Math.abs(percentage).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % ${direction})`
    }
    form.sellers.forEach((seller, index) => {
      const number = index + 1
      if (seller.name.trim()) values[`S${number}`] = seller.name.trim()
      const sellerEarnings = toNumber(seller.earnings)
      if (seller.earnings !== '' && Number.isFinite(sellerEarnings)) values[`SI${number}`] = money.format(sellerEarnings)
      if (seller.notableSale.trim()) values[`MS${number}`] = seller.notableSale.trim()
    })
    form.shoutouts.forEach((shoutout, index) => {
      const number = index + 1
      if (shoutout.name.trim()) values[`SHOUTOUT${number}_NAVN`] = shoutout.name.trim()
      if (shoutout.note.trim()) values[`SHOUTOUT${number}_TEKST`] = shoutout.note.trim()
    })
    return values
  }, [budget, difference, earnings, form, hasNumbers, percentage])

  const unresolvedTokens = useMemo(() => {
    const matches = form.draft.match(/\[[A-Z0-9_]+\]/g) ?? []
    return [...new Set(matches)]
  }, [form.draft])

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }))
  const updateSeller = (index: number, patch: Partial<Seller>) => {
    const sellers = form.sellers.map((seller, sellerIndex) => sellerIndex === index ? { ...seller, ...patch } : seller)
    update({ sellers })
  }

  const validate = () => {
    if (!hasNumbers || budget < 0 || earnings < 0) return 'Skriv inn gyldig budsjett og inntjening før du genererer.'
    for (const [index, seller] of form.sellers.entries()) {
      if (!seller.name.trim() || seller.earnings === '' || !Number.isFinite(toNumber(seller.earnings))) return `Fyll inn navn og inntjening for toppselger ${index + 1}.`
    }
    if (form.shoutouts.some((item) => Boolean(item.name.trim()) !== Boolean(item.note.trim()))) return 'Hver shoutout må ha både navn og begrunnelse.'
    return ''
  }

  const replaceTokens = (template: string) => template.replace(/\[([A-Z0-9_]+)\]/g, (fullToken, key: string) => tokens[key] ?? fullToken)

  async function generateDraft() {
    setError('')
    setCopyStatus('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/generate-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultatNivaa: form.resultLevel, glazeNivaa: form.glazeLevel }),
      })
      if (!response.ok) throw new Error('Kunne ikke lage utkastet akkurat nå.')
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('template' in data) || typeof data.template !== 'string') throw new Error('Backend returnerte ikke en gyldig mal.')
      update({ draft: replaceTokens(data.template) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Noe gikk galt ved generering.')
    } finally {
      setLoading(false)
    }
  }

  async function copyDraft() {
    if (!form.draft) return
    try {
      await navigator.clipboard.writeText(form.draft)
      setCopyStatus('Kopiert – klart til å limes inn i Teams.')
    } catch {
      setError('Kunne ikke kopiere automatisk. Marker teksten og kopier manuelt.')
    }
  }

  const deviationText = !hasNumbers ? 'Legg inn tall for å se avvik' : difference === 0 ? 'På budsjett' : `${difference > 0 ? '+' : '−'}${money.format(Math.abs(difference))} · ${Math.abs(percentage).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % ${difference > 0 ? 'over' : 'under'}`

  return (
    <main className="app-shell">
      <header className="page-header">
        <div><p className="eyebrow">DAGSRAPPORT</p><h1>Dagens tall</h1><p>Lag et Teams-klart utkast uten at dataene dine deles med AI.</p></div>
        <div className="privacy-badge"><span aria-hidden="true">✦</span> Tall og navn blir på din enhet</div>
      </header>

      <section className="panel numbers-panel" aria-labelledby="numbers-title">
        <div className="section-heading"><div><p className="eyebrow">01 · RESULTAT</p><h2 id="numbers-title">Dagens inntjening</h2></div><div className={`deviation ${hasNumbers && difference >= 0 ? 'positive' : 'negative'}`}>{deviationText}</div></div>
        <div className="field-grid two-columns">
          <label>Daglig budsjett<input inputMode="decimal" value={form.budget} onChange={(event) => update({ budget: event.target.value })} placeholder="f.eks. 125 000" /></label>
          <label>Dagens inntjening<input inputMode="decimal" value={form.earnings} onChange={(event) => update({ earnings: event.target.value })} placeholder="f.eks. 132 500" /></label>
        </div>
      </section>

      <section className="panel" aria-labelledby="sellers-title">
        <div className="section-heading"><div><p className="eyebrow">02 · TOPP 3</p><h2 id="sellers-title">Selgerne som leverte</h2></div><span className="muted">Valgfritt: merkverdige salg</span></div>
        <div className="seller-grid">{form.sellers.map((seller, index) => <article className="seller-card" key={index}><span className="rank">#{index + 1}</span><label>Navn<input value={seller.name} onChange={(event) => updateSeller(index, { name: event.target.value })} placeholder="Selgernavn" /></label><label>Inntjening<input inputMode="decimal" value={seller.earnings} onChange={(event) => updateSeller(index, { earnings: event.target.value })} placeholder="0" /></label><label>Merkverdig salg<textarea rows={3} value={seller.notableSale} onChange={(event) => updateSeller(index, { notableSale: event.target.value })} placeholder="Valgfri detalj til rapporten" /></label></article>)}</div>
      </section>

      <section className="panel" aria-labelledby="shoutout-title">
        <div className="section-heading"><div><p className="eyebrow">03 · EKSTRA INNSATS</p><h2 id="shoutout-title">Shoutouts</h2></div><button className="secondary-button" type="button" onClick={() => update({ shoutouts: [...form.shoutouts, { id: newId(), name: '', note: '' }] })}>+ Legg til shoutout</button></div>
        {form.shoutouts.length === 0 ? <p className="empty-state">Ingen enda. Legg til en person som fortjener en ekstra anerkjennelse.</p> : <div className="shoutout-list">{form.shoutouts.map((shoutout) => <div className="shoutout-row" key={shoutout.id}><label>Navn<input value={shoutout.name} onChange={(event) => update({ shoutouts: form.shoutouts.map((item) => item.id === shoutout.id ? { ...item, name: event.target.value } : item) })} placeholder="Navn" /></label><label>Hva gjorde personen?<input value={shoutout.note} onChange={(event) => update({ shoutouts: form.shoutouts.map((item) => item.id === shoutout.id ? { ...item, note: event.target.value } : item) })} placeholder="Kort begrunnelse" /></label><button className="icon-button" type="button" aria-label={`Fjern shoutout for ${shoutout.name || 'ansatt'}`} onClick={() => update({ shoutouts: form.shoutouts.filter((item) => item.id !== shoutout.id) })}>×</button></div>)}</div>}
      </section>

      <section className="panel sliders-panel" aria-labelledby="tone-title">
        <div><p className="eyebrow">04 · TONE</p><h2 id="tone-title">Hvordan skal rapporten føles?</h2></div>
        <label className="slider-field"><span><strong>Resultat</strong><output>{resultLabels[form.resultLevel - 1]}</output></span><input type="range" min="1" max="6" step="1" value={form.resultLevel} onChange={(event) => update({ resultLevel: Number(event.target.value) })} /><small>Beskriver bare stemningen. Ingen tall sendes til AI.</small></label>
        <label className="slider-field"><span><strong>Glaze</strong><output>{glazeLabels[form.glazeLevel - 1]}</output></span><input type="range" min="1" max="5" step="1" value={form.glazeLevel} onChange={(event) => update({ glazeLevel: Number(event.target.value) })} /><small>Styrer hvor mye ekstra anerkjennelse AI-malen skal ha.</small></label>
      </section>

      <section className="generate-panel"><div><h2>Klar for Teams?</h2><p>Kun resultatnivå og glaze-nivå går til backend. Alle detaljer settes inn lokalt etterpå.</p></div><button className="generate-button" type="button" disabled={loading} onClick={generateDraft}>{loading ? 'Lager utkast…' : 'Generer dagens tall'} <span aria-hidden="true">→</span></button></section>
      {error && <p className="message error" role="alert">{error}</p>}

      {form.draft && <section className="panel draft-panel" aria-labelledby="draft-title"><div className="section-heading"><div><p className="eyebrow">UTKAST</p><h2 id="draft-title">Se over før du deler</h2></div><button className="copy-button" type="button" onClick={copyDraft}>Kopier til Teams</button></div><textarea className="draft-area" rows={13} value={form.draft} onChange={(event) => update({ draft: event.target.value })} aria-label="Redigerbart Teams-utkast" />{unresolvedTokens.length > 0 && <p className="message warning">Disse plassholderne mangler lokale data eller er ukjente: {unresolvedTokens.join(', ')}. De beholdes i teksten.</p>}{copyStatus && <p className="message success">{copyStatus}</p>}</section>}
    </main>
  )
}

export default App
