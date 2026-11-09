"""Henter skemaet fra Studie+ og oversætter lektioner til LessonEvent.

Selve snakken med Studie+ klares af det uofficielle open source-bibliotek
`studieplus-api` (github.com/ccoodduu/studieplus-api).
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sync_logic import LessonEvent

DEFAULT_LESSON_LENGTH = timedelta(minutes=45)  # bruges kun hvis slut-tid mangler

# Farver i Google Kalender (faste farve-id'er 1-11, frie farver findes ikke).
COLOR_HOMEWORK = "9"   # Blueberry (blå): lektie, med eller uden note
COLOR_NOTE = "10"      # Basil (grøn): kun note
COLOR_NOTHING = "5"    # Banana (gul): hverken lektie eller note


def _first(obj, names, default=None):
    """Første attribut på obj der har en værdi (tåler at feltnavne varierer)."""
    for name in names:
        value = getattr(obj, name, None)
        if value not in (None, "", [], ()):
            return value
    return default


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return ", ".join(_as_text(v) for v in value if v)
    return str(value).strip()


def _clean_text(value) -> str:
    """Som _as_text, men fjerner evt. HTML og tomme linjer (Studie+ kan sende rig tekst)."""
    text = _as_text(value)
    if not text:
        return ""
    text = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</div>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def _to_dt(value, tz: ZoneInfo) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if value.tzinfo is None:
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)


def lesson_to_event(lesson, tz: ZoneInfo) -> LessonEvent | None:
    raw_start = _first(lesson, ("start_time", "start"))
    if raw_start is None:
        return None
    start = _to_dt(raw_start, tz)

    raw_end = _first(lesson, ("end_time", "end"))
    end = _to_dt(raw_end, tz) if raw_end is not None else start + DEFAULT_LESSON_LENGTH

    subject = _as_text(_first(lesson, ("subject", "name", "title"))) or "Lektion"
    rooms = _as_text(_first(lesson, ("rooms", "room")))
    teachers = _as_text(_first(lesson, ("teachers", "teacher")))
    homework = _clean_text(_first(lesson, ("homework",)))
    note = _clean_text(_first(lesson, ("note",)))
    status = _as_text(_first(lesson, ("status",))).lower()

    if any(word in status for word in ("aflys", "cancel")):
        subject = f"[Aflyst] {subject}"

    has_homework = bool(homework) or bool(_first(lesson, ("has_homework",)))
    has_note = bool(note) or bool(_first(lesson, ("has_note",)))
    if has_homework:
        color_id = COLOR_HOMEWORK
    elif has_note:
        color_id = COLOR_NOTE
    else:
        color_id = COLOR_NOTHING

    parts = []
    if teachers:
        parts.append(f"Lærer: {teachers}")
    if homework:
        parts.append(f"Lektier:\n{homework}")
    if note:
        parts.append(f"Note:\n{note}")
    if _first(lesson, ("has_files",)):
        parts.append("Der er filer til lektionen i Studie+.")

    lesson_id = _first(lesson, ("lesson_id", "id"))
    key = f"lesson:{lesson_id}" if lesson_id else f"{start.isoformat()}|{subject}"

    return LessonEvent(
        key=key,
        summary=subject,
        start=start,
        end=end,
        location=rooms,
        description="\n\n".join(parts),
        color_id=color_id,
    )


class SessionExpired(Exception):
    """Browser-sessionen er udløbet, og der skal kopieres en ny cookie ind."""


def parse_cookie_header(header: str) -> dict:
    """Omsætter en Cookie-header fra browseren ("a=1; b=2") til en dict."""
    header = header.strip()
    if header.lower().startswith("cookie:"):
        header = header[len("cookie:"):].strip()
    cookies = {}
    for part in header.split(";"):
        name, sep, value = part.strip().partition("=")  # værdier kan selv indeholde =
        if sep and name:
            cookies[name] = value
    return cookies


def build_password_scraper(username: str, password: str, school: str):
    """Login med brugernavn og kodeord direkte på Studie+ (virker ikke med UNI•Login-omstilling)."""
    from studieplus_api import StudiePlusRequestsScraper  # importeres først her

    return StudiePlusRequestsScraper(username=username, password=password, school=school)


def build_browser_scraper(cookie_header: str):
    """Genbruger en session, du allerede har logget ind på i din browser.

    Cookien giver adgang til din Studie+-konto, så den skal behandles som et kodeord.
    """
    from studieplus_api import StudiePlusRequestsScraper  # importeres først her

    cookies = parse_cookie_header(cookie_header)
    if not cookies:
        raise ValueError("STUDIEPLUS_COOKIE er tom eller kan ikke læses")

    class BrowserSessionScraper(StudiePlusRequestsScraper):
        def login(self):
            if self.logged_in:
                return True
            # Biblioteket kalder login() igen, når Studie+ svarer 401 (session udløbet).
            raise SessionExpired(
                "Studie+ afviste sessionen (udløbet). Log ind i browseren igen og "
                "kopiér en ny cookie ind i STUDIEPLUS_COOKIE i .env."
            )

    scraper = BrowserSessionScraper()
    for name, value in cookies.items():
        scraper.session.cookies.set(name, value, domain="all.studieplus.dk", path="/")
    scraper.logged_in = True
    return scraper


def fetch_lessons(scraper, start: datetime, end: datetime) -> list:
    """Henter lektioner uge for uge. Kaster en fejl, hvis noget går galt.

    Biblioteket parser strengt: hvis Studie+ har ændret sit format, får vi en
    fejl i stedet for et tomt eller forkert skema. Så rører vi ikke kalenderen.
    """
    scraper.login()

    lessons = []
    current = start
    while current <= end:
        week_end = min(current + timedelta(days=6), end)
        lessons.extend(scraper.get_lessons_in_range(current, week_end))
        current += timedelta(days=7)
    return lessons
