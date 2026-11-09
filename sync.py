#!/usr/bin/env python3
"""Henter dit skema fra Studie+ og holder en Google Kalender opdateret.

Kør:        python sync.py
Prøvekørsel: python sync.py --dry-run   (viser hvad der ville ske, ændrer intet)
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sync_logic import plan_sync
from studieplus_source import (build_browser_scraper, build_password_scraper,
                               fetch_lessons, lesson_to_event)

HERE = Path(__file__).resolve().parent


def load_env(path: Path) -> None:
    """Minimal .env-læser, så vi ikke behøver ekstra pakker."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]  # fjern kun ét par omsluttende anførselstegn
        name = name.strip()
        if not os.environ.get(name):
            os.environ[name] = value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weeks", type=int, help="Antal uger frem (standard 8)")
    parser.add_argument("--dry-run", action="store_true", help="Vis kun hvad der ville ske")
    parser.add_argument("--force", action="store_true",
                        help="Tillad sletning, selvom Studie+ returnerede et helt tomt skema")
    args = parser.parse_args()

    load_env(HERE / ".env")
    cookie = os.environ.get("STUDIEPLUS_COOKIE", "").strip()
    cfg = {k: os.environ.get(k, "") for k in
           ("STUDIEPLUS_USERNAME", "STUDIEPLUS_PASSWORD", "STUDIEPLUS_SCHOOL")}
    missing = [k for k, v in cfg.items() if not v]
    if missing and not cookie:
        print("Mangler i .env: enten STUDIEPLUS_COOKIE (login via browseren) eller "
              f"{', '.join(missing)}", file=sys.stderr)
        return 1

    weeks = args.weeks or int(os.environ.get("WEEKS_AHEAD", "8"))
    tz_name = os.environ.get("TIMEZONE", "Europe/Copenhagen")
    calendar_name = os.environ.get("CALENDAR_NAME", "Studie+ skema")
    tz = ZoneInfo(tz_name)

    today = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = today - timedelta(days=today.weekday())  # mandag i denne uge
    window_end = window_start + timedelta(days=7 * weeks)

    # 1) Hent skemaet. Går noget galt her, stopper vi, før kalenderen røres.
    try:
        if cookie:
            scraper = build_browser_scraper(cookie)
        else:
            scraper = build_password_scraper(
                cfg["STUDIEPLUS_USERNAME"], cfg["STUDIEPLUS_PASSWORD"], cfg["STUDIEPLUS_SCHOOL"])
        lessons = fetch_lessons(
            scraper,
            window_start.replace(tzinfo=None),
            (window_end - timedelta(days=1)).replace(tzinfo=None),
        )
    except Exception as err:  # noqa: BLE001
        if cookie:
            hint = ("Sessionen er sandsynligvis udløbet: log ind på Studie+ i browseren og "
                    "kopiér en ny cookie ind i STUDIEPLUS_COOKIE i .env.")
        else:
            hint = ("Hvis fejlen fortsætter, har Studie+ måske ændret sig. Prøv: "
                    "pip install --upgrade "
                    "'studieplus-api @ git+https://github.com/ccoodduu/studieplus-api'")
        print(f"Kunne ikke hente skemaet fra Studie+: {err}\n"
              f"Kalenderen er ikke ændret. {hint}", file=sys.stderr)
        return 1

    desired = [e for e in (lesson_to_event(x, tz) for x in lessons) if e]
    print(f"Hentede {len(desired)} lektioner fra Studie+ "
          f"({window_start:%d-%m-%Y} til {window_end - timedelta(days=1):%d-%m-%Y}).")

    # 2) Sammenlign med Google Kalender.
    from gcal import apply_plan, ensure_calendar, get_service, list_managed_events

    try:
        service = get_service(HERE / "credentials.json", HERE / "token.json")
        calendar_id = ensure_calendar(service, HERE / "state.json", calendar_name, tz_name)
        existing = list_managed_events(service, calendar_id, window_start, window_end)
    except Exception as err:  # noqa: BLE001
        print(f"Problem med Google Kalender: {err}\n"
              "Hvis login er udløbet: slet token.json og kør igen.", file=sys.stderr)
        return 1

    plan = plan_sync(desired, existing)
    print(f"Plan: {plan.summary()}.")

    # Sikkerhedsnet: et helt tomt skema er mere sandsynligt en fejl end virkelighed.
    if not desired and existing and not args.force:
        print("Studie+ gav et tomt skema, men kalenderen har events. Springer sletning over "
              "(brug --force, hvis det er rigtigt).", file=sys.stderr)
        return 2

    if args.dry_run:
        print("Prøvekørsel: ingen ændringer foretaget.")
        return 0

    apply_plan(service, calendar_id, plan, tz_name)
    print("Færdig.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
