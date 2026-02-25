import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.agent import SYSTEM_PROMPT, get_llm
from app.arcade_oauth import get_cached_tools, get_mcp_client
from app.auth import get_current_user
from app.database import get_db

router = APIRouter(tags=["chat"])


def _patch_tool_schemas(tools):
    """Ensure all tool schemas have a 'properties' field.

    Some MCP tools (e.g. Slack_WhoAmI) have no parameters, producing a schema
    like {"type": "object"} without "properties". OpenAI's API rejects this,
    so we patch in an empty properties dict where missing.
    """
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


def _format_content(content) -> str:
    """Pretty-format tool content for display."""
    if not isinstance(content, str):
        return str(content)
    try:
        parsed = json.loads(content)
        return json.dumps(parsed, indent=2)
    except (json.JSONDecodeError, ValueError):
        return content


@router.post("/api/chat")
async def chat(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    body = await request.json()
    messages = body.get("messages", [])

    # Convert frontend messages to LangChain format
    lc_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))

    async def event_stream():
        from langgraph.prebuilt import create_react_agent

        mcp_client = get_mcp_client()

        try:
            tools = await get_cached_tools(mcp_client)
            tools = _patch_tool_schemas(tools)
            llm = get_llm()
            agent = create_react_agent(llm, tools=tools, prompt=SYSTEM_PROMPT)

            async for event in agent.astream(
                {"messages": lc_messages},
                stream_mode="updates",
            ):
                for node_name, update in event.items():
                    if node_name == "agent" and "messages" in update:
                        for msg in update["messages"]:
                            if hasattr(msg, "content") and msg.content:
                                yield {
                                    "event": "message",
                                    "data": json.dumps({"type": "text", "content": msg.content}),
                                }
                            if hasattr(msg, "tool_calls") and msg.tool_calls:
                                for tc in msg.tool_calls:
                                    yield {
                                        "event": "tool_call",
                                        "data": json.dumps(
                                            {
                                                "type": "tool_call",
                                                "tool_name": tc.get("name", ""),
                                                "tool_call_id": tc.get("id", ""),
                                                "tool_args": tc.get("args", {}),
                                            }
                                        ),
                                    }

                    if node_name == "tools" and "messages" in update:
                        for msg in update["messages"]:
                            content = msg.content if hasattr(msg, "content") else str(msg)
                            auth_url = _extract_auth_url(content)

                            if auth_url:
                                yield {
                                    "event": "auth_required",
                                    "data": json.dumps(
                                        {
                                            "type": "auth_required",
                                            "authorization_url": auth_url,
                                            "tool_name": getattr(msg, "name", "tool"),
                                        }
                                    ),
                                }
                            else:
                                yield {
                                    "event": "tool_result",
                                    "data": json.dumps(
                                        {
                                            "type": "tool_result",
                                            "tool_name": getattr(msg, "name", "tool"),
                                            "tool_call_id": getattr(msg, "tool_call_id", ""),
                                            "tool_output": _format_content(content),
                                        }
                                    ),
                                }

            yield {"event": "done", "data": json.dumps({"type": "done"})}

        except Exception as e:
            import traceback

            traceback.print_exc()
            yield {
                "event": "error",
                "data": json.dumps({"type": "error", "message": str(e)}),
            }

    return EventSourceResponse(event_stream())
