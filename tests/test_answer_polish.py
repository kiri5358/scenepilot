"""Korea edition: the fixes after the first scenario run (deal questions, stray site mentions, fault advice)."""
import asyncio

from scenepilot import assistant, coach, guard, kr
from scenepilot import session as sm
from scenepilot.coach import ModelReading


def kr_session() -> sm.Session:
    s = sm.new_session("KR")
    sm.accept_consent(s)
    return s


def test_a_question_about_settling_on_the_spot_gets_the_fixed_answer_without_calling_the_model():
    for q in ("상대방이 보험 말고 현금으로 합의하자는데 어떻게 해야 하나요?", "합의금 얼마 받아야 해요", "각서 쓰자는데요"):
        a = asyncio.run(assistant.ask(kr_session(), q))
        assert a.kind == "answer" and a.answer == kr.DEAL_ANSWER and not a.tools_used
    assert guard.is_safe(kr.DEAL_ANSWER)


def test_the_english_edition_is_not_affected_by_the_deal_rule():
    assert not kr.DEAL_QUESTION.search("What should I do about the other driver?")
    s = sm.new_session("US")
    sm.accept_consent(s)
    a = asyncio.run(assistant.ask(s, "he wants cash", settings=type("S", (), {"api_key": ""})()))
    assert a.answer != kr.DEAL_ANSWER


def test_site_sentences_and_repeated_referrals_are_dropped_from_korean_answers():
    text = ("렌터카 회사에 먼저 알리세요. 계약서의 고객센터 번호를 확인하세요. "
            "법령 정보 사이트(law.go.kr)에서 규정을 확인할 수 있습니다. 보험사에 문의하세요. 전문가에게 상담받으시는 것이 좋습니다.")
    out = assistant.tidy_korean(text)
    assert "law.go.kr" not in out and "사이트" not in out
    assert out.count("문의") + out.count("상담") == 1
    assert out.startswith("렌터카 회사에 먼저 알리세요.")
    assert assistant.tidy_korean("사이트를 보세요.") == "사이트를 보세요."   # never returns an empty answer


def test_someone_admitting_fault_gets_only_the_fixed_reminder_even_if_the_model_wrote_advice():
    s = kr_session()
    reading = ModelReading(risks=["fault"], advice="경찰에 신고하고 보험 절차를 따라 주세요. 112에 전화해 주세요.")
    hints = coach.decide(s, reading, 0).hints
    assert [h["id"] for h in hints] == ["fault"] and not any(h.get("free") for h in hints)


def test_advice_after_a_threat_still_follows_the_fixed_reminder():
    s = kr_session()
    reading = ModelReading(risks=["hostile"], advice="차 안에서 기다리며 상대와 거리를 두세요.")
    assert [h["id"] for h in coach.decide(s, reading, 0).hints] == ["hostile", "ai"]


def test_the_notes_no_longer_claim_a_team_check():
    from scenepilot import states
    for note in states.ui_notes("KR"):
        assert all("팀 확인" not in src.version for src in note.sources)


def test_a_phone_number_is_only_allowed_in_a_sentence_that_says_whose_number_it_is():
    notes = "한국도로공사서비스 콜센터 1588-2504에 문의할 수 있어요."
    bad = "보험사는 500 m 이내에서 1588‑2504로 전화하면 됩니다."
    good = "고속도로에서 차가 움직이지 않으면 한국도로공사서비스 콜센터 1588-2504에 문의할 수 있어요."
    assert not assistant.check_answer(bad, notes) and assistant.check_answer(good, notes)
    assert assistant.check_answer("부상이 있으면 119에 전화하세요.", notes)   # emergency numbers have three digits
