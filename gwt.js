(() => {
  "use strict";

  // Henter skemaet direkte fra Studie+'s serverkald (GWT-RPC) i stedet for at læse siden.
  // GWT-RPC er Googles Web Toolkit's interne kaldformat; det er uofficielt og kan ændre sig,
  // så parseren er bevidst streng og stopper hellere end at gætte.
  const BASE = "https://all.uddataplus.dk";   // Studie+'s adresse
  const MODULE = "skema";                      // navnet på skema-modulet
  let discoveryPromise;                        // cache, så vi kun slår versionen op én gang

  // Finder de værdier, serveren kræver: GWT-"permutation" (version af klientkoden)
  // og skemaservicens hash. Begge står i Studie+'s egne JavaScript-filer og skifter ved opdateringer.
  function discover() {
    if (discoveryPromise) return discoveryPromise;
    discoveryPromise = (async () => {
      // Trin 1: hent modulets "loader"-fil
      const moduleBase = `${BASE}/${MODULE}/${MODULE}/`;
      const loader = await fetch(`${moduleBase}${MODULE}.nocache.js`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!loader.ok) throw new Error(`Studie+ loader HTTP ${loader.status}`);
      const loaderText = await loader.text();
      // Permutationen er en 32 tegn lang hex-streng i loaderen
      const permutation = loaderText.match(/='([A-F0-9]{32})'/)?.[1];
      if (!permutation) throw new Error("Kunne ikke finde Studie+ GWT-versionen.");

      // Trin 2: hent den version af klientkoden, der hører til permutationen
      const cache = await fetch(`${moduleBase}${permutation}.cache.js`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!cache.ok) throw new Error(`Studie+ cache HTTP ${cache.status}`);
      const cacheText = await cache.text();
      // Find alle service-hashes (navn + 32 tegn hex) og gør dem til et opslag: { skemaservice: "..." }
      const hashes = Object.fromEntries(
        [...cacheText.matchAll(/,'(\w+service)','([A-F0-9]{32})'/g)]
          .map(match => [match[1], match[2]])
      );
      if (!hashes.skemaservice) throw new Error("Studie+ skemaservice blev ikke fundet.");
      return { moduleBase, permutation, serviceHash: hashes.skemaservice };
    // Ved fejl nulstilles cachen, så næste kald prøver forfra
    })().catch(error => {
      discoveryPromise = null;
      throw error;
    });
    return discoveryPromise;
  }

  // Omsætter "ÅÅÅÅ-MM-DD" til GWT's datoformat (år regnes fra 1900, måned fra 0)
  function encodeDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return `5|6|${year - 1900}|${month - 1}|${day}|0|0|0|`;
  }

  // Pakker serverens svar ud. Svaret er "//OK" efterfulgt af JSON-lister, evt. sammenkædet
  // med ".concat(...)" når det er stort. Vi tæller parenteser (og ignorerer dem i tekststrenge)
  // for at finde enden på hver liste, og samler dem til én lang liste.
  function decodePayload(text) {
    let source = text.replace(/^\/\/OK/, "").trim(); // fjern svarpræfikset
    const chunks = [];
    while (source.length) {
      const start = source.indexOf("[");
      if (start < 0) throw new Error("Ugyldigt GWT-svar.");
      let depth = 0;
      let inString = false;
      let escaped = false;
      let end = -1;
      for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      if (end < 0) throw new Error("Ufuldstændigt GWT-svar.");
      chunks.push(JSON.parse(source.slice(start, end)));
      source = source.slice(end).trim();
      if (!source) break;
      if (!source.startsWith(".concat(") || !source.endsWith(")")) {
        throw new Error("Ukendt GWT-svarformat.");
      }
      source = source.slice(8, -1).trim();
    }
    // Saml alle lister til én
    return chunks.reduce((all, chunk) => all.concat(chunk), []);
  }


  // Tolker det udpakkede GWT-svar til en liste af lektioner.
  // Formatet: [...tal..., strengtabel, flags, version]. Strengtabellen ligger som tredje-sidste element,
  // og tallene før den er de egentlige data, som læses BAGFRA (højre mod venstre).
  // Hvert objekt læses felt for felt i præcis den rækkefølge, serveren har skrevet det;
  // felter vi ikke bruger, læses blot for at springe dem over.
  function parseScheduleData(decoded) {
    const strings = decoded.at(-3), data = decoded.slice(0, -3);
    if (!Array.isArray(strings) || !Array.isArray(data)) throw new Error("Ugyldigt GWT-datasæt.");
    let pos = data.length;  // læsepositionen; tæller nedad
    const objects = [];     // allerede læste objekter, så henvisninger (negative tal) kan genbruge dem
    // Læs næste rå værdi (bagfra)
    const pop = () => { if (--pos < 0) throw new Error("GWT-parseren løb tør for data."); return data[pos]; };
    // Læs en tekst: tallet er et 1-baseret indeks i strengtabellen (0 = tom/null)
    const readString = () => { const n=Number(pop()); return Number.isInteger(n)&&n>0&&n<=strings.length?strings[n-1]:""; };
    // Læs en sand/falsk-værdi
    const readBool = () => Boolean(pop());
    // Læs et objekt: negativt tal = henvisning til et tidligere objekt, 0 = null,
    // positivt tal = typenavn i strengtabellen, som sendes videre til deserialize()
    const readObject = () => {
      const n=Number(pop());
      if (!Number.isInteger(n)) throw new Error("Ugyldig objektreference i GWT-data.");
      if (n<0) { const value=objects[-(n+1)]; if(value===undefined) throw new Error("Ugyldig GWT-objektreference."); return value; }
      if (n===0) return null;
      const marker=strings[n-1];
      if(typeof marker!=="string"||!marker.includes("/")) return n;
      const name=marker.slice(0,marker.lastIndexOf("/"));
      const objectIndex=objects.length;
      objects.push(null);
      const value=deserialize(name);
      objects[objectIndex]=value;
      return value;
    };
    // Læs en liste (med loft på 10.000 elementer som sikkerhedsgrænse)
    const readList=()=>{const count=Number(pop());if(!Number.isInteger(count)||count<0||count>10000)throw new Error("Ugyldigt antal elementer i GWT-liste.");return Array.from({length:count},()=>readObject());};
    // Læs et opslag (nøgle -> værdi), samme sikkerhedsloft
    const readMap=()=>{const count=Number(pop());if(!Number.isInteger(count)||count<0||count>10000)throw new Error("Ugyldigt antal elementer i GWT-kort.");const map=new Map();for(let i=0;i<count;i++)map.set(readObject(),readObject());return map;};
    // Læs en dato: år (fra 1900), måned, dag, time, minut, sekund
    const readDate=()=>{pop();const year=Number(pop())+1900,month=Number(pop()),day=Number(pop()),hour=Number(pop()),minute=Number(pop()),second=Number(pop());const d=new Date(year,month,day,hour,minute,second);if(Number.isNaN(d.getTime()))throw new Error("Ugyldig dato i GWT-data.");return d;};
    // Læs en enum (opremsningsværdi); vi bruger ikke indholdet
    const readEnum=()=>({enumValue:pop()});
    // Aktivitet (feltet `d` bruges som klassenavn); lokale; medarbejder (lærer) - feltet `navn` bruges
    const readAktivitet=()=>{const a=pop(),b=pop(),c=readString(),d=readString(),e=pop();return {a,b,c,d,e};};
    const readLokale=()=>{const id=pop(),navn=readString(),c=pop();return {id,navn,c};};
    const readMedarbejder=()=>{const id=pop(),navn=readString(),c=pop(),d=readObject();return {id,navn,c,d};};
    // Skemanote: lektier og note som HTML og ren tekst, samt om der er filer
    const readNote=()=>{
      readObject();const id=pop(),className=readString(),containerId=pop(),hasFiles=readBool();
      const homeworkHtml=readString(),homeworkText=readString(),noteHtml=readString(),noteText=readString();
      readObject();readString();const fileContainerId=readObject();readObject();readObject();pop();pop();readString();
      return {id,className,containerId,hasFiles,homeworkHtml,homeworkText,noteHtml,noteText,fileContainerId};
    };
    // Én lektion (SkemaBegivenhed). De mange tomme readX()/pop()-kald springer felter over,
    // som vi ikke bruger; rækkefølgen skal passe præcist med serverens format.
    const readLesson=()=>{
      // Standardværdier, der overskrives af det vi finder
      const lesson={lessonId:0,subject:"",className:"",teachers:[],rooms:[],start:null,end:null,note:"",homework:"",hasFiles:false,fileContainerId:null};
      readObject();readString();readObject();readObject();
      const activities=readObject();if(Array.isArray(activities))lesson.className=activities.find(x=>x&&x.d)?.d||"";
      const remark=readString();
      readString();readBool();pop();readObject();readObject();pop();readObject();readBool();readObject();readObject();pop();readObject();pop();
      lesson.subject=readString();readBool();pop();
      const rooms=readObject();if(Array.isArray(rooms))lesson.rooms=rooms.map(x=>x&&x.navn).filter(Boolean);
      readBool();const teachers=readObject();if(Array.isArray(teachers))lesson.teachers=teachers.map(x=>x&&x.navn).filter(Boolean);
      readBool();readString();readObject();readString();readBool();readString();readBool();readObject();readObject();
      const id=readObject();if(Number.isInteger(id))lesson.lessonId=id;
      readObject();readString();const end=readObject(),start=readObject();
      if(end instanceof Date)lesson.end=end;if(start instanceof Date)lesson.start=start;
      readObject();pop();readBool();if(remark)lesson.note=remark;return lesson;
    };
    // Hele personens skema: lektioner grupperet pr. dato (med en ældre liste som reserve)
    // samt noter, som flettes ind på lektionerne via lektions-id
    const readPers=()=>{
      readObject();readObject();readObject();const legacy=readObject();
      readObject();readObject();readObject();readObject();
      pop();pop();pop();pop();pop();readObject();readBool();pop();pop();
      readObject();readObject();readObject();const byDate=readObject(),notes=readObject();
      const lessons=[];if(byDate instanceof Map)for(const values of byDate.values())if(Array.isArray(values))lessons.push(...values);
      if(!lessons.length&&Array.isArray(legacy))lessons.push(...legacy);
      for(const lesson of lessons){const note=notes instanceof Map?(notes.get(lesson.lessonId)||notes.get(String(lesson.lessonId))):null;if(!note)continue;
        lesson.homework=note.homeworkText||note.homeworkHtml||"";
        if(!lesson.note)lesson.note=note.noteText||note.noteHtml||"";
        lesson.hasFiles=Boolean(note.hasFiles);lesson.fileContainerId=note.fileContainerId??null;
      }
      return lessons;
    };
    // Vælger den rigtige læser ud fra Java-klassenavnet. Ukendte typer stopper synkroniseringen,
    // så vi aldrig gætter på et format, vi ikke kender.
    const deserialize=name=>{
      switch(name){
        // Almindelige typer: lister, opslag, tal, sand/falsk og datoer
        case "java.util.ArrayList":return readList();
        case "java.util.HashMap":return readMap();
        case "java.lang.Integer":return pop();
        case "java.lang.Boolean":return readBool();
        case "dk.uddata.gwt.comm.shared.UDate":return readDate();
        // Studie+'s egne typer: skema, lektion og de objekter, der hænger på en lektion
        case "dk.uddata.model.skema.PersSkemaData":return readPers();
        case "dk.uddata.model.skema.SkemaBegivenhed":return readLesson();
        case "dk.uddata.model.skema.SkemaBegivenhed$LokalerISkema":return readLokale();
        case "dk.uddata.model.skema.SkemaBegivenhed$MedarbejderISkema":return readMedarbejder();
        case "dk.uddata.model.skema.SkemaBegivenhed$AktiviteterISkema":return readAktivitet();
        case "dk.uddata.model.skema.SkemaBegivenhed$ElevISkema":return {a:readString(),b:readString(),c:pop(),d:readString()};
        case "dk.uddata.model.skema.SkemaBegivenhed$FagISkema":return {a:pop(),b:readString()};
        case "dk.uddata.model.skemanoter.SkemaNote2":return readNote();
        case "dk.uddata.model.skemanoter.Note":return {objectId:readObject(),user:readObject(),note:readObject()};
        // "Bogus" afvises udtrykkeligt
        case "dk.uddata.model.skema.Bogus":throw new Error("Ukendt GWT-datatype: "+name);
        // Typer vi ikke bruger indholdet af (fravær, årsager m.m.): felterne læses bare for at springe dem over
        case "dk.uddata.model.skema.Aarstyp":
          readObject();readObject();pop();readObject();readString();readObject();return {};
        case "dk.uddata.model.skema.Frareg":pop();pop();pop();readObject();return {};
        case "dk.uddata.model.skema.Frava":
          readObject();pop();readObject();readObject();readString();readString();readObject();readObject();readObject();readString();return {};
        case "dk.uddata.model.skema.Fraver":
          readObject();pop();pop();readObject();readObject();pop();readString();readString();pop();readObject();return {};
        case "dk.uddata.model.skema.Fravk":
          readString();readString();readString();readObject();readObject();return {};
        case "dk.uddata.model.bruger.Skemaelev":
          readObject();readObject();readObject();readString();readObject();readString();readObject();readString();readString();return {};
        case "dk.uddata.model.skema.SkemaUvfo":
          pop();readObject();readObject();readString();pop();readObject();readString();pop();pop();pop();pop();readObject();readObject();return {};
        // Alle enum-typer læses på samme måde
        case "dk.uddata.model.skema.SkemaBegivenhed$Status":
        case "dk.uddata.model.skema.Aarstyp$AarsagsType":
        case "dk.uddata.model.skema.Aarstyp$AmuKode":
        case "dk.uddata.model.skema.Aarstyp$Status":
        case "dk.uddata.model.skema.Frareg$Status":
        case "dk.uddata.model.skema.Frava$Status":
        case "dk.uddata.model.skema.Fraver$Status":
        case "dk.uddata.model.skema.Fravk$FravkStatus":
        case "dk.uddata.model.skema.SkemaTools$FravaStatus":
        case "dk.uddata.model.skema.SkemaTools$RegModel":
        case "dk.uddata.model.skema.SkemaTools$RegStatus":return readEnum();
        // Alt andet er ukendt: stop af sikkerhedshensyn
        default:throw new Error("Ukendt GWT-datatype: "+name+". Synkronisering er stoppet af sikkerhedshensyn.");
      }
    };
    // Start fra roden: det yderste objekt skal være en liste af lektioner
    const root=readObject();
    if(!Array.isArray(root))throw new Error("GWT-dataene indeholdt ikke en gyldig lektionsliste.");
    // Omsæt hver lektion til det format resten af udvidelsen bruger
    // (dato "ÅÅÅÅ-MM-DD", tider "TT:MM", lærere og lokaler som kommasepareret tekst)
    return root.map(lesson=>{
      // Bookinger (fx "Anden aktivitet", "Elevråd") har intet fag, kun en aktivitetstype.
      if(!lesson.subject)lesson.subject=lesson.className||(lesson.note&&lesson.note.split("\n")[0].trim())||"Booking";
      if(!(lesson.start instanceof Date)||!(lesson.end instanceof Date))throw new Error("En lektion mangler dato eller tid. Synkronisering er stoppet.");
      const date=[lesson.start.getFullYear(),String(lesson.start.getMonth()+1).padStart(2,"0"),String(lesson.start.getDate()).padStart(2,"0")].join("-");
      const start=String(lesson.start.getHours()).padStart(2,"0")+":"+String(lesson.start.getMinutes()).padStart(2,"0");
      const end=String(lesson.end.getHours()).padStart(2,"0")+":"+String(lesson.end.getMinutes()).padStart(2,"0");
      return {id:String(lesson.lessonId||[date,start,lesson.subject].join("|")),lessonId:lesson.lessonId,date,start,end,subject:lesson.subject,teacher:lesson.teachers.join(", "),room:lesson.rooms.join(", "),homework:lesson.homework,note:lesson.note,hasFiles:lesson.hasFiles,fileContainerId:lesson.fileContainerId};
    });
  }

  // Henter skemaet for en periode ("ÅÅÅÅ-MM-DD" til "ÅÅÅÅ-MM-DD") og returnerer lektionerne
  async function fetchSchedule(startDate, endDate) {
    const config = await discover();
    // Selve RPC-kaldet: serverens adresse, servicens hash, metoden "hentEgnePersSkemaData"
    // og start- og slutdato, alt adskilt af |
    const payload =
      "7|0|6|" +
      config.moduleBase + "|" +
      config.serviceHash + "|" +
      "dk.uddata.services.interfaces.SkemaService|" +
      "hentEgnePersSkemaData|" +
      "dk.uddata.gwt.comm.shared.UDate/2314285719|" +
      "UDate:|1|2|3|4|2|5|5|" +
      encodeDate(startDate) +
      encodeDate(endDate);

    // Send kaldet med brugerens egen login-session (cookies)
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
    // "//EX" betyder, at serveren svarede med en fejl; forsøg at udtrække en læsbar fejltekst
    if (body.startsWith("//EX")) {
      let detail = "Ukendt serverfejl.";
      try {
        const payload = JSON.parse(body.slice(4));
        const strings = [];
        const collect = value => {
          if (typeof value === "string") strings.push(value);
          else if (Array.isArray(value)) value.forEach(collect);
        };
        collect(payload);
        const useful = strings
          .filter(value => value.length > 2 && !/^\\d+$/.test(value))
          .map(value => value.replace(/[\r\n\t]+/g, " "));
        if (useful.length) detail = useful.join(" | ").slice(0, 12000);
      } catch {
        detail = body.slice(4, 184).replace(/[\\r\\n\\t]+/g, " ");
      }
      throw new Error("Studie+ GWT-fejl: " + detail);
    }
    // Et gyldigt svar skal starte med "//OK"
    if (!body.startsWith("//OK")) {
      throw new Error("Studie+ returnerede ikke et gyldigt skemasvar.");
    }

    // Pak svaret ud, kontrollér formen, og tolk det til lektioner
    const decoded = decodePayload(body);
    if (!Array.isArray(decoded) || decoded.length < 3 || !Array.isArray(decoded.at(-3))) {
      throw new Error("Studie+ skemasvaret havde et ukendt format.");
    }

    const lessons = parseScheduleData(decoded);
    if (!lessons.length) throw new Error("Studie+ returnerede ingen lektioner for perioden.");
    return { ok: true, lessons, responsePrefix: "//OK", stringCount: decoded.at(-3).length, dataCount: decoded.length - 3 };
  }

  // Gør funktionen tilgængelig for content.js
  window.StudySyncGwt = { fetchSchedule };
})();