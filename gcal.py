"""Tynd indpakning om Google Calendar API.

Vi bruger scope `calendar.app.created`: appen kan kun oprette sin egen kalender
og ændre events i den. Den kan hverken se eller ændre dine andre kalendere.
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

from sync_logic import KEY_PROP, Plan

SCOPES = ["https://www.googleapis.com/auth/calendar.app.created"]
RETRY_STATUSES = (429, 500, 502, 503, 504)


def get_service(credentials_file: Path, token_file: Path):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
            creds = flow.run_local_server(port=0)
        token_file.write_text(creds.to_json())
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _execute(request, tries: int = 5):
    from googleapiclient.errors import HttpError

    for attempt in range(tries):
        try:
            return request.execute()
        except HttpError as err:
            status = err.resp.status
            rate_limited = status == 403 and "ratelimit" in str(err).lower()
            if attempt == tries - 1 or not (status in RETRY_STATUSES or rate_limited):
                raise
            time.sleep(2 ** attempt)


def ensure_calendar(service, state_file: Path, name: str, tz_name: str) -> str:
    """Finder (eller opretter) den dedikerede kalender og husker dens id."""
    from googleapiclient.errors import HttpError

    if state_file.exists():
        calendar_id = json.loads(state_file.read_text()).get("calendar_id")
        if calendar_id:
            try:
                _execute(service.calendars().get(calendarId=calendar_id))
                return calendar_id
            except HttpError as err:
                if err.resp.status not in (403, 404, 410):
                    raise  # kalenderen er slettet: opret en ny nedenfor

    created = _execute(
        service.calendars().insert(body={"summary": name, "timeZone": tz_name})
    )
    state_file.write_text(json.dumps({"calendar_id": created["id"]}))
    return created["id"]


def list_managed_events(service, calendar_id: str,
                        time_min: datetime, time_max: datetime) -> list[dict]:
    events, page_token = [], None
    while True:
        resp = _execute(
            service.events().list(
                calendarId=calendar_id,
                timeMin=time_min.isoformat(),
                timeMax=time_max.isoformat(),
                singleEvents=True,
                showDeleted=False,
                maxResults=2500,
                pageToken=page_token,
            )
        )
        events.extend(resp.get("items", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return [e for e in events
            if KEY_PROP in ((e.get("extendedProperties") or {}).get("private") or {})]


def apply_plan(service, calendar_id: str, plan: Plan, tz_name: str) -> None:
    for item in plan.create:
        _execute(service.events().insert(calendarId=calendar_id,
                                         body=item.to_google_body(tz_name)))
    for google_id, item in plan.update:
        _execute(service.events().update(calendarId=calendar_id, eventId=google_id,
                                         body=item.to_google_body(tz_name)))
    for google_id in plan.delete:
        _execute(service.events().delete(calendarId=calendar_id, eventId=google_id))
