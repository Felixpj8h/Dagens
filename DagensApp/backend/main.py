import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field

from prompt import SYSTEM_PROMPT

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY mangler. Legg den inn i backend/.env"
    )

client = genai.Client(api_key=api_key)

app = FastAPI(
    title="Dagens tall API",
    description="Lager anonymiserte Teams-maler via Gemini.",
)


class GenerateReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resultLevel: int = Field(ge=1, le=5)
    glazeLevel: int = Field(ge=1, le=5)


class GenerateReportResponse(BaseModel):
    template: str


RESULT_LEVELS = {
    1: "langt under budsjett",
    2: "rett under budsjett",
    3: "på budsjett",
    4: "over budsjett",
    5: "knust budsjettet",
}

GLAZE_LEVELS = {
    1: "saklig",
    2: "litt ekstra positiv",
    3: "varm og anerkjennende",
    4: "entusiastisk",
    5: "full glaze",
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
    glaze = GLAZE_LEVELS[request.glazeLevel]

    user_prompt = f"""
Lag en Teams-klar dagsrapportmal.

Resultatstemning: {result}
Glaze-nivå: {glaze}

Viktig:
- Du har ikke tilgang til faktiske tall, navn eller salg.
- Bruk bare de tillatte plassholderne fra systeminstruksjonen.
- Returner bare selve tekstmalen, uten forklaring eller kodeblokk.
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

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Kunne ikke generere en mal fra Gemini. Prøv igjen.",
        )