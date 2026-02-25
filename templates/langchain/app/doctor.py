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
RECOMMENDED_TOOLS = [
    "Slack_ListConversations",
    "Slack_GetMessages",
    "Slack_GetConversationMetadata",
    "Slack_WhoAmI",
    "GoogleCalendar_ListEvents",
    "GoogleCalendar_ListCalendars",
    "GoogleCalendar_WhoAmI",
    "Linear_GetNotifications",
    "Linear_GetRecentActivity",
    "Linear_ListIssues",
    "Linear_GetIssue",
    "Linear_ListProjects",
    "Linear_GetProject",
    "Linear_WhoAmI",
    "Github_ListNotifications",
    "Github_GetNotificationSummary",
    "Github_ListPullRequests",
    "Github_GetPullRequest",
    "Github_GetUserOpenItems",
    "Github_GetUserRecentActivity",
    "Github_GetReviewWorkload",
    "Github_GetIssue",
    "Github_WhoAmI",
    "Gmail_ListEmails",
    "Gmail_ListThreads",
    "Gmail_GetThread",
    "Gmail_SearchThreads",
    "Gmail_WhoAmI",
]


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
        print("\nRecommended minimum toolkits (enable only needed tools):")
        for toolkit in RECOMMENDED_TOOLKITS:
            print(f"- {toolkit}")
        print("\nRecommended minimum tools (exact names):")
        for tool in RECOMMENDED_TOOLS:
            print(f"- {tool}")
        return 1

    print("Doctor check passed.")
    print("Recommended minimum toolkits (enable only needed tools):")
    for toolkit in RECOMMENDED_TOOLKITS:
        print(f"- {toolkit}")
    print("Recommended minimum tools (exact names):")
    for tool in RECOMMENDED_TOOLS:
        print(f"- {tool}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
