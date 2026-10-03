# Publisering på Render

## Før du publiserer

1. Opprett en Google OAuth-klient for **Web application** i Google Cloud Console.
2. Når du har fått frontend-URL-en fra Render, legg den inn under **Authorized JavaScript origins**.
3. Legg disse verdiene inn i `backend/.env` for lokal kjøring:

```env
GEMINI_API_KEY=din_gemini_nokkel
GOOGLE_CLIENT_ID=din_google_oauth_client_id
ALLOWED_EMAILS=din_google_epost
FRONTEND_ORIGIN=http://localhost:5173
ENVIRONMENT=development
```

4. Kopier `.env.local.example` til `.env.local` i prosjektroten og fyll inn `VITE_GOOGLE_CLIENT_ID`. La `VITE_API_URL` stå tom lokalt, slik at Vite-proxyen brukes.

5. Opprett et privat GitHub-repository. Bekreft at `backend/.env`, `backend/.venv/` og `backend/__pycache__/` ikke er med i Git.

## Backend: Render Web Service

Opprett en **Web Service** fra GitHub-repositoryet.

| Felt | Verdi |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |

Legg inn disse hemmelige miljøvariablene i Render:

```text
GEMINI_API_KEY
GOOGLE_CLIENT_ID
ALLOWED_EMAILS
FRONTEND_ORIGIN
ENVIRONMENT=production
```

Bruk `http://localhost:5173` som midlertidig `FRONTEND_ORIGIN` ved første deploy. Du erstatter den med frontend-URL-en senere.

## Frontend: Render Static Site

Opprett en **Static Site** fra samme repository.

| Felt | Verdi |
| --- | --- |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |

Legg inn disse build-variablene:

```text
VITE_API_URL=https://din-backend.onrender.com
VITE_GOOGLE_CLIENT_ID=din_google_oauth_client_id
```

Når Render gir deg frontend-URL-en:

1. Legg URL-en til under Google OAuth-klientens **Authorized JavaScript origins**.
2. Sett backendens `FRONTEND_ORIGIN` til nøyaktig samme URL.
3. Deploy backend på nytt.
4. Deploy frontend på nytt.

## Sluttest

- Åpne siden i inkognito og bekreft at Google-innlogging vises.
- Din tillatte e-post kan generere utkast.
- En annen Google-konto får `403`.
- Uten token får genereringsruten `401`.
- Mer enn seks genereringer i løpet av ett minutt gir `429`.
- Bekreft at `.env` aldri vises i GitHub-repositoryet.
