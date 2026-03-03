"""
Plan API Route — Daily Planning Agent

POST /api/plan

Triggers the triage agent to scan connected services (Slack, Calendar,
Linear, GitHub, Gmail, etc.), classify each item, and stream back
structured data as NDJSON.
"""

import json
import re

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import get_llm
from app.arcade_oauth import get_cached_tools, get_mcp_client
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(tags=["plan"])


def _map_tool_to_source(tool_name: str | None) -> str:
    if not tool_name:
        return "other"
    service = tool_name.split(".")[0].lower()
    if service == "slack":
        return "slack"
    if service in ("google", "googlecalendar", "calendar"):
        return "google_calendar"
    if service == "linear":
        return "linear"
    if service in ("git", "github"):
        return "github"
    if service == "gmail":
        return "gmail"
    return service or "other"


def _build_plan_prompt():
    return (
        "You are a daily planning and triage agent. You have access to tools "
        "that connect to the user's services (e.g. Slack, Google Calendar, "
        "Linear, GitHub, Gmail). Your job is to thoroughly scan all available "
        "sources, read recent items AND currently assigned work, and classify "
        "each one.\n\n"
        "WORKFLOW:\n"
        "1. In your FIRST step, call every available non-WhoAmI tool in "
        "parallel — one per source.\n"
        "2. After getting results, if any tool offers parameters for deeper "
        "queries (e.g. filtering, pagination, or fetching specific items), "
        "make follow-up calls to get more data.\n"
        "3. Classify each item and output a structured JSON block.\n"
        "4. After processing ALL sources, output a summary.\n"
        "5. Do NOT call *_WhoAmI tools — those are for auth checking, "
        "not data fetching.\n"
        "6. If a tool returns truncated results, work with what you have "
        "— do not retry the same call.\n\n"
        "IMPORTANT RULES FOR TOOL RESULTS:\n"
        "- Do NOT create items for empty results. If a source returns "
        "0 items, skip it silently.\n"
        "- Do NOT create items for metadata like 'you are a member of "
        "N channels' — that is not actionable.\n"
        "- Only create items for ACTUAL content: messages, notifications, "
        "events, issues, emails, PRs, etc.\n"
        "- If a tool returns a list of channels/conversations, do NOT "
        "classify the list itself. Only classify individual messages or "
        "items with actual content.\n"
        "- If a tool returns an authorization error, skip it and move on "
        "— do not create an item for the error.\n\n"
        "CLASSIFICATION:\n"
        "- category: NEEDS_REPLY | NEEDS_FEEDBACK | NEEDS_DECISION "
        "| NEEDS_REVIEW | ATTEND | FYI | IGNORE\n"
        "- priority: P0 (urgent) | P1 (important) | P2 (can wait) | FYI\n"
        "- effort: XS (<5min) | S (5-15min) | M (15-30min) | L (>30min)\n"
        "- confidence: 0.0 to 1.0\n\n"
        "SOURCE MAPPING:\n"
        '- Tools starting with "Slack" -> source: "slack"\n'
        '- Tools starting with "Google", "GoogleCalendar", or "Calendar" -> source: "google_calendar"\n'
        '- Tools starting with "Linear" -> source: "linear"\n'
        '- Tools starting with "Git" or "GitHub" -> source: "github"\n'
        '- Tools starting with "Gmail" -> source: "gmail"\n'
        '- Anything else -> source: lowercase service name (e.g. "notion", "dropbox")\n\n'
        "OUTPUT: For EACH item, output EXACTLY this on its own line:\n\n"
        "```json:task\n"
        "{\n"
        '  "id": "<unique-id>",\n'
        '  "source": "slack",\n'
        '  "sourceDetail": "DM with Alice",\n'
        '  "summary": "<1-2 sentences>",\n'
        '  "category": "NEEDS_REPLY",\n'
        '  "priority": "P1",\n'
        '  "effort": "S",\n'
        '  "why": "<brief explanation>",\n'
        '  "suggestedNextStep": "<what to do>",\n'
        '  "confidence": 0.85,\n'
        '  "participants": [{"id": "<uid>", "name": "<name>"}],\n'
        '  "url": "<deep link if available>",\n'
        '  "scheduledTime": "<ISO time for calendar events, otherwise omit>"\n'
        "}\n"
        "```\n\n"
        "After all items from all sources, output:\n"
        "```json:summary\n"
        '{"total": <total items>, "bySource": {"slack": 5, "google_calendar": 3, "linear": 2}}\n'
        "```\n\n"
        "Rules:\n"
        "- One json:task block per ACTIONABLE item (skip empty results, metadata, and errors)\n"
        "- Brief status text between blocks is fine\n"
        "- Process ALL available sources before the summary\n"
        "- If a tool requires authorization, skip it and move on to other sources\n"
        "- If errors occur reading a source, skip it silently\n"
        "- Use ATTEND category for calendar events you need to join\n"
        "- Use NEEDS_REVIEW for code reviews (PRs, etc.)\n\n"
    )


def _patch_tool_schemas(tools):
    """Ensure all tool schemas have a 'properties' field."""
    for tool in tools:
        schema = getattr(tool, "args_schema", None)
        if isinstance(schema, dict) and "properties" not in schema:
            schema["properties"] = {}
    return tools


def _extract_auth_url(content) -> str | None:
    """Check if a tool result contains an Arcade authorization URL."""
    if not isinstance(content, str):
        return None
    try:
        parsed = json.loads(content)
        return (
            parsed.get("authorization_url")
            or parsed.get("url")
            or (parsed.get("structuredContent") or {}).get("authorization_url")
        )
    except (json.JSONDecodeError, AttributeError):
        return None


def _extract_json_blocks(text: str):
    """Extract json:task and json:summary blocks from accumulated text."""
    tasks = []
    summary = None
    last_consumed = 0

    for match in re.finditer(r"```json:task\s*\n([\s\S]*?)```", text):
        try:
            tasks.append(json.loads(match.group(1).strip()))
            end = match.start() + len(match.group(0))
            if end > last_consumed:
                last_consumed = end
        except json.JSONDecodeError:
            pass

    for match in re.finditer(r"```json:summary\s*\n([\s\S]*?)```", text):
        try:
            raw = json.loads(match.group(1).strip())
            # Normalize: handle both old and new summary shapes
            if "total" in raw and "bySource" in raw:
                summary = raw
            elif "tasks" in raw:
                summary = {"total": raw["tasks"], "bySource": {}}
            else:
                summary = {"total": 0, "bySource": {}}
            end = match.start() + len(match.group(0))
            if end > last_consumed:
                last_consumed = end
        except json.JSONDecodeError:
            pass

    remaining = text[last_consumed:] if last_consumed > 0 else text
    return tasks, summary, remaining


def _encode_event(event: dict) -> str:
    return json.dumps(event) + "\n"


@router.post("/api/plan")
async def plan(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    plan_prompt = _build_plan_prompt()

    async def stream():
        from langgraph.prebuilt import create_react_agent

        yield _encode_event({"type": "status", "message": "Connecting to Arcade Gateway..."})

        mcp_client = get_mcp_client()

        try:
            all_tools = await get_cached_tools(mcp_client)
            all_tools = _patch_tool_schemas(all_tools)

            # Only keep tools useful for triage — tools from known services, no mutations.
            # Uses pattern matching so it works regardless of Arcade's exact naming
            # convention (underscores, dots, or mixed casing are all handled).
            _KNOWN_SERVICE = re.compile(
                r"^(github|gmail|google|calendar|linear|slack)", re.IGNORECASE,
            )
            _MUTATION = re.compile(
                r"create|update|delete|send|reply|post|archive|remove"
                r"|add|invite|merge|close|assign|edit|publish|comment",
                re.IGNORECASE,
            )

            def _is_triage_tool(name: str) -> bool:
                if not _KNOWN_SERVICE.search(name):
                    return False
                return not _MUTATION.search(name)
            MAX_TOOL_RESULT_CHARS = 4000

            def _wrap_tool(tool):
                """Wrap a tool to truncate large results and prevent context overflow."""
                original_coroutine = tool.coroutine
                original_func = tool.func

                async def _truncated_ainvoke(*args, **kwargs):
                    result = await original_coroutine(*args, **kwargs)
                    if isinstance(result, str) and len(result) > MAX_TOOL_RESULT_CHARS:
                        return (
                            result[:MAX_TOOL_RESULT_CHARS]
                            + f"\n...[truncated {len(result) - MAX_TOOL_RESULT_CHARS} chars]"
                        )
                    return result

                updates = {"coroutine": _truncated_ainvoke}
                if original_func is not None:
                    def _truncated_invoke(*args, **kwargs):
                        result = original_func(*args, **kwargs)
                        s = result if isinstance(result, str) else json.dumps(result) if result else ""
                        if len(s) > MAX_TOOL_RESULT_CHARS:
                            return (
                                s[:MAX_TOOL_RESULT_CHARS]
                                + f"\n...[truncated {len(s) - MAX_TOOL_RESULT_CHARS} chars]"
                            )
                        return result
                    updates["func"] = _truncated_invoke

                return tool.model_copy(update=updates)

            tools = [
                _wrap_tool(t)
                for t in all_tools
                if _is_triage_tool(t.name) and not re.search(r"[._]WhoAmI$", t.name, re.IGNORECASE)
            ]

            tool_names = [t.name for t in tools]
            sources = list({_map_tool_to_source(n) for n in tool_names if n})
            print(
                f"[plan] {len(tool_names)} triage tools "
                f"(of {len(all_tools)} total) "
                f"from sources: {', '.join(sources)}"
            )

            yield _encode_event(
                {
                    "type": "status",
                    "message": (
                        f"Found {len(tool_names)} tools across "
                        f"{len(sources)} sources. Starting triage..."
                    ),
                }
            )

            yield _encode_event({"type": "sources", "sources": sources})

            # Build a per-source tool inventory so the model knows exactly what to call
            tools_by_source: dict[str, list[str]] = {}
            for name in tool_names:
                src = _map_tool_to_source(name)
                tools_by_source.setdefault(src, []).append(name)
            tool_inventory = "\n".join(
                f"{src}: {', '.join(names)}" for src, names in tools_by_source.items()
            )

            llm = get_llm()
            agent = create_react_agent(llm, tools=tools, prompt=plan_prompt)

            accumulated_text = ""
            emitted_task_count = 0
            emitted_summary = False

            from datetime import date

            today = date.today().strftime("%A, %B %d, %Y")
            user_message = (
                f"Plan my day. Today is {today}.\n\n"
                f"Here are the tools available by source:\n\n"
                f"{tool_inventory}\n\n"
                "In your FIRST step, call ALL non-WhoAmI tools in "
                "parallel — one call per tool. Do NOT skip any source.\n"
                "For calendar tools, make sure to pass today's date "
                "range so you get today's events.\n"
                "After getting results, classify every item. If any "
                "source returned a list you can drill into, make "
                "follow-up calls.\n"
                "I need a COMPLETE picture: notifications, assigned "
                "work, upcoming events, and unread messages."
            )

            async for event in agent.astream(
                {"messages": [HumanMessage(content=user_message)]},
                stream_mode="updates",
            ):
                for node_name, update in event.items():
                    # Check for tool results with auth URLs
                    if node_name == "tools" and "messages" in update:
                        for msg in update["messages"]:
                            content = msg.content if hasattr(msg, "content") else str(msg)
                            auth_url = _extract_auth_url(content)
                            if auth_url:
                                tool_name = getattr(msg, "name", "")
                                source = _map_tool_to_source(tool_name)
                                yield _encode_event(
                                    {
                                        "type": "auth_required",
                                        "authUrl": auth_url,
                                        "toolName": source,
                                    }
                                )

                            name = getattr(msg, "name", "")
                            if name:
                                source = _map_tool_to_source(name)
                                yield _encode_event(
                                    {
                                        "type": "status",
                                        "message": f"Calling {source}: {name}...",
                                    }
                                )

                    # Check for agent text output
                    if node_name == "agent" and "messages" in update:
                        for msg in update["messages"]:
                            if (
                                hasattr(msg, "content")
                                and msg.content
                                and isinstance(msg.content, str)
                            ):
                                accumulated_text += msg.content

                                tasks, summary, remaining = _extract_json_blocks(accumulated_text)
                                accumulated_text = remaining

                                for task in tasks:
                                    emitted_task_count += 1
                                    yield _encode_event({"type": "task", "data": task})
                                    suffix = "s" if emitted_task_count > 1 else ""
                                    yield _encode_event(
                                        {
                                            "type": "status",
                                            "message": (
                                                f"Classified {emitted_task_count} item{suffix}..."
                                            ),
                                        }
                                    )

                                if summary:
                                    yield _encode_event({"type": "summary", "data": summary})
                                    emitted_summary = True

            # Final pass
            if accumulated_text:
                tasks, summary, _ = _extract_json_blocks(accumulated_text)
                for task in tasks:
                    emitted_task_count += 1
                    yield _encode_event({"type": "task", "data": task})
                if summary:
                    yield _encode_event({"type": "summary", "data": summary})
                    emitted_summary = True

            if not emitted_summary and emitted_task_count > 0:
                yield _encode_event(
                    {
                        "type": "summary",
                        "data": {"total": emitted_task_count, "bySource": {}},
                    }
                )

            yield _encode_event({"type": "done"})

        except Exception as e:
            import traceback

            traceback.print_exc()
            yield _encode_event(
                {
                    "type": "error",
                    "message": str(e),
                }
            )
            yield _encode_event({"type": "done"})

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"},
    )
