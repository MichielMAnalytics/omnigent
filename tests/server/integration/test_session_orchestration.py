"""Runner dispatch through authenticated routes and real ownership/sharing stores."""

import json

import pytest

from omnigent.runner.identity import ORCHESTRATION_SOURCE_HEADER, RUNNER_TUNNEL_TOKEN_HEADER
from omnigent.runner.tool_dispatch import execute_tool
from omnigent.server.auth import LEVEL_EDIT, LEVEL_READ
from omnigent.server.feature_flags import Feature, FeatureFlags
from omnigent.stores.conversation_store.sqlalchemy_store import SqlAlchemyConversationStore
from omnigent.stores.permission_store.sqlalchemy_store import SqlAlchemyPermissionStore
from tests.server.integration.test_managed_startup_inputs import auth_app as auth_app
from tests.server.integration.test_managed_startup_inputs import (
    startup_permissions as startup_permissions,
)
from tests.server.integration.test_sessions_attribution import _bind_runner
from tests.server.integration.test_sessions_harness_override import _stub_late_runner_bind
from tests.server.integration.test_sessions_permissions import _create_session_as

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def peers(auth_client, auth_app, db_uri, monkeypatch):
    source = await _create_session_as(auth_client, "", "alice")
    target = await _create_session_as(auth_client, "", "alice")
    headers = {"X-Forwarded-Email": "alice", **_bind_runner(db_uri, source["id"])}
    auth_client.headers.update(headers)
    auth_app.state.feature_flags = FeatureFlags(frozenset({Feature.SESSION_ORCHESTRATION}))
    captured = _stub_late_runner_bind(monkeypatch)
    return source, target, captured


async def _send(client, source, target, message="Please inspect the PR"):
    return json.loads(
        await execute_tool(
            tool_name="sys_session_message",
            arguments=json.dumps({"session_id": target["id"], "message": message}),
            server_client=client,
            conversation_id=source["id"],
        )
    )


async def test_private_sender_can_message_shared_receiver(auth_client, peers, db_uri):
    source, target, captured = peers
    permissions = SqlAlchemyPermissionStore(db_uri)
    permissions.ensure_user("bob")
    permissions.grant("bob", target["id"], LEVEL_READ)
    result = await _send(auth_client, source, target)
    assert result.get("queued") is True, result
    assert "Please inspect the PR" in json.dumps(captured)
    items = await auth_client.get(f"/v1/sessions/{target['id']}/items")
    assert f"[Message from session {source['id']}]" in items.text
    assert '"created_by":"alice"' in items.text
    store = SqlAlchemyConversationStore(db_uri)
    assert store.get_conversation(target["id"]).parent_conversation_id is None
    assert store.get_conversation(source["id"]).parent_conversation_id is None


@pytest.mark.parametrize(
    "condition",
    [
        "flag_off",
        "shared_read",
        "shared_edit",
        "public",
        "other_owner",
        "admin",
        "missing_binding",
        "wrong_binding",
        "self",
        "blank",
        "oversize",
        "missing_source",
    ],
)
async def test_refusal_before_delivery(condition, auth_client, auth_app, peers, db_uri):
    source, target, captured = peers
    permissions = SqlAlchemyPermissionStore(db_uri)
    if condition == "flag_off":
        auth_app.state.feature_flags = FeatureFlags()
    if condition in {"shared_read", "shared_edit", "public"}:
        user = "__public__" if condition == "public" else "bob"
        permissions.ensure_user(user)
        permissions.grant(
            user, source["id"], LEVEL_EDIT if condition == "shared_edit" else LEVEL_READ
        )
    if condition in {"other_owner", "admin"}:
        other = await _create_session_as(auth_client, "", "bob")
        permissions.grant("alice", other["id"], LEVEL_EDIT)
        target = other
        if condition == "admin":
            permissions.set_admin("alice", True)
    if condition == "missing_binding":
        del auth_client.headers[RUNNER_TUNNEL_TOKEN_HEADER]
    if condition == "wrong_binding":
        auth_client.headers[RUNNER_TUNNEL_TOKEN_HEADER] = "wrong"
    if condition == "self":
        target = source
    captured.clear()
    response = await auth_client.post(
        f"/v1/sessions/{target['id']}/events",
        headers={}
        if condition == "missing_source"
        else {ORCHESTRATION_SOURCE_HEADER: source["id"]},
        json={
            "type": "session_message",
            "data": {
                "message": {
                    "blank": " ",
                    "oversize": "a" * 8001,
                }.get(condition, "DO_NOT_DELIVER")
            },
        },
    )
    assert response.status_code in {400, 403}, response.text
    assert not captured.get("posts")


async def test_sharing_during_receiver_startup_blocks_delivery(
    auth_client, peers, db_uri, monkeypatch
):
    from omnigent.server.routes import sessions

    source, target, captured = peers
    permissions = SqlAlchemyPermissionStore(db_uri)
    permissions.ensure_user("bob")

    async def share_while_starting(*args, **kwargs):
        permissions.grant("bob", source["id"], LEVEL_READ)

    monkeypatch.setattr(sessions, "_ensure_runner_relay_ready", share_while_starting)
    result = await _send(auth_client, source, target)
    assert "error" in result, result
    assert not any("/events" in path for path, _ in captured.get("posts", []))
    items = await auth_client.get(f"/v1/sessions/{target['id']}/items")
    assert "Please inspect" not in items.text


async def test_child_inherits_source_sharing(auth_client, peers, db_uri):
    source, target, captured = peers
    response = await auth_client.post(
        "/v1/sessions",
        json={
            "agent_id": source["agent_id"],
            "parent_session_id": source["id"],
        },
    )
    assert response.status_code == 201, response.text
    child = response.json()
    permissions = SqlAlchemyPermissionStore(db_uri)
    permissions.ensure_user("bob")
    permissions.grant("bob", source["id"], LEVEL_READ)
    captured.clear()
    assert "error" in await _send(auth_client, child, target)
    assert not captured.get("posts")


@pytest.mark.parametrize("placement", ["same_host", "arclet"])
@pytest.mark.parametrize("condition", ["flag_off", "shared", "binding"])
async def test_creation_refuses_before_launch(
    auth_client, auth_app, peers, db_uri, placement, condition
):
    source, _, captured = peers
    if condition == "flag_off":
        auth_app.state.feature_flags = FeatureFlags()
    elif condition == "shared":
        permissions = SqlAlchemyPermissionStore(db_uri)
        permissions.ensure_user("bob")
        permissions.grant("bob", source["id"], LEVEL_READ)
    else:
        auth_client.headers[RUNNER_TUNNEL_TOKEN_HEADER] = "wrong"
    result = json.loads(
        await execute_tool(
            tool_name="sys_session_create",
            arguments=json.dumps({"agent_id": source["agent_id"], "placement": placement}),
            server_client=auth_client,
            conversation_id=source["id"],
        )
    )
    assert "error" in result, result
    assert not captured.get("posts")


async def test_same_host_still_requires_host_ownership(auth_client, auth_app, peers, db_uri):
    from tests.server.integration.test_sessions_permissions import _register_online_host

    source, _, captured = peers
    host_id = "a" * 32
    _register_online_host(auth_app, host_id, "bob")
    SqlAlchemyConversationStore(db_uri).set_host_id(source["id"], host_id, workspace="/tmp")
    result = json.loads(
        await execute_tool(
            tool_name="sys_session_create",
            arguments=json.dumps({"agent_id": source["agent_id"], "placement": "same_host"}),
            server_client=auth_client,
            conversation_id=source["id"],
        )
    )
    assert "error" in result, result
    assert not captured.get("posts")
    assert auth_app.state.host_registry.get(host_id).outbound_queue.empty()


async def test_arclet_creation_is_private_and_saves_first_task(
    auth_client, auth_app, peers, db_uri, monkeypatch
):
    import asyncio
    from dataclasses import replace

    from omnigent.server.routes.sessions import routes_core
    from omnigent.server.sharing_settings import DefaultPublicSessions

    source, _, _ = peers
    deployment = auth_app.state.sandbox_config
    auth_app.state.sandbox_config = replace(
        deployment, configs=(replace(deployment.default, provider="arclet"),)
    )
    auth_app.state.default_public_sessions = lambda: DefaultPublicSessions.ALL
    launched = asyncio.Event()
    release = asyncio.Event()
    captured = {}

    async def launch(**kwargs):
        captured.update(kwargs)
        launched.set()
        await release.wait()

    monkeypatch.setattr(routes_core, "_run_managed_launch", launch)
    try:
        result = json.loads(
            await execute_tool(
                tool_name="sys_session_create",
                arguments=json.dumps(
                    {
                        "agent_id": source["agent_id"],
                        "placement": "arclet",
                        "message": "First task",
                    }
                ),
                server_client=auth_client,
                conversation_id=source["id"],
            )
        )
        assert "error" not in result, result
        await asyncio.wait_for(launched.wait(), timeout=2)
        session_id = result["conversation_id"]
        assert captured["provider"] == "arclet"
        assert captured["owner"] == "alice"
        store = SqlAlchemyConversationStore(db_uri)
        assert store.get_conversation(session_id).parent_conversation_id is None
        assert "First task" in str(store.list_pending_inputs(session_id))
        grants, _ = SqlAlchemyPermissionStore(db_uri).list_for_session(session_id)
        assert [g.user_id for g in grants] == ["alice"]
    finally:
        release.set()
        await auth_app.state.startup_inputs.shutdown()
