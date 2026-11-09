"""Ren logik uden netværk: find ud af hvad der skal oprettes, opdateres og slettes.

Hvert event vi opretter i Google Kalender får to skjulte felter:
  spKey  - en stabil nøgle for lektionen (så vi kan genkende den næste gang)
  spHash - et fingeraftryk af indholdet (så vi kun opdaterer, når noget er ændret)
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, replace
from datetime import datetime

KEY_PROP = "spKey"
HASH_PROP = "spHash"


@dataclass(frozen=True)
class LessonEvent:
    key: str
    summary: str
    start: datetime  # skal have tidszone
    end: datetime  # skal have tidszone
    location: str = ""
    description: str = ""
    color_id: str = ""  # Google Kalenders event-farve (1-11), tom = kalenderens standardfarve

    def content_hash(self) -> str:
        payload = json.dumps(
            [
                self.summary,
                self.start.isoformat(),
                self.end.isoformat(),
                self.location,
                self.description,
                self.color_id,
            ],
            ensure_ascii=False,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def to_google_body(self, tz_name: str) -> dict:
        return {
            "summary": self.summary,
            "location": self.location,
            "description": self.description,
            **({"colorId": self.color_id} if self.color_id else {}),
            "start": {"dateTime": self.start.isoformat(), "timeZone": tz_name},
            "end": {"dateTime": self.end.isoformat(), "timeZone": tz_name},
            "extendedProperties": {
                "private": {KEY_PROP: self.key, HASH_PROP: self.content_hash()}
            },
        }


@dataclass
class Plan:
    create: list = field(default_factory=list)  # [LessonEvent]
    update: list = field(default_factory=list)  # [(google_event_id, LessonEvent)]
    delete: list = field(default_factory=list)  # [google_event_id]
    unchanged: int = 0

    def summary(self) -> str:
        return (
            f"{len(self.create)} nye, {len(self.update)} ændrede, "
            f"{len(self.delete)} slettes, {self.unchanged} uændrede"
        )


def dedupe_keys(events: list[LessonEvent]) -> list[LessonEvent]:
    """Sørger for at hver nøgle er unik, hvis to lektioner skulle få samme nøgle."""
    seen: dict[str, int] = {}
    result = []
    for ev in events:
        n = seen.get(ev.key, 0) + 1
        seen[ev.key] = n
        result.append(ev if n == 1 else replace(ev, key=f"{ev.key}#{n}"))
    return result


def plan_sync(desired: list[LessonEvent], existing: list[dict]) -> Plan:
    """Sammenlign ønsket skema med de events, der allerede ligger i kalenderen.

    `existing` er event-dicts fra Google Calendar API. Events uden vores spKey
    (fx noget du selv har lagt i kalenderen) bliver aldrig rørt.
    """
    plan = Plan()
    desired = dedupe_keys(desired)

    by_key: dict[str, tuple[str, str | None]] = {}
    for ev in existing:
        props = (ev.get("extendedProperties") or {}).get("private") or {}
        key = props.get(KEY_PROP)
        if not key:
            continue
        if key in by_key:  # dublet fx efter en afbrudt kørsel
            plan.delete.append(ev["id"])
            continue
        by_key[key] = (ev["id"], props.get(HASH_PROP))

    wanted = set()
    for item in desired:
        wanted.add(item.key)
        found = by_key.get(item.key)
        if found is None:
            plan.create.append(item)
        elif found[1] != item.content_hash():
            plan.update.append((found[0], item))
        else:
            plan.unchanged += 1

    for key, (google_id, _) in by_key.items():
        if key not in wanted:
            plan.delete.append(google_id)

    return plan
