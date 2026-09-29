"""
Ollama Client Module for Omnisage Medical Record Aggregator.

This module provides a thin wrapper around the Ollama HTTP API for generating
text completions and computing text embeddings. All AI services use this client
as their LLM backend.
"""

import json
from typing import Optional

import requests
from backend.config import settings


class OllamaClient:
    """
    HTTP client for interacting with a local Ollama server.

    Provides methods for text generation (chat completions) and text
    embeddings via the Ollama REST API.
    """

    def __init__(self):
        """
        Initializes the Ollama client with the configured base URL and model names.
        """
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL
        self.embed_model = settings.OLLAMA_EMBED_MODEL
        self._resolved = False  # becomes True once self.model/self.embed_model
                                 # have been checked against what's actually installed

    def _resolve_models(self) -> None:
        """
        Makes sure `self.model` / `self.embed_model` refer to models that are
        actually pulled on this Ollama server, falling back to whatever IS
        installed instead of blindly sending requests for a configured model
        name that doesn't exist (which Ollama answers with a 404, not a
        helpful error).

        Cached on the instance once it actually succeeds, and is a no-op on
        later calls once the configured models are confirmed present. If
        Ollama isn't reachable yet (e.g. it's still starting up — Omnisage's
        launcher only waits ~2 seconds before moving on), this does NOT cache
        a permanent "gave up" state: it retries on the next call instead.
        Without this, the very first AI request made while Ollama was merely
        still booting would set `self.model`/`self.embed_model` in stone at
        their original (possibly-not-installed) configured values for the
        rest of the process's lifetime — so every AI feature would keep
        404ing even minutes later once Ollama was fully up and running.
        """
        if self._resolved:
            return

        available = self.list_models()
        if not available:
            return  # Ollama unreachable / still starting / nothing installed
                     # yet — leave _resolved False so the next call retries
                     # instead of a real connection error being fatal for
                     # every subsequent request this process ever makes.

        self._resolved = True  # only cache once we actually have a model list

        def find_match(preferred: str) -> Optional[str]:
            if preferred in available:
                return preferred
            # Ollama model names are "name:tag" — match on the base name too,
            # so e.g. a configured "phi3:mini" still matches an installed
            # "phi3:latest".
            base = preferred.split(":")[0]
            for m in available:
                if m.split(":")[0] == base:
                    return m
            return None

        resolved_model = find_match(self.model)
        if resolved_model is None:
            resolved_model = available[0]
            print(
                f"WARNING: Configured Ollama model '{self.model}' is not installed. "
                f"Using '{resolved_model}' instead. Run 'ollama pull {self.model}' "
                f"to use the originally configured model."
            )
        self.model = resolved_model

        resolved_embed = find_match(self.embed_model)
        if resolved_embed is None:
            # No dedicated embedding model installed — fall back to whatever
            # chat model is available. Ollama's /api/embed works with regular
            # generative models too (lower quality embeddings, but functional
            # rather than completely broken).
            resolved_embed = available[0]
            print(
                f"WARNING: Configured embedding model '{self.embed_model}' is not "
                f"installed. Using '{resolved_embed}' instead (results will be "
                f"lower quality). Run 'ollama pull {self.embed_model}' for the "
                f"originally configured embedding model."
            )
        self.embed_model = resolved_embed

    def is_available(self) -> bool:
        """
        Checks whether the Ollama server is reachable and responsive.

        Returns:
            bool: True if the server responds to a health check.
        """
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def list_models(self) -> list[str]:
        """
        Lists all models currently available on the Ollama server.

        Returns:
            list[str]: Names of locally available models.
        """
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=10)
            resp.raise_for_status()
            return [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            return []

    def generate(self, prompt: str, system: str = "", temperature: float = 0.3) -> str:
        """
        Generates a text completion using the configured LLM model.

        Args:
            prompt (str): The user prompt / instruction.
            system (str): Optional system prompt to set behavior context.
            temperature (float): Sampling temperature (0.0 = deterministic, 1.0 = creative).

        Returns:
            str: The generated text response.

        Raises:
            RuntimeError: If the Ollama server returns an error or is unreachable.
        """
        self._resolve_models()
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": 2048,
            }
        }

        try:
            resp = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=120
            )
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
        except requests.exceptions.ConnectionError:
            raise RuntimeError(
                "Ollama server is not running. Start it with: ollama serve"
            )
        except requests.exceptions.Timeout:
            raise RuntimeError(
                "Ollama request timed out. The model may be loading or the prompt too long."
            )
        except Exception as e:
            raise RuntimeError(f"Ollama generation failed: {str(e)}")

    def embed(self, text: str) -> list[float]:
        """
        Generates a vector embedding for the given text.

        Args:
            text (str): The text to embed.

        Returns:
            list[float]: A 768-dimensional embedding vector.

        Raises:
            RuntimeError: If embedding generation fails.
        """
        self._resolve_models()
        payload = {
            "model": self.embed_model,
            "input": text,
        }

        try:
            resp = requests.post(
                f"{self.base_url}/api/embed",
                json=payload,
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            # Ollama returns embeddings in the "embeddings" key (list of lists)
            embeddings = data.get("embeddings", [])
            if embeddings and len(embeddings) > 0:
                return embeddings[0]
            # Fallback for older API format
            return data.get("embedding", [])
        except requests.exceptions.ConnectionError:
            raise RuntimeError("Ollama server is not running.")
        except Exception as e:
            raise RuntimeError(f"Ollama embedding failed: {str(e)}")

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generates embeddings for multiple texts sequentially.

        Args:
            texts (list[str]): List of text strings to embed.

        Returns:
            list[list[float]]: List of embedding vectors.
        """
        return [self.embed(t) for t in texts]


# Singleton instance
ollama_client = OllamaClient()
