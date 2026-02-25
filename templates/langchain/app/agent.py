"""
LangGraph ReAct agent with Arcade MCP tools.

--- CUSTOMIZATION POINT ---
Edit system-prompt.md (in this directory) to change the agent's purpose.
For example, you could make a GitHub PR review agent, a calendar
scheduling assistant, or a Gmail drafting bot — just update the
system prompt and configure matching tools in your Arcade Gateway.
"""

from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.config import settings

# Load system prompt from file (single source of truth)
SYSTEM_PROMPT = (Path(__file__).parent / "system-prompt.md").read_text()


# --- CUSTOMIZATION POINT ---
# The model is selected based on which API key you set in .env.
# Set ANTHROPIC_API_KEY to use Claude, or OPENAI_API_KEY to use GPT.
# If both are set, Anthropic takes priority.
def get_llm():
    if settings.anthropic_api_key:
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key,
        )
    if settings.openai_api_key:
        return ChatOpenAI(
            model="gpt-4.1",
            api_key=settings.openai_api_key,
        )
    raise RuntimeError("No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env")
