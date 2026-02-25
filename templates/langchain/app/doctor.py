"""
Basic setup checker for local development.

Run:
  python -m app.doctor
"""

from __future__ import annotations

import asyncio

import httpx

from app.config import settings

RECOMMENDED_TOOLKITS = ["Slack", "Google Calendar", "Linear", "GitHub", "Gmail"]


async def _gateway_reachable(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        return resp.status_code in {200, 401, 403}
    except Exception:
        return False


async def main() -> int:
    errors: list[str] = []

    if not settings.arcade_gateway_url:
        errors.append(
            "Missing ARCADE_GATEWAY_URL. Create one at https://app.arcade.dev/mcp-gateways "
            "and set it in .env."
        )

    if not settings.openai_api_key and not settings.anthropic_api_key:
        errors.append("Missing LLM key. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.")

    if settings.arcade_gateway_url:
        if not await _gateway_reachable(settings.arcade_gateway_url):
            errors.append(f"Gateway not reachable at {settings.arcade_gateway_url}")

    if errors:
        print("\nDoctor found setup issues:\n")
        for err in errors:
            print(f"- {err}")
        print("\nRecommended toolkits in your Arcade gateway:")
        for toolkit in RECOMMENDED_TOOLKITS:
            print(f"- {toolkit}")
        return 1

    print("Doctor check passed.")
    print("Recommended toolkits in your Arcade gateway:")
    for toolkit in RECOMMENDED_TOOLKITS:
        print(f"- {toolkit}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
