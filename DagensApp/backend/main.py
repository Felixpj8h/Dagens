import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field

from prompt import SYSTEM_PROMPT
from references import GLAZE_REFERENCES

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY mangler. Legg den inn i backend/.env"
    )

client = genai.Client(api_key=api_key)

app = FastAPI(
    title="Dagens tall API",
    description="Lager Teams-maler via Gemini uten å sende tall eller selgerdata.",
)


class Shoutout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: int = Field(ge=1, le=10)
    note: str = Field(min_length=1, max_length=500)


class NotableSale(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: int = Field(ge=1, le=3)
    note: str = Field(min_length=1, max_length=500)


class GenerateReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resultLevel: int = Field(ge=1, le=5)
    glazeLevel: int = Field(ge=1, le=5)
    shoutouts: list[Shoutout] = Field(default_factory=list, max_length=10)
    notableSales: list[NotableSale] = Field(default_factory=list, max_length=3)
    asoComment: str | None = Field(default=None, max_length=1000)
    npsScore: int | None = Field(default=None, ge=0, le=100)


class GenerateReportResponse(BaseModel):
    template: str


RESULT_LEVELS = {
    1: "langt under budsjett",
    2: "rett under budsjett",
    3: "på budsjett",
    4: "over budsjett",
    5: "knust budsjettet",
}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post(
    "/api/generate-daily-report",
    response_model=GenerateReportResponse,
)
def generate_daily_report(request: GenerateReportRequest):
    result = RESULT_LEVELS[request.resultLevel]
    reference = GLAZE_REFERENCES[request.glazeLevel]

    shoutout_context = "\n".join(
        f"- [SHOUTOUT{shoutout.slot}_NAVN]: {shoutout.note}"
        for shoutout in request.shoutouts
    )

    if not shoutout_context:
        shoutout_context = "Ingen shoutouts i dag."

    notable_sales_context = "\n".join(
        f"- [S{sale.slot}]: {sale.note}"
        for sale in request.notableSales
    )

    if not notable_sales_context:
        notable_sales_context = "Ingen merkverdige salg i dag."

    aso_context = request.asoComment or "Ingen ASO-kommentar i dag."
    nps_context = str(request.npsScore) if request.npsScore is not None else "Ingen NPS-score i dag."

    user_prompt = f"""
Lag en Teams-klar dagsrapportmal for en norsk elektronikk kjede på bokmål.

Resultatstemning: {result}

Skrivestilreferanse:
{reference}

Shoutouts som skal integreres naturlig i teksten:
{shoutout_context}

Merkverdige salg som skal integreres naturlig i teksten:
{notable_sales_context}

ASO-kommentar:
{aso_context}

NPS-score:
{nps_context}

Viktig:
- Du har ikke tilgang til faktiske tall eller navn.
- Bruk plassholderne fra systeminstruksjonen for budsjett, inntjening,
  avvik og toppselgere.
- Integrer hvert shoutout-notat naturlig, men bruk den angitte [SHOUTOUT..._NAVN]-
  plassholderen for navnet.
- Integrer hvert salgsnotat naturlig, men bruk den angitte [S1], [S2] eller [S3]-
  plassholderen for selgernavnet.
- ASO betyr After Sales Operations: laget som jobber i kassen og supportdisken.
- NPS er kundeopplevelsesscore fra 0 til 100; 80 eller høyere er bra.
- Integrer ASO-kommentaren og NPS-scoren naturlig når de er oppgitt. Bruk direkte tekst
  og tall, ikke [ASO] eller [NPS]-plassholdere.
- Ikke nevn ASO eller NPS når det står at informasjonen mangler.
- Bruk bare notatene og plassholderne som er gitt over.
- Returner bare selve tekstmalen, uten forklaring eller kodeblokk.
- Helst ikke bruk ordet Avik.
- Ikke bruk Mdash "–"
- Forkortelser som du kan bli kjent med: GM (Margin) ASO (after sales Operations (Gjengen som jobber i kassen og i supportdisken)) WIN (winner produkter (god inntjening)) NPS (kundeopplevelses score), disse tregnes ikke å bli forklart.
- Når ASO er lagt in som shoutout er det til hele laget, ikke bare en person.
- Husk vær kreativ, ikke bare skriv om navnen på referansene. Gjerne kom på egene sammenligninere om det passer.
- Ikke nevn ting som ikke er lagt inn.
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
            ),
        )

        template = (response.text or "").strip()

        if not template:
            raise ValueError("Gemini returnerte en tom mal.")

        return GenerateReportResponse(template=template)

    except Exception as error:
        error_text = str(error)

        if "RESOURCE_EXHAUSTED" in error_text or "429" in error_text:
            detail = (
                "Gemini-kvoten er brukt opp akkurat nå. Vent litt før du prøver igjen, "
                "eller sjekk kvoten og faktureringen i Google AI Studio."
            )
            status_code = 429
        elif "API key" in error_text or "API_KEY" in error_text or "401" in error_text:
            detail = "Gemini API-nøkkelen ble ikke godtatt. Kontroller GEMINI_API_KEY i backend/.env."
            status_code = 502
        elif "403" in error_text or "PERMISSION_DENIED" in error_text:
            detail = "Gemini-kontoen mangler tilgang til modellen. Sjekk prosjekt, API-nøkkel og fakturering i Google AI Studio."
            status_code = 502
        else:
            detail = "Gemini kunne ikke lage utkastet. Kontroller internettforbindelsen og prøv igjen."
            status_code = 502

        print(f"Gemini generation failed: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=status_code,
            detail=detail,
        ) from error
