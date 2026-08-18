import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Seller = { name: string; earnings: string; notableSale: string }
type Shoutout = { id: string; name: string; note: string }
type Step = 1 | 2 | 3 | 4

type FormState = {
  budget: string
  earnings: string
  sellers: Seller[]
  shoutouts: Shoutout[]
  asoComment: string
  npsScore: string
  glazeLevel: number
  resultLevel: number
  draft: string
}

const storageKey = 'dagens-tall-form'
const newId = () => crypto.randomUUID()
const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

const steps: { number: Step; label: string; shortLabel: string }[] = [
  { number: 1, label: 'Resultat', shortLabel: 'Resultat' },
  { number: 2, label: 'Topp 3', shortLabel: 'Topp 3' },
  { number: 3, label: 'Ekstra innsats', shortLabel: 'Ekstra' },
  { number: 4, label: 'ASO og NPS', shortLabel: 'ASO/NPS' },
]

const defaultState: FormState = {
  budget: '',
  earnings: '',
  sellers: Array.from({ length: 3 }, () => ({
    name: '',
    earnings: '',
    notableSale: '',
  })),
  shoutouts: [],
  asoComment: '',
  npsScore: '',
  glazeLevel: 3,
  resultLevel: 3,
  draft: '',
}

const resultLabels = [
  'Langt under budsjett',
  'Rett under budsjett',
  'På budsjett',
  'Over budsjett',
  'Knust budsjettet',
]

const glazeLabels = [
  'Nøktern',
  'Litt ekstra',
  'Varm',
  'Entusiastisk',
  'Full glaze',
]

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

const money = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
})

function App() {
  const [form, setForm] = useState<FormState>(readStoredState)
  const [activeStep, setActiveStep] = useState<Step>(1)
  const [openSeller, setOpenSeller] = useState(0)
  const [showToneDialog, setShowToneDialog] = useState(false)
  const [showDraftDialog, setShowDraftDialog] = useState(false)
  const [darkMode, setDarkMode] = useState(() => sessionStorage.getItem('dagens-tall-theme') !== 'light')
  const [idToken, setIdToken] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const toneDialogRef = useRef<HTMLDivElement>(null)
  const draftDialogRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (idToken) return
    if (!googleClientId) {
      setAuthError('Google-innlogging er ikke konfigurert. Legg inn VITE_GOOGLE_CLIENT_ID.')
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    )
    const script = existingScript ?? document.createElement('script')
    const initializeGoogleLogin = () => {
      if (!window.google || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          setIdToken(response.credential)
          setAuthError('')
        },
      })
      googleButtonRef.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      })
    }

    script.addEventListener('load', initializeGoogleLogin)
    script.addEventListener('error', () => setAuthError('Kunne ikke laste Google-innlogging. Sjekk internettforbindelsen.'))
    if (!existingScript) {
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    } else if (window.google) {
      initializeGoogleLogin()
    }
    return () => script.removeEventListener('load', initializeGoogleLogin)
  }, [idToken])

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form))
  }, [form])

  useEffect(() => {
    sessionStorage.setItem('dagens-tall-theme', darkMode ? 'dark' : 'light')
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  useEffect(() => {
    if (!showToneDialog && !showDraftDialog) return
    ;(showToneDialog ? toneDialogRef : draftDialogRef).current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || loading || isTyping) return
      if (showToneDialog) setShowToneDialog(false)
      if (showDraftDialog) setShowDraftDialog(false)
    }

    const closeOnBackdropClick = (event: MouseEvent) => {
      if (loading || isTyping || !(event.target instanceof HTMLElement)) return
      if (!event.target.classList.contains('modal-backdrop')) return
      if (showToneDialog) setShowToneDialog(false)
      if (showDraftDialog) setShowDraftDialog(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('mousedown', closeOnBackdropClick)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('mousedown', closeOnBackdropClick)
    }
  }, [showToneDialog, showDraftDialog, loading, isTyping])

  useEffect(() => {
    if (form.draft) draftRef.current?.focus()
  }, [form.draft])

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
  }, [])

  const budget = toNumber(form.budget)
  const earnings = toNumber(form.earnings)
  const hasNumbers = Number.isFinite(budget) && Number.isFinite(earnings) && form.budget !== '' && form.earnings !== ''
  const difference = hasNumbers ? earnings - budget : 0
  const percentage = hasNumbers && budget !== 0 ? (difference / budget) * 100 : 0
  const completedSellerCount = form.sellers.filter((seller) => seller.name.trim() && seller.earnings !== '' && Number.isFinite(toNumber(seller.earnings))).length
  const sellersComplete = completedSellerCount === 3

  useEffect(() => {
    document.documentElement.dataset.result = hasNumbers && difference < 0 ? 'under-budget' : 'at-budget'
  }, [hasNumbers, difference])

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
    if (form.asoComment.trim()) values.ASO = form.asoComment.trim()
    if (form.npsScore.trim()) values.NPS = form.npsScore.trim()
    return values
  }, [budget, difference, earnings, form, hasNumbers, percentage])

  const unresolvedTokens = useMemo(() => [...new Set(form.draft.match(/\[[A-Z0-9_]+\]/g) ?? [])], [form.draft])

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }))
  const updateSeller = (index: number, patch: Partial<Seller>) => update({ sellers: form.sellers.map((seller, sellerIndex) => sellerIndex === index ? { ...seller, ...patch } : seller) })
  const updateShoutout = (id: string, patch: Partial<Shoutout>) => update({ shoutouts: form.shoutouts.map((shoutout) => shoutout.id === id ? { ...shoutout, ...patch } : shoutout) })
  const advanceSellerIfReady = (index: number) => {
    const seller = form.sellers[index]
    if (index < 2 && seller.name.trim() && seller.earnings !== '' && Number.isFinite(toNumber(seller.earnings))) setOpenSeller(index + 1)
  }

  const validate = () => {
    if (!hasNumbers || budget < 0 || earnings < 0) return 'Skriv inn gyldig budsjett og inntjening før du genererer.'
    for (const [index, seller] of form.sellers.entries()) {
      if (!seller.name.trim() || seller.earnings === '' || !Number.isFinite(toNumber(seller.earnings))) return `Fyll inn navn og inntjening for toppselger ${index + 1}.`
    }
    if (form.shoutouts.some((item) => Boolean(item.name.trim()) !== Boolean(item.note.trim()))) return 'Hver shoutout må ha både navn og begrunnelse.'
    if (form.npsScore.trim()) {
      const npsScore = Number(form.npsScore)
      if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 100) return 'NPS må være et helt tall fra 0 til 100.'
    }
    return ''
  }

  const replaceTokens = (template: string) => template.replace(/\[([A-Z0-9_]+)\]/g, (fullToken, key: string) => tokens[key] ?? fullToken)
  const goToStep = (step: Step) => { setError(''); setActiveStep(step) }
  const nextStep = () => goToStep(Math.min(activeStep + 1, 4) as Step)

  const openToneDialog = () => {
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      if (!hasNumbers) setActiveStep(1)
      else if (!sellersComplete) setActiveStep(2)
      return
    }
    setShowToneDialog(true)
  }

  const finishSellers = () => {
    if (!sellersComplete) {
      setError('Fyll inn navn og gyldig inntjening for alle tre toppselgerne før du går videre.')
      return
    }
    goToStep(3)
  }

  const writeDraft = (draft: string) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)

    setIsTyping(true)
    setShowDraftDialog(true)
    update({ draft: '' })
    let position = 0

    const typeNext = () => {
      position = Math.min(position + 4, draft.length)
      update({ draft: draft.slice(0, position) })

      if (position < draft.length) {
        typingTimerRef.current = setTimeout(typeNext, 9)
      } else {
        typingTimerRef.current = null
        setIsTyping(false)
      }
    }

    typeNext()
  }

  async function generateDraft() {
    setError('')
    setCopyStatus('')
    setLoading(true)
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate-daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          resultLevel: form.resultLevel,
          glazeLevel: form.glazeLevel,
          shoutouts: form.shoutouts.flatMap((shoutout, index) => shoutout.name.trim() && shoutout.note.trim() ? [{ slot: index + 1, note: shoutout.note.trim() }] : []),
          notableSales: form.sellers.flatMap((seller, index) => seller.name.trim() && seller.notableSale.trim() ? [{ slot: index + 1, note: seller.notableSale.trim() }] : []),
          asoComment: form.asoComment.trim() || null,
          npsScore: form.npsScore.trim() ? Number(form.npsScore) : null,
        }),
      })
      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null)
        const message = errorData && typeof errorData === 'object' && 'detail' in errorData && typeof errorData.detail === 'string' ? errorData.detail : 'Kunne ikke lage utkastet akkurat nå.'
        throw new Error(message)
      }
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('template' in data) || typeof data.template !== 'string') throw new Error('Backend returnerte ikke en gyldig mal.')
      writeDraft(replaceTokens(data.template))
      setShowToneDialog(false)
    } catch (caught) {
      if (caught instanceof Error && /logg inn|Google-innlogging/i.test(caught.message)) setIdToken('')
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

  function signOut() {
    window.google?.accounts.id.disableAutoSelect()
    setIdToken('')
    setError('')
    setCopyStatus('')
  }

  const deviationText = !hasNumbers ? 'Legg inn tall for å se avvik' : difference === 0 ? 'På budsjett' : `${difference > 0 ? '+' : '−'}${money.format(Math.abs(difference))} · ${Math.abs(percentage).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % ${difference > 0 ? 'over' : 'under'}`
  const npsNumber = Number(form.npsScore)
  const npsLabel = !form.npsScore ? 'Valgfritt' : npsNumber >= 80 ? 'Bra kundeopplevelse' : npsNumber >= 50 ? 'Middels kundeopplevelse' : 'Lav kundeopplevelse'

  if (!idToken) {
    return <main className="login-shell"><section className="login-card" aria-labelledby="login-title"><p className="eyebrow">DAGSRAPPORT</p><h1 id="login-title">Dagens tall</h1><p>Logg inn med din godkjente Google-konto for å åpne rapportverktøyet.</p><div className="google-button" ref={googleButtonRef} />{authError && <p className="message error" role="alert">{authError}</p>}</section></main>
  }

  const renderStepSummary = (step: Step) => {
    if (step === 1) return <p><strong>{hasNumbers ? `${money.format(earnings)} mot ${money.format(budget)}` : 'Tall mangler'}</strong><span>{hasNumbers ? deviationText : 'Legg inn budsjett og inntjening'}</span></p>
    if (step === 2) return <p><strong>{completedSellerCount} av 3 toppselgere fylt ut</strong><span>{sellersComplete ? form.sellers.map((seller) => seller.name).join(', ') : 'Fortsett å fylle ut selgerne'}</span></p>
    if (step === 3) return <p><strong>{form.shoutouts.length ? `${form.shoutouts.length} shoutout${form.shoutouts.length === 1 ? '' : 's'}` : 'Ingen shoutouts'}</strong><span>{form.shoutouts.length ? 'Ekstra innsats er lagt til' : 'Dette steget er valgfritt'}</span></p>
    return <p><strong>{form.npsScore ? `NPS ${form.npsScore}` : 'Ingen NPS-score'}</strong><span>{form.asoComment ? 'ASO-kommentar er lagt til' : 'ASO og NPS er valgfritt'}</span></p>
  }

  return (
    <main className={`app-shell ${hasNumbers && difference < 0 ? 'under-budget' : 'at-budget'} ${darkMode ? 'dark-mode' : ''}`}>
      <header className="page-header"><div><p className="eyebrow">DAGSRAPPORT</p><h1>Dagens tall</h1><p>Fyll ut litt om gangen – alt lagres i denne nettleserøkten.</p></div><div className="header-actions"><label className="theme-switch"><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} /><span aria-hidden="true" /><strong>Mørk modus</strong></label>{form.draft && <button className="draft-shortcut" type="button" onClick={() => setShowDraftDialog(true)}>Åpne utkast</button>}<button className="sign-out-button" type="button" onClick={signOut}>Logg ut</button></div></header>

      <nav className="progress-nav" aria-label="Steg i dagsrapporten">
        {steps.map((step) => <button key={step.number} type="button" className={`progress-step ${activeStep === step.number ? 'active' : ''} ${activeStep > step.number ? 'complete' : ''}`} onClick={() => goToStep(step.number)} aria-current={activeStep === step.number ? 'step' : undefined}><span>{step.number}</span><strong>{step.label}</strong></button>)}
      </nav>

      {steps.filter((step) => step.number < activeStep).map((step) => <button className="step-summary" type="button" key={step.number} onClick={() => goToStep(step.number)}><div><p className="eyebrow">{String(step.number).padStart(2, '0')} · {step.shortLabel.toUpperCase()}</p>{renderStepSummary(step.number)}</div><span className="summary-action">Endre <span aria-hidden="true">→</span></span></button>)}

      {activeStep === 1 && <section className="panel focused-step" aria-labelledby="numbers-title"><div className="section-heading"><div><p className="eyebrow">01 · RESULTAT</p><h2 id="numbers-title">Hvordan gikk dagen?</h2><p className="section-intro">Start med dagens to tall. Avviket regnes ut automatisk.</p></div><div className={`deviation ${hasNumbers && difference >= 0 ? 'positive' : 'negative'}`}>{deviationText}</div></div><div className="field-grid two-columns"><label>Daglig budsjett<input autoFocus inputMode="decimal" value={form.budget} onChange={(event) => update({ budget: event.target.value })} placeholder="f.eks. 125 000" /></label><label>Dagens inntjening<input inputMode="decimal" value={form.earnings} onChange={(event) => update({ earnings: event.target.value })} placeholder="f.eks. 132 500" /></label></div><div className="step-actions"><button className="next-button" type="button" onClick={nextStep}>Videre til topp 3 <span aria-hidden="true">→</span></button></div></section>}

      {activeStep === 2 && <section className="panel focused-step" aria-labelledby="sellers-title"><div className="section-heading"><div><p className="eyebrow">02 · TOPP 3</p><h2 id="sellers-title">Selgerne som leverte</h2><p className="section-intro">Fyll ut én selger om gangen. Merkverdige salg er helt valgfritt.</p></div><div className="seller-count">{completedSellerCount} / 3 ferdig</div></div><div className="seller-sequence">{form.sellers.map((seller, index) => { const isReady = seller.name.trim() && seller.earnings !== '' && Number.isFinite(toNumber(seller.earnings)); const isOpen = openSeller === index; const canOpen = index === 0 || Boolean(form.sellers[index - 1].name.trim() && form.sellers[index - 1].earnings !== ''); return <article className={`seller-card guided-seller ${isOpen ? 'open' : ''} ${isReady ? 'ready' : ''}`} key={index}>{!isOpen ? <button type="button" className="seller-preview" disabled={!canOpen} onClick={() => setOpenSeller(index)}><span className="rank">#{index + 1}</span><span><strong>{seller.name || `Topp ${index + 1}`}</strong><small>{isReady ? money.format(toNumber(seller.earnings)) : canOpen ? 'Trykk for å fylle ut' : 'Fyll ut forrige selger først'}</small></span><span aria-hidden="true">{isReady ? '✓' : '→'}</span></button> : <><div className="seller-card-heading"><span className="rank">#{index + 1}</span><span>Fyll ut toppselger {index + 1}</span></div><div className="field-grid two-columns"><label>Navn<input autoFocus={index === 0} value={seller.name} onChange={(event) => updateSeller(index, { name: event.target.value })} placeholder="Selgernavn" /></label><label>Inntjening<input inputMode="decimal" value={seller.earnings} onChange={(event) => updateSeller(index, { earnings: event.target.value })} onBlur={() => advanceSellerIfReady(index)} placeholder="0" /></label></div><details className="optional-details" open={Boolean(seller.notableSale)}><summary>+ Legg til merkverdig salg <span>valgfritt</span></summary><label>Hva var merkverdig?<textarea rows={3} value={seller.notableSale} onChange={(event) => updateSeller(index, { notableSale: event.target.value })} placeholder="Kort detalj til rapporten" /></label></details><div className="seller-card-actions"><button className="text-button" type="button" onClick={() => setOpenSeller(Math.max(0, index - 1))} disabled={index === 0}>Tilbake</button><button className="secondary-button" type="button" onClick={() => index < 2 ? setOpenSeller(index + 1) : finishSellers()}>{index < 2 ? 'Neste selger' : 'Ferdig med topp 3'}</button></div></>}</article>})}</div>{sellersComplete && <div className="seller-recap"><strong>Topp 3 er klart</strong><span>{form.sellers.map((seller, index) => `#${index + 1} ${seller.name}`).join(' · ')}</span></div>}<div className="step-actions"><button className="text-button" type="button" onClick={() => goToStep(1)}>← Til resultat</button><button className="next-button" type="button" onClick={finishSellers}>Videre til ekstra innsats <span aria-hidden="true">→</span></button></div></section>}

      {activeStep === 3 && <section className="panel focused-step" aria-labelledby="shoutout-title"><div className="section-heading"><div><p className="eyebrow">03 · EKSTRA INNSATS</p><h2 id="shoutout-title">Shoutouts</h2><p className="section-intro">Dette er valgfritt. Gi noen en ekstra anerkjennelse når det passer.</p></div><button className="secondary-button" type="button" onClick={() => update({ shoutouts: [...form.shoutouts, { id: newId(), name: '', note: '' }] })}>+ Legg til shoutout</button></div>{form.shoutouts.length === 0 ? <div className="optional-empty"><strong>Ingen shoutout i dag?</strong><span>Helt i orden – du kan gå videre når du vil.</span></div> : <div className="shoutout-list">{form.shoutouts.map((shoutout) => <div className="shoutout-row" key={shoutout.id}><label>Navn<input value={shoutout.name} onChange={(event) => updateShoutout(shoutout.id, { name: event.target.value })} placeholder="Navn" /></label><label>Hva gjorde personen?<input value={shoutout.note} onChange={(event) => updateShoutout(shoutout.id, { note: event.target.value })} placeholder="Kort begrunnelse" /></label><button className="icon-button" type="button" aria-label={`Fjern shoutout for ${shoutout.name || 'ansatt'}`} onClick={() => update({ shoutouts: form.shoutouts.filter((item) => item.id !== shoutout.id) })}>×</button></div>)}</div>}<div className="step-actions"><button className="text-button" type="button" onClick={() => goToStep(2)}>← Til topp 3</button><button className="next-button" type="button" onClick={nextStep}>Videre til ASO og NPS <span aria-hidden="true">→</span></button></div></section>}

      {activeStep === 4 && <section className="panel focused-step" aria-labelledby="aso-nps-title"><div className="section-heading"><div><p className="eyebrow">04 · KUNDE OG SUPPORT</p><h2 id="aso-nps-title">ASO og NPS</h2><p className="section-intro">Valgfritt. Dette hjelper AI-en med å omtale kundeopplevelse og support på riktig måte.</p></div><span className="muted">Sendes til AI</span></div><div className="field-grid two-columns"><label>ASO-kommentar<textarea rows={3} value={form.asoComment} onChange={(event) => update({ asoComment: event.target.value })} placeholder="F.eks. solid flyt i kassen og god hjelp i supportdisken" /><small>After Sales Operations – kasse og support.</small></label><label>NPS-score<input type="number" min="0" max="100" step="1" inputMode="numeric" value={form.npsScore} onChange={(event) => update({ npsScore: event.target.value })} placeholder="0–100" /><small>Kundeopplevelse. 80 eller høyere regnes som bra.</small><output className={`nps-status ${npsNumber >= 80 ? 'good' : npsNumber >= 50 ? 'medium' : form.npsScore ? 'low' : ''}`}>{npsLabel}</output></label></div><div className="step-actions"><button className="text-button" type="button" onClick={() => goToStep(3)}>← Til ekstra innsats</button></div></section>}

      {steps.filter((step) => step.number > activeStep).map((step) => <button className="step-summary" type="button" key={step.number} onClick={() => goToStep(step.number)}><div><p className="eyebrow">{String(step.number).padStart(2, '0')} · {step.shortLabel.toUpperCase()}</p>{renderStepSummary(step.number)}</div><span className="summary-action">Endre <span aria-hidden="true">→</span></span></button>)}

      <section className="generate-panel"><div><h2>Lag Teams-utkastet</h2><p>Velg tone og glaze i neste vindu før utkastet blir generert.</p></div><div className="generate-actions">{form.draft && <button className="draft-shortcut on-panel" type="button" onClick={() => setShowDraftDialog(true)}>Åpne forrige utkast</button>}<button className="generate-button" type="button" onClick={openToneDialog}>Generer dagens tall <span aria-hidden="true">→</span></button></div></section>
      {error && <p className="message error" role="alert">{error}</p>}

      {showToneDialog && <div className="modal-backdrop" role="presentation"><section className="tone-dialog" role="dialog" aria-modal="true" aria-labelledby="tone-title" tabIndex={-1} ref={toneDialogRef}><button className="modal-close" type="button" onClick={() => setShowToneDialog(false)} aria-label="Lukk tonevindu">×</button><p className="eyebrow">SISTE STEG</p><h2 id="tone-title">Velg tonen på utkastet</h2><p className="section-intro">Tall og navn sendes ikke til AI. Dette styrer bare formuleringene.</p><label className="slider-field"><span><strong>Resultat</strong><output>{resultLabels[form.resultLevel - 1]}</output></span><input type="range" min="1" max="5" step="1" value={form.resultLevel} onChange={(event) => update({ resultLevel: Number(event.target.value) })} /><small>Beskriver stemningen rundt dagens resultat.</small></label><label className="slider-field"><span><strong>Glaze</strong><output>{glazeLabels[form.glazeLevel - 1]}</output></span><input type="range" min="1" max="5" step="1" value={form.glazeLevel} onChange={(event) => update({ glazeLevel: Number(event.target.value) })} /><small>Styrer hvor mye ekstra anerkjennelse AI-malen skal ha.</small></label><div className="modal-actions"><button className="text-button" type="button" onClick={() => setShowToneDialog(false)} disabled={loading}>Tilbake</button><button className="generate-button" type="button" onClick={generateDraft} disabled={loading}>{loading ? 'Lager utkast…' : 'Generer utkast'} <span aria-hidden="true">→</span></button></div></section></div>}

      {showToneDialog && <div className="modal-backdrop" role="presentation"><section className="tone-dialog" role="dialog" aria-modal="true" aria-labelledby="tone-title" tabIndex={-1} ref={toneDialogRef}><button className="modal-close" type="button" onClick={() => setShowToneDialog(false)} aria-label="Lukk tonevindu">×</button><p className="eyebrow">SISTE STEG</p><h2 id="tone-title">Velg tonen på utkastet</h2><p className="section-intro">Tall og navn sendes ikke til AI. Dette styrer bare formuleringene.</p><label className="slider-field"><span><strong>Resultat</strong><output>{resultLabels[form.resultLevel - 1]}</output></span><input type="range" min="1" max="5" step="1" value={form.resultLevel} onChange={(event) => update({ resultLevel: Number(event.target.value) })} /><small>Beskriver stemningen rundt dagens resultat.</small></label><label className="slider-field"><span><strong>Glaze</strong><output>{glazeLabels[form.glazeLevel - 1]}</output></span><input type="range" min="1" max="5" step="1" value={form.glazeLevel} onChange={(event) => update({ glazeLevel: Number(event.target.value) })} /><small>Styrer hvor mye ekstra anerkjennelse AI-malen skal ha.</small></label><div className="modal-actions"><button className="text-button" type="button" onClick={() => setShowToneDialog(false)} disabled={loading}>Tilbake</button><button className="generate-button" type="button" onClick={generateDraft} disabled={loading}>{loading ? 'Lager utkast…' : 'Generer utkast'} <span aria-hidden="true">→</span></button></div></section></div>}
      {showDraftDialog && form.draft && <div className="modal-backdrop" role="presentation"><section className="tone-dialog draft-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-dialog-title" tabIndex={-1} ref={draftDialogRef}><button className="modal-close" type="button" onClick={() => setShowDraftDialog(false)} aria-label="Lukk utkastvindu" disabled={isTyping}>×</button><p className="eyebrow">UTKAST</p><h2 id="draft-dialog-title">{isTyping ? 'Skriver utkastet…' : 'Se over før du deler'}</h2><p className="section-intro">Du kan redigere teksten før du kopierer den til Teams.</p><textarea ref={draftRef} className="draft-area" rows={15} value={form.draft} onChange={(event) => update({ draft: event.target.value })} aria-label="Redigerbart Teams-utkast" readOnly={isTyping} />{!isTyping && unresolvedTokens.length > 0 && <p className="message warning">Disse plassholderne mangler lokale data eller er ukjente: {unresolvedTokens.join(', ')}. De beholdes i teksten.</p>}{copyStatus && <p className="message success">{copyStatus}</p>}<div className="modal-actions"><button className="text-button" type="button" onClick={() => setShowDraftDialog(false)} disabled={isTyping}>Lukk</button><button className="copy-button" type="button" onClick={copyDraft} disabled={isTyping}>Kopier til Teams</button></div></section></div>}
    </main>
  )
}

export default App
