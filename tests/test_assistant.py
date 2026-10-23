"""The free-question helper: rules before the model, tools for facts, the forbidden-output check after."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from scenepilot import assistant
from scenepilot import session as sm
from scenepilot.app import app
from scenepilot.config import Settings
from scenepilot.emergency import danger_signals

SETTINGS = Settings(api_key="test", base_url="http://x/", vision_model="v", max_image_bytes=1, vision_max_tokens=1,
                    request_timeout=5, assistant_model="fake-model", assistant_max_tokens=100, cors_origins=())


def reply(text=None, tool=None):
    calls = None
    if tool:
        name, args = tool
        calls = [SimpleNamespace(id="call1", function=SimpleNamespace(name=name, arguments=args))]
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text, tool_calls=calls))])


class FakeClient:
    """Plays back scripted replies; records what it was asked."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.replies.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def session():
    s = sm.new_session()
    sm.accept_consent(s)
    return s


def run(question, client, s=None):
    return asyncio.run(assistant.ask(s or session(), question, settings=SETTINGS, client=client))


# ---------- rules before the model ----------

@pytest.mark.parametrize("text", [
    "my wife is bleeding what do I do", "I smell gas from the other car", "there is smoke coming out", "my kid is crying in pain",
])
def test_danger_words_never_reach_the_model(text):
    client = FakeClient()
    result = run(text, client)
    assert result.kind == "safety" and "911" in result.answer
    assert client.calls == []
    assert result.call_buttons and result.call_buttons[0].number == "911"


@pytest.mark.parametrize("text", ["nobody is hurt, do I need to call the police?", "there is no smoke or fire"])
def test_negated_danger_words_are_not_danger(text):
    assert danger_signals(text) == []


# ---------- tools and answers ----------

def test_state_rule_answer_comes_through_the_notes_and_carries_sources():
    client = FakeClient(
        reply(tool=("lookup_state_notes", '{"state": "FL"}')),
        reply("In Florida, report the crash right away if anyone is hurt or damage looks like $2,000 or more."),
    )
    result = run("Do I have to call the police in Florida?", client)
    assert result.kind == "answer" and "$2,000" in result.answer
    assert result.tools_used == ["lookup_state_notes"]
    assert any("316.065" in s["title"] for s in result.sources)
    # the second call carried the tool result back to the model
    assert any(m.get("role") == "tool" for m in client.calls[1]["messages"])
    assert client.calls[0]["model"] == "fake-model" and client.calls[0]["tools"]


def test_an_amount_that_is_not_in_the_notes_is_blocked():
    client = FakeClient(reply(tool=("lookup_state_notes", '{"state": "FL"}')), reply("Repairs usually cost $500 or so."), reply("It runs about $500."))
    assert run("What will it cost?", client).kind == "fallback"


@pytest.mark.parametrize("text", [
    "The other driver is at fault.", "You should sue them.", "Don't admit anything and don't sign.", "It is probably a concussion.",
])
def test_forbidden_statements_are_replaced_by_the_fixed_fallback(text):
    result = run("Whose fault was it?", FakeClient(reply(text), reply(text)))
    assert result.kind == "fallback" and result.answer == assistant.FALLBACK_ANSWER


@pytest.mark.parametrize("text", [
    "I'm not able to determine who was at fault. The police or your insurance company would need to assess that.",
    "If anyone might be injured, or there is fire or fuel, call 911 right away.",
    "That is something the police and your insurance company decide, so please ask them.",
    "I can't say whether to apologize; please ask your insurance company.",
])
def test_declining_and_safety_sentences_may_mention_the_topic(text):
    assert assistant.check_answer(text, "")


@pytest.mark.parametrize("text", [
    "The other driver was at fault.", "It is your fault.", "He is liable for this.", "You should hire a lawyer.",
    "That sounds like whiplash.", "Don't say sorry to them.", "Repairs will cost a lot.", "Expect a settlement soon.",
    "I can't be sure. The other driver caused the crash.",   # a decline in one sentence does not excuse the next
])
def test_judgments_are_blocked_even_when_politely_worded(text):
    assert not assistant.check_answer(text, "")


def test_amounts_are_only_allowed_when_they_come_from_the_notes():
    assert assistant.check_answer("Report it if damage looks like $2,000 or more.", "... $2,000 ...")
    assert not assistant.check_answer("Report it if damage looks like $2,000 or more.", "nothing here")
    assert not assistant.check_answer("It is $5,000 in Florida and $2,000 in New York.", "... $2,000 ...")


def test_the_check_keeps_line_breaks_for_short_lists():
    assert assistant._clean("<think>x</think>Photos:\n- a wide shot\n- the plate") == "Photos:\n- a wide shot\n- the plate"


def test_a_rejected_answer_gets_one_more_try_with_the_rule_explained():
    client = FakeClient(reply("The other driver is at fault."), reply("I can't say who is at fault. The police decide that."))
    result = run("Who is at fault?", client)
    assert result.kind == "answer" and "police" in result.answer
    assert len(client.calls) == 2 and client.calls[1]["messages"][-1]["content"] == assistant.REWRITE_REQUEST


def test_two_rejected_answers_end_with_the_fixed_fallback():
    client = FakeClient(reply("He is at fault."), reply("It is definitely his fault."))
    result = run("Who is at fault?", client)
    assert result.kind == "fallback" and len(client.calls) == 2


@pytest.mark.parametrize("text", [
    "The law does not require you to call the police.", "Calling the police isn't legally required here.",
    "You don't have to report it.", "There is no need to call anyone.",
])
def test_claims_that_something_is_not_required_are_blocked(text):
    assert not assistant.check_answer(text, "")


def test_markdown_marks_are_removed():
    assert assistant._clean("Report within **10 days** using `form`.") == "Report within 10 days using form."


def test_think_tags_are_removed():
    result = run("What photos should I take?", FakeClient(reply("<think>hmm</think>Take a wide shot, the other plate, and the damage.")))
    assert result.kind == "answer" and result.answer == "Take a wide shot, the other plate, and the damage."


def test_model_failure_is_a_calm_message_not_an_error():
    assert run("What should I do?", FakeClient(RuntimeError("boom"))).kind == "unavailable"


def test_endless_tool_calls_stop():
    client = FakeClient(*[reply(tool=("emergency_numbers", "{}")) for _ in range(10)])  # never answers, only calls tools
    assert run("loop", client).kind == "fallback"
    assert len(client.calls) == assistant.MAX_TOOL_ROUNDS + 1 + assistant.MAX_REWRITES


def test_tools_only_know_the_two_covered_states():
    assert "error" in assistant.run_tool("lookup_state_notes", {"state": "TX"}, session(), [])
    assert assistant.run_tool("emergency_numbers", {}, session(), [])["police"] == "911"
    facts = assistant.run_tool("session_facts", {}, session(), [])
    assert facts["accident_state"] == "not chosen yet" and "photos" in facts


def test_no_key_means_unavailable_without_calling_anything():
    result = asyncio.run(assistant.ask(session(), "hello", settings=Settings(**{**SETTINGS.__dict__, "api_key": None})))
    assert result.kind == "unavailable"


# ---------- the endpoint ----------

def test_endpoint_requires_consent_and_is_capped(monkeypatch):
    async def fake_ask(s, question, **kwargs):
        return assistant.AssistantAnswer("ok", "answer")

    monkeypatch.setattr(assistant, "ask", fake_ask)
    client = TestClient(app)
    sid = client.post("/api/sessions", json={"country": "US"}).json()["session"]["id"]
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": "hi"}).status_code == 409   # not agreed yet
    client.post(f"/api/sessions/{sid}/consent")
    first = client.post(f"/api/sessions/{sid}/ask", json={"question": "hi"})
    assert first.status_code == 200 and first.json()["answer"] == "ok" and first.json()["remaining"] == assistant.MAX_QUESTIONS_PER_SESSION - 1
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": ""}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": "x" * 501}).status_code == 422
    for _ in range(assistant.MAX_QUESTIONS_PER_SESSION - 1):
        client.post(f"/api/sessions/{sid}/ask", json={"question": "again"})
    assert client.post(f"/api/sessions/{sid}/ask", json={"question": "one more"}).status_code == 429
