import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Seller = { name: string; earnings: string; notableSale: string }
type Shoutout = { id: string; name: string; note: string }

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
      sellers:
        parsed.sellers?.length === 3 ? parsed.sellers : defaultState.sellers,
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form))
  }, [form])

  const budget = toNumber(form.budget)
  const earnings = toNumber(form.earnings)

  const hasNumbers =
    Number.isFinite(budget) &&
    Number.isFinite(earnings) &&
    form.budget !== '' &&
    form.earnings !== ''

  const difference = hasNumbers ? earnings - budget : 0
  const percentage =
    hasNumbers && budget !== 0 ? (difference / budget) * 100 : 0

  const tokens = useMemo(() => {
    const values: Record<string, string> = {}

    if (hasNumbers) {
      values.B = money.format(budget)
      values.I = money.format(earnings)

      const direction =
        difference === 0
          ? 'på budsjett'
          : difference > 0
            ? 'over budsjett'
            : 'under budsjett'

      values.AVVIK = `${money.format(Math.abs(difference))} (${Math.abs(
        percentage,
      ).toLocaleString('nb-NO', {
        maximumFractionDigits: 1,
      })} % ${direction})`
    }

    form.sellers.forEach((seller, index) => {
      const number = index + 1

      if (seller.name.trim()) {
        values[`S${number}`] = seller.name.trim()
      }

      const sellerEarnings = toNumber(seller.earnings)

      if (seller.earnings !== '' && Number.isFinite(sellerEarnings)) {
        values[`SI${number}`] = money.format(sellerEarnings)
      }

      if (seller.notableSale.trim()) {
        values[`MS${number}`] = seller.notableSale.trim()
      }
    })

    form.shoutouts.forEach((shoutout, index) => {
      const number = index + 1

      if (shoutout.name.trim()) {
        values[`SHOUTOUT${number}_NAVN`] = shoutout.name.trim()
      }

      if (shoutout.note.trim()) {
        values[`SHOUTOUT${number}_TEKST`] = shoutout.note.trim()
      }
    })

    if (form.asoComment.trim()) {
      values.ASO = form.asoComment.trim()
    }

    if (form.npsScore.trim()) {
      values.NPS = form.npsScore.trim()
    }

    return values
  }, [budget, difference, earnings, form, hasNumbers, percentage])

  const unresolvedTokens = useMemo(() => {
    const matches = form.draft.match(/\[[A-Z0-9_]+\]/g) ?? []
    return [...new Set(matches)]
  }, [form.draft])

  const update = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const updateSeller = (index: number, patch: Partial<Seller>) => {
    const sellers = form.sellers.map((seller, sellerIndex) =>
      sellerIndex === index ? { ...seller, ...patch } : seller,
    )

    update({ sellers })
  }

  const updateShoutout = (id: string, patch: Partial<Shoutout>) => {
    update({
      shoutouts: form.shoutouts.map((shoutout) =>
        shoutout.id === id ? { ...shoutout, ...patch } : shoutout,
      ),
    })
  }

  const validate = () => {
    if (!hasNumbers || budget < 0 || earnings < 0) {
      return 'Skriv inn gyldig budsjett og inntjening før du genererer.'
    }

    for (const [index, seller] of form.sellers.entries()) {
      if (
        !seller.name.trim() ||
        seller.earnings === '' ||
        !Number.isFinite(toNumber(seller.earnings))
      ) {
        return `Fyll inn navn og inntjening for toppselger ${index + 1}.`
      }
    }

    if (
      form.shoutouts.some(
        (item) => Boolean(item.name.trim()) !== Boolean(item.note.trim()),
      )
    ) {
      return 'Hver shoutout må ha både navn og begrunnelse.'
    }

    if (form.npsScore.trim()) {
      const npsScore = Number(form.npsScore)
      if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 100) {
        return 'NPS må være et helt tall fra 0 til 100.'
      }
    }

    return ''
  }

  const replaceTokens = (template: string) =>
    template.replace(
      /\[([A-Z0-9_]+)\]/g,
      (fullToken, key: string) => tokens[key] ?? fullToken,
    )

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
        body: JSON.stringify({
          resultLevel: form.resultLevel,
          glazeLevel: form.glazeLevel,
          shoutouts: form.shoutouts
            .filter((shoutout) => shoutout.name.trim() && shoutout.note.trim())
            .map((shoutout, index) => ({
              slot: index + 1,
              note: shoutout.note.trim(),
            })),
          notableSales: form.sellers
            .filter((seller) => seller.name.trim() && seller.notableSale.trim())
            .map((seller, index) => ({
              slot: index + 1,
              note: seller.notableSale.trim(),
            })),
          asoComment: form.asoComment.trim() || null,
          npsScore: form.npsScore.trim() ? Number(form.npsScore) : null,
        }),
      })

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null)
        const message =
          errorData &&
          typeof errorData === 'object' &&
          'detail' in errorData &&
          typeof errorData.detail === 'string'
            ? errorData.detail
            : 'Kunne ikke lage utkastet akkurat nå.'

        throw new Error(message)
      }

      const data: unknown = await response.json()

      if (
        !data ||
        typeof data !== 'object' ||
        !('template' in data) ||
        typeof data.template !== 'string'
      ) {
        throw new Error('Backend returnerte ikke en gyldig mal.')
      }

      update({ draft: replaceTokens(data.template) })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Noe gikk galt ved generering.',
      )
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

  const deviationText = !hasNumbers
    ? 'Legg inn tall for å se avvik'
    : difference === 0
      ? 'På budsjett'
      : `${difference > 0 ? '+' : '−'}${money.format(
          Math.abs(difference),
        )} · ${Math.abs(percentage).toLocaleString('nb-NO', {
          maximumFractionDigits: 1,
        })} % ${difference > 0 ? 'over' : 'under'}`

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">DAGSRAPPORT</p>
          <h1>Dagens tall</h1>
          <p>Lag et Teams-klart utkast. Tall og selgerdata holdes lokalt.</p>
        </div>

        <div className="privacy-badge">
          <span aria-hidden="true">✦</span>
          Tall og selgerdata blir på din enhet
        </div>
      </header>

      <section className="panel numbers-panel" aria-labelledby="numbers-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 · RESULTAT</p>
            <h2 id="numbers-title">Dagens inntjening</h2>
          </div>

          <div
            className={`deviation ${
              hasNumbers && difference >= 0 ? 'positive' : 'negative'
            }`}
          >
            {deviationText}
          </div>
        </div>

        <div className="field-grid two-columns">
          <label>
            Daglig budsjett
            <input
              inputMode="decimal"
              value={form.budget}
              onChange={(event) => update({ budget: event.target.value })}
              placeholder="f.eks. 125 000"
            />
          </label>

          <label>
            Dagens inntjening
            <input
              inputMode="decimal"
              value={form.earnings}
              onChange={(event) => update({ earnings: event.target.value })}
              placeholder="f.eks. 132 500"
            />
          </label>
        </div>
      </section>

      <section className="panel" aria-labelledby="sellers-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">02 · TOPP 3</p>
            <h2 id="sellers-title">Selgerne som leverte</h2>
          </div>

          <span className="muted">Valgfritt: merkverdige salg</span>
        </div>

        <div className="seller-grid">
          {form.sellers.map((seller, index) => (
            <article className="seller-card" key={index}>
              <span className="rank">#{index + 1}</span>

              <label>
                Navn
                <input
                  value={seller.name}
                  onChange={(event) =>
                    updateSeller(index, { name: event.target.value })
                  }
                  placeholder="Selgernavn"
                />
              </label>

              <label>
                Inntjening
                <input
                  inputMode="decimal"
                  value={seller.earnings}
                  onChange={(event) =>
                    updateSeller(index, { earnings: event.target.value })
                  }
                  placeholder="0"
                />
              </label>

              <label>
                Merkverdig salg
                <textarea
                  rows={3}
                  value={seller.notableSale}
                  onChange={(event) =>
                    updateSeller(index, { notableSale: event.target.value })
                  }
                  placeholder="Valgfri detalj til rapporten"
                />
              </label>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="shoutout-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">03 · EKSTRA INNSATS</p>
            <h2 id="shoutout-title">Shoutouts</h2>
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              update({
                shoutouts: [
                  ...form.shoutouts,
                  { id: newId(), name: '', note: '' },
                ],
              })
            }
          >
            + Legg til shoutout
          </button>
        </div>

        {form.shoutouts.length === 0 ? (
          <p className="empty-state">
            Ingen enda. Legg til en person som fortjener en ekstra anerkjennelse.
          </p>
        ) : (
          <div className="shoutout-list">
            {form.shoutouts.map((shoutout) => (
              <div className="shoutout-row" key={shoutout.id}>
                <label>
                  Navn
                  <input
                    value={shoutout.name}
                    onChange={(event) =>
                      updateShoutout(shoutout.id, { name: event.target.value })
                    }
                    placeholder="Navn"
                  />
                </label>

                <label>
                  Hva gjorde personen?
                  <input
                    value={shoutout.note}
                    onChange={(event) =>
                      updateShoutout(shoutout.id, { note: event.target.value })
                    }
                    placeholder="Kort begrunnelse"
                  />
                </label>

                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Fjern shoutout for ${shoutout.name || 'ansatt'}`}
                  onClick={() =>
                    update({
                      shoutouts: form.shoutouts.filter(
                        (item) => item.id !== shoutout.id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel aso-nps-panel" aria-labelledby="aso-nps-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">04 · KUNDE OG SUPPORT</p>
            <h2 id="aso-nps-title">ASO og NPS</h2>
          </div>
          <span className="muted">Valgfritt · sendes til AI</span>
        </div>

        <div className="field-grid two-columns">
          <label>
            ASO-kommentar
            <textarea
              rows={3}
              value={form.asoComment}
              onChange={(event) => update({ asoComment: event.target.value })}
              placeholder="F.eks. solid flyt i kassen og god hjelp i supportdisken"
            />
            <small>Kommentar til After Sales Operations – kasse og support.</small>
          </label>

          <label>
            NPS-score
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="numeric"
              value={form.npsScore}
              onChange={(event) => update({ npsScore: event.target.value })}
              placeholder="0–100"
            />
            <small>Kundeopplevelse. 80 eller høyere regnes som bra.</small>
          </label>
        </div>
      </section>

      <section className="panel sliders-panel" aria-labelledby="tone-title">
        <div>
          <p className="eyebrow">05 · TONE</p>
          <h2 id="tone-title">Hvordan skal rapporten føles?</h2>
        </div>

        <label className="slider-field">
          <span>
            <strong>Resultat</strong>
            <output>{resultLabels[form.resultLevel - 1]}</output>
          </span>

          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={form.resultLevel}
            onChange={(event) =>
              update({ resultLevel: Number(event.target.value) })
            }
          />

          <small>Beskriver bare stemningen. Ingen tall sendes til AI.</small>
        </label>

        <label className="slider-field">
          <span>
            <strong>Glaze</strong>
            <output>{glazeLabels[form.glazeLevel - 1]}</output>
          </span>

          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={form.glazeLevel}
            onChange={(event) =>
              update({ glazeLevel: Number(event.target.value) })
            }
          />

          <small>Styrer hvor mye ekstra anerkjennelse AI-malen skal ha.</small>
        </label>
      </section>

      <section className="generate-panel">
        <div>
          <h2>Klar for Teams?</h2>
          <p>
            Resultatnivå, glaze-nivå, ASO, NPS og anonyme notater går til backend.
            Tall, navn og selgerinntekt blir værende lokalt.
          </p>
        </div>

        <button
          className="generate-button"
          type="button"
          disabled={loading}
          onClick={generateDraft}
        >
          {loading ? 'Lager utkast…' : 'Generer dagens tall'}
          <span aria-hidden="true">→</span>
        </button>
      </section>

      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      {form.draft && (
        <section className="panel draft-panel" aria-labelledby="draft-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UTKAST</p>
              <h2 id="draft-title">Se over før du deler</h2>
            </div>

            <button className="copy-button" type="button" onClick={copyDraft}>
              Kopier til Teams
            </button>
          </div>

          <textarea
            className="draft-area"
            rows={13}
            value={form.draft}
            onChange={(event) => update({ draft: event.target.value })}
            aria-label="Redigerbart Teams-utkast"
          />

          {unresolvedTokens.length > 0 && (
            <p className="message warning">
              Disse plassholderne mangler lokale data eller er ukjente:{' '}
              {unresolvedTokens.join(', ')}. De beholdes i teksten.
            </p>
          )}

          {copyStatus && <p className="message success">{copyStatus}</p>}
        </section>
      )}
    </main>
  )
}

export default App
