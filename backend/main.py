"""
Main Entrypoint for Omnisage Medical Record Aggregator.

This module initializes the FastAPI web application, configures cross-origin resource
sharing (CORS), mounts routers (uploads, records, sharing, and AI), serves the built
frontend (when present) so the app can run as a single website, creates the database
schema and seed patient data on startup, and verifies Ollama connectivity.
"""

import os

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.config import settings
from backend.database import engine, Base, SessionLocal
from backend.models import User
from backend.routers import upload_router, records_router, sharing_router
from backend.routers import ai_router, auth_router
from backend.routers.auth_router import _hash_password

# Initialize database schemas (includes all AI tables)
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="A centralized personal health record portal aggregating PDFs, images, and DICOM imaging with AI-powered insights.",
    version="2.0.0",
    debug=settings.DEBUG
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    """
    FastAPI startup event listener. Seeds the default user account and
    verifies Ollama server connectivity for AI features.
    """
    db = SessionLocal()
    try:
        # Seed default demo patient account (email/password shown on the login page)
        default_user = db.query(User).filter(User.id == 1).first()
        if not default_user:
            default_user = User(
                id=1,
                email="patient@omnisage.com",
                full_name="Alex Mercer",
                hashed_password=_hash_password("omnisage123"),
            )
            db.add(default_user)
            db.commit()
            print("Default demo patient seeded successfully.")
        elif "$" not in (default_user.hashed_password or ""):
            # Legacy/placeholder hash from before auth was wired up — replace it
            # with a real PBKDF2 hash so the demo credentials on the login page work.
            default_user.hashed_password = _hash_password("omnisage123")
            db.commit()
            print("Default demo patient password hash upgraded.")
    except Exception as e:
        print(f"Error seeding default user: {str(e)}")
    finally:
        db.close()

    # Verify Ollama connectivity
    try:
        from backend.services.ollama_client import ollama_client
        if ollama_client.is_available():
            models = ollama_client.list_models()
            print(f"Ollama connected. Available models: {', '.join(models) if models else 'none'}")
            if settings.OLLAMA_MODEL not in " ".join(models):
                print(f"WARNING: Model '{settings.OLLAMA_MODEL}' not found. Pull it with: ollama pull {settings.OLLAMA_MODEL}")
            if settings.OLLAMA_EMBED_MODEL not in " ".join(models):
                print(f"WARNING: Embedding model '{settings.OLLAMA_EMBED_MODEL}' not found. Pull it with: ollama pull {settings.OLLAMA_EMBED_MODEL}")
        else:
            print("WARNING: Ollama server not reachable. AI features will be unavailable.")
            print("Start Ollama with: ollama serve")
    except Exception as e:
        print(f"WARNING: Could not check Ollama status: {e}")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """
    Simple health check endpoint to verify backend status.

    Returns:
        dict: A status confirmation message.
    """
    return {"status": "healthy", "service": settings.PROJECT_NAME}


# Mount API routers
app.include_router(auth_router.router)
app.include_router(upload_router.router)
app.include_router(records_router.router)
app.include_router(sharing_router.router)
app.include_router(ai_router.router)


# ── Serve the built frontend, if present ──────────────────────────────────────
#
# `Omnisage.bat` runs `npm run build` and expects this server to serve the whole
# site (frontend + API) as one website. This route is only registered when
# frontend/dist exists (i.e. after a production build) so the plain dev workflow
# (`start.bat`, Vite dev server on :5173) is unaffected — in that mode the
# frontend/dist folder doesn't exist and the block below is skipped entirely.
FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"
)

if os.path.isdir(FRONTEND_DIST):
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        """
        Serves the built single-page frontend for every route this app doesn't
        otherwise handle. Registered last, so it only ever runs for requests
        that didn't match an /api/... route (or /docs, /openapi.json, etc.)
        above it.

        A request for a real build asset (JS/CSS bundle, favicon, ...) is
        served directly. Everything else — including client-side routes like
        /share/<uuid> that only exist in the browser — falls back to
        index.html so the SPA's own routing can take over.
        """
        if full_path.startswith("api/"):
            # Don't silently serve HTML for a mistyped/removed API endpoint.
            raise HTTPException(status_code=404, detail="Not found")

        candidate_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate_path):
            # Vite content-hashes every built asset filename (e.g.
            # index-DcqxWc11.js), so a given URL's contents never change —
            # safe, and good for load times, to let the browser cache these
            # aggressively/indefinitely.
            return FileResponse(candidate_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})

        # index.html itself is NOT content-hashed and DOES change every time
        # the site is rebuilt (Omnisage.bat always rebuilds on launch), so it
        # must never be cached — otherwise a browser tab left open from a
        # previous run (or the browser's own heuristic caching) can keep
        # showing an old build's UI indefinitely even after new code has been
        # shipped and the server restarted, which looks exactly like "my fix
        # didn't take" even though it did.
        return FileResponse(
            os.path.join(FRONTEND_DIST, "index.html"),
            headers={"Cache-Control": "no-store, must-revalidate"},
        )
else:
    print(
        "NOTE: frontend/dist not found — only the API is being served here. "
        "Run 'npm run build' in frontend/ (Omnisage.bat does this automatically), "
        "or use the Vite dev server (start.bat) for local development."
    )


if __name__ == "__main__":
    # Start ASGI server
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
