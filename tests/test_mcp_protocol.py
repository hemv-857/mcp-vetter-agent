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


def test_lists_three_read_only_tools(server):
    async def main():
        async with (
            streamablehttp_client(server) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            return await session.list_tools()

    tools = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(main())
    names = {t.name for t in tools.tools}
    assert names == {"static_audit", "full_audit", "read_target_manifest", "clone_target"}
    for tool in tools.tools:
        assert tool.annotations.readOnlyHint == (tool.name != "clone_target")
