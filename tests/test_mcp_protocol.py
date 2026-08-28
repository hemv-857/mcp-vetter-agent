"""MCP protocol test: the server must expose its tools over streamable HTTP."""

import asyncio
import threading
import time

import pytest
import uvicorn
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from probe_server.server import mcp_app

TEST_PORT = 8931


@pytest.fixture(scope="module")
def server():
    config = uvicorn.Config(mcp_app, host="127.0.0.1", port=TEST_PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)
    yield f"http://127.0.0.1:{TEST_PORT}/mcp"
    server.should_exit = True
    thread.join(timeout=5)


def test_lists_tools_with_correct_write_annotations(server):
    async def main():
        async with (
            streamablehttp_client(server) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            return await session.list_tools()

    tools = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(main())
    names = {t.name for t in tools.tools}
    assert names == {
        "static_audit",
        "full_audit",
        "read_target_manifest",
        "clone_target",
        "file_github_issue",
    }
    writes = {"clone_target", "file_github_issue"}
    for tool in tools.tools:
        assert tool.annotations.readOnlyHint == (tool.name not in writes)
    filing = next(t for t in tools.tools if t.name == "file_github_issue")
    assert filing.annotations.destructiveHint is True
