"""Tool wire contracts, native discovery, and uncertain delivery handling."""

import json
from unittest.mock import Mock
from uuid import uuid4

import httpx
import pytest

from omnigent.runner.identity import ORCHESTRATION_SOURCE_HEADER
from omnigent.runner.tool_dispatch import build_native_relay_tool_schemas, execute_tool
from omnigent.spec.types import AgentSpec


@pytest.mark.parametrize("spec", [AgentSpec(spec_version=1), None])
def test_native_message_schema(spec):
    schemas = build_native_relay_tool_schemas(spec)
    schema = next(s for s in schemas if s["name"] == "sys_session_message")
    assert schema["parameters"]["required"] == ["session_id", "message"]


@pytest.mark.asyncio
@pytest.mark.parametrize("placement", ["child", "same_host", "arclet"])
async def test_create_placement(placement, monkeypatch):
    from omnigent.runner import subagent_work

    register = Mock()
    monkeypatch.setattr(subagent_work, "register_child_session", register)
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path.endswith("/events"):
            return httpx.Response(202, json={"queued": True})
        return httpx.Response(201, json={"id": uuid4().hex, "agent_id": "worker"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="http://server"
    ) as client:
        result = json.loads(
            await execute_tool(
                tool_name="sys_session_create",
                arguments=json.dumps(
                    {"agent_id": "worker", "placement": placement, "message": "Start"}
                ),
                server_client=client,
                conversation_id="manager",
            )
        )
    assert "error" not in result, result
    assert len(requests) == (2 if placement == "same_host" else 1)
    body = json.loads(requests[0].content)
    if placement == "child":
        assert body["parent_session_id"] == "manager"
        register.assert_called_once()
    else:
        assert "parent_session_id" not in body
        assert requests[0].headers[ORCHESTRATION_SOURCE_HEADER] == "manager"
        register.assert_not_called()
    if placement == "arclet":
        assert body["sandbox_provider"] == "arclet"
        assert body["host_type"] == "managed"
        assert body["initial_input"]["data"]["content"][0]["text"] == "Start"
        assert "initial_items" not in body
    elif placement == "child":
        assert body["initial_items"][0]["data"]["content"][0]["text"] == "Start"
    else:
        assert "initial_items" not in body
        assert json.loads(requests[1].content)["data"]["message"] == "Start"
        assert result["initial_message"] == {"queued": True}


@pytest.mark.asyncio
async def test_message_timeout_is_not_retried():
    requests = []

    def timeout(request):
        requests.append(request)
        raise httpx.ReadTimeout("uncertain")

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(timeout), base_url="http://server"
    ) as client:
        result = await execute_tool(
            tool_name="sys_session_message",
            arguments=json.dumps({"session_id": uuid4().hex, "message": "Work"}),
            server_client=client,
            conversation_id="manager",
        )
    assert "do not automatically resend" in result
    assert len(requests) == 1
