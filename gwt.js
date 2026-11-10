(() => {
  "use strict";

  const BASE = "https://all.uddataplus.dk";
  const MODULE = "skema";
  let discoveryPromise;

  function discover() {
    if (discoveryPromise) return discoveryPromise;
    discoveryPromise = (async () => {
      const moduleBase = `${BASE}/${MODULE}/${MODULE}/`;
      const loader = await fetch(`${moduleBase}${MODULE}.nocache.js`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!loader.ok) throw new Error(`Studie+ loader HTTP ${loader.status}`);
      const loaderText = await loader.text();
      const permutation = loaderText.match(/='([A-F0-9]{32})'/)?.[1];
      if (!permutation) throw new Error("Kunne ikke finde Studie+ GWT-versionen.");

      const cache = await fetch(`${moduleBase}${permutation}.cache.js`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!cache.ok) throw new Error(`Studie+ cache HTTP ${cache.status}`);
      const cacheText = await cache.text();
      const hashes = Object.fromEntries(
        [...cacheText.matchAll(/,'(\w+service)','([A-F0-9]{32})'/g)]
          .map(match => [match[1], match[2]])
      );
      if (!hashes.skemaservice) throw new Error("Studie+ skemaservice blev ikke fundet.");
      return { moduleBase, permutation, serviceHash: hashes.skemaservice };
    })().catch(error => {
      discoveryPromise = null;
      throw error;
    });
    return discoveryPromise;
  }

  function encodeDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return `5|6|${year - 1900}|${month - 1}|${day}|0|0|0|`;
  }

  function decodePayload(text) {
    const source = text.replace(/^\/\/OK/, "").trim();
    const decoder = new Function("return (" + source + ")");
    return decoder();
  }

  async function fetchSchedule(startDate, endDate) {
    const config = await discover();
    const payload =
      "7|0|6|" +
      config.moduleBase +
      config.serviceHash + "|" +
      "dk.uddata.services.interfaces.SkemaService|" +
      "hentEgnePersSkemaData|" +
      "dk.uddata.gwt.comm.shared.UDate/2314285719|" +
      "UDate:|1|2|3|4|2|5|5|" +
      encodeDate(startDate) +
      encodeDate(endDate);

    const response = await fetch(`${BASE}/skema/skema/skemaservice`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "text/x-gwt-rpc; charset=UTF-8",
        "X-GWT-Permutation": config.permutation,
        "X-GWT-Module-Base": config.moduleBase,
        "modulename": MODULE
      },
      body: payload
    });

    const body = await response.text();
    if (!response.ok) throw new Error(`Studie+ skemakald HTTP ${response.status}`);
    if (body.startsWith("//EX")) throw new Error("Studie+ returnerede en GWT-fejl.");
    if (!body.startsWith("//OK")) {
      throw new Error("Studie+ returnerede ikke et gyldigt skemasvar.");
    }

    const decoded = decodePayload(body);
    if (!Array.isArray(decoded) || decoded.length < 3 || !Array.isArray(decoded.at(-3))) {
      throw new Error("Studie+ skemasvaret havde et ukendt format.");
    }

    return {
      ok: true,
      responsePrefix: "//OK",
      stringCount: decoded.at(-3).length,
      dataCount: decoded.length - 3
    };
  }

  window.StudySyncGwt = { fetchSchedule };
})();