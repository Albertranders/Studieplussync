// Ren synkroniseringslogik uden netværk eller browser-API'er (kan derfor testes med `node --test`).

// Navne på de skjulte "private extended properties" vi gemmer på hvert Google-event
export const MANAGED_KEY = "studiesyncKey";   // stabil nøgle, så vi kan genkende en lektion næste gang
export const MANAGED_HASH = "studiesyncHash"; // fingeraftryk af indholdet, så vi kun opdaterer ved ændringer
export const TIME_ZONE = "Europe/Copenhagen";

// Nøglen der identificerer en lektion: Studie+'s id, eller en sammensat nøgle hvis id mangler
export function stableKey(lesson) {
  return String(lesson.id || `${lesson.date}|${lesson.start}|${lesson.subject}`);
}

// Omsætter en lektion til det JSON-objekt, Google Calendar API forventer
export function eventBody(lesson) {
  // Beskrivelsen samles af lærer, lektier og note – tomme dele springes over
  const description = [
    lesson.teacher ? `Lærer: ${lesson.teacher}` : "",
    lesson.homework ? `Lektier:\n${lesson.homework}` : "",
    lesson.note ? `Note:\n${lesson.note}` : ""
  ].filter(Boolean).join("\n\n");

  // Farve i Google Kalender: 9 = blå (lektier), 10 = grøn (kun note), 5 = gul (intet)
  const colorId = lesson.homework ? "9" : lesson.note ? "10" : "5";
  return {
    summary: lesson.subject || "Lektion", // eventets titel
    location: lesson.room || "",
    description,
    colorId,
    start: { dateTime: `${lesson.date}T${lesson.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${lesson.date}T${lesson.end}:00`, timeZone: TIME_ZONE }
  };
}

// "Hash" af indholdet. Her bruges selve event-teksten som fingeraftryk:
// ændres noget i eventet, ændres strengen, og vi ved at det skal opdateres
export function contentHash(lesson) {
  const body = eventBody(lesson);
  return JSON.stringify(body);
}

// Sammenligner ønsket skema med de events, der allerede ligger i kalenderen,
// og finder ud af hvad der skal oprettes, opdateres og slettes
export function buildPlan(lessons, existing) {
  const plan = { create: [], update: [], delete: [], unchanged: 0 };

  // Ønskede lektioner efter nøgle; ved dubletter beholdes kun den første
  const wanted = new Map();
  for (const lesson of lessons) {
    const key = stableKey(lesson);
    if (wanted.has(key)) continue;
    wanted.set(key, lesson);
  }

  // Eksisterende events som vi selv har oprettet (de har vores skjulte nøgle)
  const managed = new Map();
  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    const key = props[MANAGED_KEY];
    if (!key) continue; // ikke vores event: rør det aldrig
    if (managed.has(key)) {
      plan.delete.push(event.id); // dublet i kalenderen: slet den ekstra
      continue;
    }
    managed.set(key, event);
  }

  for (const [key, lesson] of wanted) {
    const old = managed.get(key);
    if (!old) {
      plan.create.push({ key, lesson }); // findes ikke endnu: opret
      continue;
    }
    const hash = contentHash(lesson);
    if (old.extendedProperties?.private?.[MANAGED_HASH] !== hash) {
      plan.update.push({ id: old.id, key, lesson }); // indholdet er ændret: opdater
    } else {
      plan.unchanged += 1; // identisk: gør intet
    }
  }

  // Events vi har oprettet, men som ikke længere er i skemaet, slettes
  for (const [key, event] of managed) {
    if (!wanted.has(key)) plan.delete.push(event.id);
  }
  return plan;
}

// Sikkerhedstjek: skemaet skal være en ikke-tom liste, hvor hver lektion har dato, tider og fag
export function isSafeSchedule(lessons) {
  return Array.isArray(lessons) && lessons.length > 0 &&
    lessons.every(l => l.date && l.start && l.end && l.subject);
}

// Sikkerhedsnet: hvis Studie+ pludselig viser under halvdelen af de eksisterende lektioner
// (og der er mindst 4), er det sandsynligvis en fejl, og vi stopper i stedet for at slette
export function isSuspiciousDrop(existingCount, newCount) {
  return existingCount >= 4 && newCount < Math.ceil(existingCount * 0.5);
}
