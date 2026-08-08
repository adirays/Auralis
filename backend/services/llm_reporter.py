"""
services/llm_reporter.py — AI-Generated Structural Analysis Reports

Future service for producing natural-language inspection reports using
a configurable LLM provider (e.g. OpenAI, Google Gemini, local Ollama).

The interface is designed so that router endpoints can call
``generate_report()`` and ``generate_summary()`` today — they will
receive a clear ``NotImplementedError`` until the LLM backend is wired up.

Configuration:
    Set ``LLM_PROVIDER`` and ``LLM_API_KEY`` in your ``.env`` file.
    Supported providers (planned): openai, gemini, ollama.
"""

import logging
import os
from typing import Any, Literal

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "none")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")

LLMProvider = Literal["openai", "gemini", "ollama", "none"]


# ── Public Interface ──────────────────────────────────────────────────────────

async def generate_report(
    scan_id: str,
    anomalies: list[dict[str, Any]],
    diagnostics: str,
    *,
    provider: LLMProvider | None = None,
    max_tokens: int = 2048,
) -> dict[str, Any]:
    """
    Generate a full structural inspection report from scan results.

    The report includes an executive summary, damage assessment,
    repair recommendations, and code-conformance analysis formatted
    for ACI 318-19.

    Args:
        scan_id: Unique scan identifier.
        anomalies: List of anomaly dicts from the detection pipeline.
        diagnostics: Raw diagnostics string from the analyzer.
        provider: Override the default LLM provider for this call.
        max_tokens: Maximum output length for the LLM response.

    Returns:
        A dict with keys: ``report_text``, ``provider_used``, ``token_count``.

    Raises:
        NotImplementedError: LLM integration is not yet configured.
    """
    effective_provider = provider or LLM_PROVIDER
    if effective_provider == "none":
        raise NotImplementedError(
            "LLM reporting is not configured. "
            "Set LLM_PROVIDER and LLM_API_KEY in your .env file. "
            "Supported providers: openai, gemini, ollama."
        )

    # Future: dispatch to the appropriate LLM client
    raise NotImplementedError(
        f"LLM provider '{effective_provider}' integration is planned but not yet implemented."
    )


async def generate_summary(
    anomalies: list[dict[str, Any]],
    *,
    provider: LLMProvider | None = None,
) -> str:
    """
    Generate a concise one-paragraph summary from anomaly data.

    Useful for dashboard cards and notification previews.

    Args:
        anomalies: List of anomaly dicts.
        provider: Override the default LLM provider.

    Returns:
        A plain-text summary string.

    Raises:
        NotImplementedError: LLM integration is not yet configured.
    """
    effective_provider = provider or LLM_PROVIDER
    if effective_provider == "none":
        raise NotImplementedError(
            "LLM reporting is not configured. "
            "Set LLM_PROVIDER and LLM_API_KEY in your .env file."
        )

    raise NotImplementedError(
        f"LLM provider '{effective_provider}' integration is planned but not yet implemented."
    )


__all__ = [
    "generate_report",
    "generate_summary",
    "LLM_PROVIDER",
    "LLM_API_KEY",
]
