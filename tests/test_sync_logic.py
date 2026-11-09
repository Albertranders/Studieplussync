import sys
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from studieplus_source import lesson_to_event  # noqa: E402
from sync_logic import HASH_PROP, KEY_PROP, LessonEvent, plan_sync  # noqa: E402

TZ = ZoneInfo("Europe/Copenhagen")


def make_event(key="lesson:1", summary="Dansk", hour=8):
    start = datetime(2026, 11, 10, hour, 0, tzinfo=TZ)
    return LessonEvent(key=key, summary=summary, start=start,
                       end=start + timedelta(minutes=90), location="A12")


def google_event(ev: LessonEvent, google_id="g1"):
    return {"id": google_id,
            "extendedProperties": {"private": {KEY_PROP: ev.key, HASH_PROP: ev.content_hash()}}}


def test_new_lesson_is_created():
    plan = plan_sync([make_event()], [])
    assert len(plan.create) == 1 and not plan.update and not plan.delete


def test_unchanged_lesson_is_left_alone():
    ev = make_event()
    plan = plan_sync([ev], [google_event(ev)])
    assert plan.unchanged == 1 and not plan.create and not plan.update and not plan.delete


def test_changed_room_updates_event():
    old = make_event()
    new = LessonEvent(**{**old.__dict__, "location": "B7"})
    plan = plan_sync([new], [google_event(old, "g9")])
    assert plan.update == [("g9", new)] and not plan.create and not plan.delete


def test_removed_lesson_is_deleted():
    plan = plan_sync([], [google_event(make_event(), "g5")])
    assert plan.delete == ["g5"]


def test_events_without_our_key_are_never_touched():
    foreign = {"id": "mine", "summary": "Tandlæge"}
    plan = plan_sync([], [foreign])
    assert not plan.delete and not plan.create


def test_duplicate_events_in_calendar_are_cleaned_up():
    ev = make_event()
    plan = plan_sync([ev], [google_event(ev, "a"), google_event(ev, "b")])
    assert plan.delete == ["b"] and plan.unchanged == 1


def test_two_lessons_with_same_key_both_survive():
    a, b = make_event(), make_event(hour=10)
    plan = plan_sync([a, b], [])
    assert len(plan.create) == 2
    assert len({e.key for e in plan.create}) == 2


def test_lesson_conversion_uses_timezone_and_fields():
    lesson = SimpleNamespace(
        start_time=datetime(2026, 11, 10, 8, 15), end_time=datetime(2026, 11, 10, 9, 45),
        subject="Matematik", rooms=["A1", "A2"], teachers=["MH"], homework="Side 42",
        lesson_id=777, status="Normal",
    )
    ev = lesson_to_event(lesson, TZ)
    assert ev.key == "lesson:777"
    assert ev.location == "A1, A2"
    assert ev.start.utcoffset() == timedelta(hours=1)  # vintertid i november
    assert "Side 42" in ev.description and "MH" in ev.description


def test_cancelled_lesson_is_marked_and_missing_id_falls_back():
    lesson = SimpleNamespace(start_time=datetime(2026, 11, 10, 8, 15), subject="Fysik",
                             status="Aflyst")
    ev = lesson_to_event(lesson, TZ)
    assert ev.summary == "[Aflyst] Fysik"
    assert ev.key.startswith("2026-11-10T08:15")
    assert ev.end - ev.start == timedelta(minutes=45)


def test_lesson_without_start_is_skipped():
    assert lesson_to_event(SimpleNamespace(subject="X"), TZ) is None
