"use strict";(()=>{function Tt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var Ct=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function V(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var J=null;function Pe(e={}){return J||(e.includeStyleProperties?(J=e.includeStyleProperties,J):(J=V(window.getComputedStyle(document.documentElement)),J))}function Le(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Sr(e){let t=Le(e,"border-left-width"),n=Le(e,"border-right-width");return e.clientWidth+t+n}function Tr(e){let t=Le(e,"border-top-width"),n=Le(e,"border-bottom-width");return e.clientHeight+t+n}function Ze(e,t={}){let n=t.width||Sr(e),r=t.height||Tr(e);return{width:n,height:r}}function Lt(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var W=16384;function Pt(e){(e.width>W||e.height>W)&&(e.width>W&&e.height>W?e.width>e.height?(e.height*=W/e.width,e.width=W):(e.width*=W/e.height,e.height=W):e.width>W?(e.height*=W/e.width,e.width=W):(e.width*=W/e.height,e.height=W))}function ee(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function Cr(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Mt(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),Cr(o)}var $=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||$(n,t)};function Lr(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function Pr(e,t){return Pe(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function Mr(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?Lr(n):Pr(n,r);return document.createTextNode(`${o}{${i}}`)}function Rt(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let a=Ct();try{t.className=`${t.className} ${a}`}catch{return}let s=document.createElement("style");s.appendChild(Mr(a,n,o,r)),t.appendChild(s)}function zt(e,t,n){Rt(e,t,":before",n),Rt(e,t,":after",n)}var At="application/font-woff",It="image/jpeg",Rr={woff:At,woff2:At,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:It,jpeg:It,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function zr(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function te(e){let t=zr(e).toLowerCase();return Rr[t]||""}function Ar(e){return e.split(/,/)[1]}function de(e){return e.search(/^(data:)/)!==-1}function Je(e,t){return`data:${t};base64,${e}`}async function et(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,a)=>{let s=new FileReader;s.onerror=a,s.onloadend=()=>{try{i(n({res:r,result:s.result}))}catch(l){a(l)}},s.readAsDataURL(o)})}var Qe={};function Ir(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function ne(e,t,n){let r=Ir(e,t,n.includeQueryParams);if(Qe[r]!=null)return Qe[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await et(e,n.fetchRequestInit,({res:a,result:s})=>(t||(t=a.headers.get("Content-Type")||""),Ar(s)));o=Je(i,t)}catch(i){o=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;i&&(a=typeof i=="string"?i:i.message),a&&console.warn(a)}return Qe[r]=o,o}async function Dr(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):ee(t)}async function Fr(e,t){if(e.currentSrc){let i=document.createElement("canvas"),a=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,a?.drawImage(e,0,0,i.width,i.height);let s=i.toDataURL();return ee(s)}let n=e.poster,r=te(n),o=await ne(n,r,t);return ee(o)}async function $r(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await ue(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Br(e,t){return $(e,HTMLCanvasElement)?Dr(e):$(e,HTMLVideoElement)?Fr(e,t):$(e,HTMLIFrameElement)?$r(e,t):e.cloneNode(Dt(e))}var _r=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",Dt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Nr(e,t,n){var r,o;if(Dt(t))return t;let i=[];return _r(e)&&e.assignedNodes?i=V(e.assignedNodes()):$(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=V(e.contentDocument.body.childNodes):i=V(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||$(e,HTMLVideoElement)||await i.reduce((a,s)=>a.then(()=>ue(s,n)).then(l=>{l&&t.appendChild(l)}),Promise.resolve()),t}function Hr(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):Pe(n).forEach(i=>{let a=o.getPropertyValue(i);i==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),$(e,HTMLIFrameElement)&&i==="display"&&a==="inline"&&(a="block"),i==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(i,a,o.getPropertyPriority(i))})}function Or(e,t){$(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),$(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Ur(e,t){if($(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function Wr(e,t,n){return $(t,Element)&&(Hr(e,t,n),zt(e,t,n),Or(e,t),Ur(e,t)),t}async function jr(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let s=n[i].getAttribute("xlink:href");if(s){let l=e.querySelector(s),d=document.querySelector(s);!l&&d&&!r[s]&&(r[s]=await ue(d,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",a=document.createElementNS(i,"svg");a.setAttribute("xmlns",i),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let s=document.createElementNS(i,"defs");a.appendChild(s);for(let l=0;l<o.length;l++)s.appendChild(o[l]);e.appendChild(a)}return e}async function ue(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Br(r,t)).then(r=>Nr(e,r,t)).then(r=>Wr(e,r,t)).then(r=>jr(r,t))}var Ft=/url\((['"]?)([^'"]+?)\1\)/g,qr=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,Vr=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function Gr(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Xr(e){let t=[];return e.replace(Ft,(n,r,o)=>(t.push(o),n)),t.filter(n=>!de(n))}async function Yr(e,t,n,r,o){try{let i=n?Tt(t,n):t,a=te(t),s;if(o){let l=await o(i);s=Je(l,a)}else s=await ne(i,a,r);return e.replace(Gr(t),`$1${s}$3`)}catch{}return e}function Kr(e,{preferredFontFormat:t}){return t?e.replace(Vr,n=>{for(;;){let[r,,o]=qr.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function tt(e){return e.search(Ft)!==-1}async function Me(e,t,n){if(!tt(e))return e;let r=Kr(e,n);return Xr(r).reduce((i,a)=>i.then(s=>Yr(s,a,t,n)),Promise.resolve(r))}async function re(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await Me(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function Zr(e,t){await re("background",e,t)||await re("background-image",e,t),await re("mask",e,t)||await re("-webkit-mask",e,t)||await re("mask-image",e,t)||await re("-webkit-mask-image",e,t)}async function Qr(e,t){let n=$(e,HTMLImageElement);if(!(n&&!de(e.src))&&!($(e,SVGImageElement)&&!de(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await ne(r,te(r),t);await new Promise((i,a)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...l)=>{try{i(t.onImageErrorHandler(...l))}catch(d){a(d)}}:a;let s=e;s.decode&&(s.decode=i),s.loading==="lazy"&&(s.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function Jr(e,t){let r=V(e.childNodes).map(o=>nt(o,t));await Promise.all(r).then(()=>e)}async function nt(e,t){$(e,Element)&&(await Zr(e,t),await Qr(e,t),await Jr(e,t))}function $t(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var Bt={};async function _t(e){let t=Bt[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},Bt[e]=t,t}async function Nt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let s=a.replace(r,"$1");return s.startsWith("https://")||(s=new URL(s,e.url).href),et(s,t.fetchRequestInit,({result:l})=>(n=n.replace(a,`url(${l})`),[a,l]))});return Promise.all(i).then(()=>n)}function Ht(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let l=o.exec(r);if(l===null)break;t.push(l[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",s=new RegExp(a,"gi");for(;;){let l=i.exec(r);if(l===null){if(l=s.exec(r),l===null)break;i.lastIndex=s.lastIndex}else s.lastIndex=i.lastIndex;t.push(l[0])}return t}async function eo(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{V(o.cssRules||[]).forEach((i,a)=>{if(i.type===CSSRule.IMPORT_RULE){let s=a+1,l=i.href,d=_t(l).then(u=>Nt(u,t)).then(u=>Ht(u).forEach(m=>{try{o.insertRule(m,m.startsWith("@import")?s+=1:o.cssRules.length)}catch(y){console.error("Error inserting rule from remote css",{rule:m,error:y})}})).catch(u=>{console.error("Error loading remote css",u.toString())});r.push(d)}})}catch(i){let a=e.find(s=>s.href==null)||document.styleSheets[0];o.href!=null&&r.push(_t(o.href).then(s=>Nt(s,t)).then(s=>Ht(s).forEach(l=>{a.insertRule(l,a.cssRules.length)})).catch(s=>{console.error("Error loading remote stylesheet",s)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{V(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function to(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>tt(t.style.getPropertyValue("src")))}async function no(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=V(e.ownerDocument.styleSheets),r=await eo(n,t);return to(r)}function Ot(e){return e.trim().replace(/["']/g,"")}function ro(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(Ot(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function Ut(e,t){let n=await no(e,t),r=ro(e);return(await Promise.all(n.filter(i=>r.has(Ot(i.style.fontFamily))).map(i=>{let a=i.parentStyleSheet?i.parentStyleSheet.href:null;return Me(i.cssText,a,t)}))).join(`
`)}async function Wt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Ut(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function oo(e,t={}){let{width:n,height:r}=Ze(e,t),o=await ue(e,t,!0);return await Wt(o,t),await nt(o,t),$t(o,t),await Mt(o,n,r)}async function io(e,t={}){let{width:n,height:r}=Ze(e,t),o=await oo(e,t),i=await ee(o),a=document.createElement("canvas"),s=a.getContext("2d"),l=t.pixelRatio||Lt(),d=t.canvasWidth||n,u=t.canvasHeight||r;return a.width=d*l,a.height=u*l,t.skipAutoScale||Pt(a),a.style.width=`${d}`,a.style.height=`${u}`,t.backgroundColor&&(s.fillStyle=t.backgroundColor,s.fillRect(0,0,a.width,a.height)),s.drawImage(i,0,0,a.width,a.height),a}async function jt(e,t={}){return(await io(e,t)).toDataURL()}var qt={triggerLabel:"Feedback",triggerAriaLabel:"Fehler melden oder Feedback senden",dismissButtonAriaLabel:"Feedback-Button ausblenden",pullTabAriaLabel:"Feedback-Button anzeigen",dragHandleTitle:"Feedback-Button verschieben",installRequiredTitle:"Installation erforderlich",connectionErrorTitle:"Verbindungsfehler",installRequiredMessage:"BugDrop ben\xF6tigt die Installation der GitHub-App, um Issues zu erstellen.",apiUnreachableMessage:"Die BugDrop-API ist nicht erreichbar. \xDCberpr\xFCfen Sie Ihre Netzwerkverbindung oder die URL des Script-Tags.",installApp:"App installieren",welcomeTitle:"Teilen Sie Ihr Feedback",welcomeHeadline:"Helfen Sie uns, besser zu werden, indem Sie Ihre Meinung teilen",welcomeBodyLine1:"Melden Sie Fehler, schlagen Sie Funktionen vor oder hinterlassen Sie Feedback.",welcomeBodyLine2:"Sie k\xF6nnen optional kommentierte Screenshots hinzuf\xFCgen.",getStarted:"Los geht\u2019s",feedbackFormTitle:"Feedback senden",categoryLabel:"Kategorie",categoryBug:"Fehler",categoryFeature:"Funktion",categoryQuestion:"Frage",nameLabel:"Name",namePlaceholder:"Ihr Name",emailLabel:"E-Mail",emailPlaceholder:"ihre@email.de",titleLabel:"Titel",titlePlaceholder:"Kurze Beschreibung des Problems oder Vorschlags",descriptionLabel:"Beschreibung",descriptionPlaceholder:"Geben Sie weitere Details, Schritte zur Reproduktion oder Kontext an...",screenshotAutoNote:"Diese Website h\xE4ngt beim Absenden automatisch einen Screenshot der gesamten Seite an, ohne eine Vorschau anzuzeigen. \xDCberpr\xFCfen Sie Ihre Seite vor dem Senden auf sensible Informationen.",screenshotAutoRedactionNote:"Einige von dieser Website als privat markierte Felder k\xF6nnen auf unterst\xFCtzten Seiten optisch maskiert werden, nicht markierte sensible Informationen k\xF6nnen jedoch weiterhin enthalten sein.",screenshotRequiredNote:"\u{1F4F8} Vor dem Absenden ist ein Screenshot erforderlich.",includeScreenshotLabel:"\u{1F4F8} Screenshot hinzuf\xFCgen",sendConsoleLogsLabel:"Konsolenprotokolle mitsenden",uploadsAriaLabel:"Uploads",uploadFilesAriaLabel:"Dateien hochladen",uploadButton:"Hochladen",uploadTooMany:e=>`Laden Sie bis zu ${e} Dateien hoch. Entfernen Sie eine Datei, bevor Sie eine weitere hinzuf\xFCgen.`,uploadUnsupportedType:"Dieser Dateityp wird nicht unterst\xFCtzt. Laden Sie ein Bild, ein PDF oder ein kurzes Video hoch.",uploadTooLarge:e=>`Die Datei ist zu gro\xDF. Laden Sie Dateien bis zu ${e} hoch.`,uploadReadError:"Diese Datei konnte nicht gelesen werden. Versuchen Sie es mit einer anderen.",removeAttachmentAriaLabel:e=>`${e} entfernen`,cancel:"Abbrechen",continueButton:"Weiter",submit:"Absenden",submittingTitle:"Wird gesendet...",creatingIssue:"Issue wird erstellt...",rateLimited:e=>`Zu viele \xDCbermittlungen. Bitte versuchen Sie es in ${e} Minute${e===1?"":"n"} erneut.`,submitFailedFallback:"Senden fehlgeschlagen",networkError:"Netzwerkfehler. Bitte \xFCberpr\xFCfen Sie Ihre Verbindung.",submissionFailedTitle:"Senden fehlgeschlagen",tryAgain:"Erneut versuchen",successTitle:"Feedback gesendet!",issueCreated:e=>`Issue ${e} wurde erstellt.`,feedbackSubmittedMessage:"Ihr Feedback wurde erfolgreich gesendet.",viewOnGitHub:"Auf GitHub ansehen",done:"Fertig",captureScreenshotTitle:"Screenshot erstellen",chooseWhatToCapture:"W\xE4hlen Sie aus, was erfasst werden soll:",viewportRedactionWarning:"Bei der Erfassung des sichtbaren Bereichs \xFCber den Browser k\xF6nnen private Felder nicht automatisch maskiert werden. W\xE4hlen Sie \u201EElement ausw\xE4hlen\u201C, um die automatische Maskierung beizubehalten, oder \xFCberpr\xFCfen und verdecken Sie sensible Bereiche vor dem Senden.",redactionReviewNote:"Diese Website hat einige Felder zur Schw\xE4rzung markiert. \xDCberpr\xFCfen Sie den Screenshot vor dem Senden.",pageTooComplexViewportNote:"Diese Seite ist zu komplex f\xFCr eine vollst\xE4ndige Erfassung oder eine Bereichserfassung. Erfassen Sie stattdessen den sichtbaren Bereich oder w\xE4hlen Sie ein bestimmtes Element aus.",pageTooComplexElementNote:"Diese Seite ist zu komplex f\xFCr eine vollst\xE4ndige Erfassung oder eine Bereichserfassung. W\xE4hlen Sie stattdessen ein bestimmtes Element aus.",fullPage:"Ganze Seite",captureViewport:"Sichtbaren Bereich erfassen",selectArea:"Bereich ausw\xE4hlen",selectElement:"Element ausw\xE4hlen",skipScreenshot:"Screenshot \xFCberspringen",areaPickerInstruction:"Ziehen Sie eine Auswahl um den zu erfassenden Bereich",areaPickerRedactionInstruction:"Ziehen Sie eine Auswahl um den zu erfassenden Bereich. Markierte private Felder k\xF6nnen maskiert werden, wenn sie darin enthalten sind.",elementPickerInstruction:"Klicken Sie auf ein beliebiges Element, um es zu erfassen",elementPickerTouchInstruction:"Tippen Sie auf ein beliebiges Element, um es zu erfassen",escToCancel:"ESC zum Abbrechen",capturingTitle:"Wird erfasst...",capturingScreenshot:"Screenshot wird erfasst...",captureFailedTitle:"Erfassung fehlgeschlagen",captureFailedMessage:"Der Screenshot konnte nicht erfasst werden. Die Seite ist m\xF6glicherweise zu komplex, oder Browsereinschr\xE4nkungen greifen.",chooseAnotherMethod:"Andere Methode w\xE4hlen",maskFailureTitle:"Datenschutz-Maskierung fehlgeschlagen",maskFailureMessage:"Die automatische Schw\xE4rzung privater Felder konnte nicht angewendet werden. Zum Schutz Ihrer Daten wurde dieser Screenshot verworfen. Sie k\xF6nnen Ihr Feedback weiterhin ohne Screenshot senden.",continueWithoutScreenshot:"Ohne Screenshot fortfahren",reviewScreenshotTitle:"Screenshot \xFCberpr\xFCfen",viewportRedactionUnavailableNote:"Bei diesem \xFCber den Browser erfassten sichtbaren Bereich konnten private Felder nicht automatisch maskiert werden. \xDCberpr\xFCfen und verdecken Sie sensible Bereiche vor dem Senden.",redactionCountNote:e=>e===1?`${e} privates Element wurde zur Schw\xE4rzung in diesem Screenshot markiert. \xDCberpr\xFCfen Sie ihn vor dem Senden.`:`${e} private Elemente wurden zur Schw\xE4rzung in diesem Screenshot markiert. \xDCberpr\xFCfen Sie ihn vor dem Senden.`,redactionLimitationsNote:"BugDrop hat nur die gemessenen markierten Bereiche abgedeckt. Es untersucht keine Pixel innerhalb eingebetteter oder gerenderter Inhalte wie iFrames, Canvas, Bildern, SVGs, Videos, CSS-Hintergr\xFCnden oder benutzerdefinierten Steuerelementen. Stellen Sie vor dem Senden sicher, dass das schwarze Feld den sensiblen Bereich vollst\xE4ndig abdeckt, oder nehmen Sie den Screenshot nach Markierung eines gr\xF6\xDFeren Bereichs erneut auf.",annotationInstruction:"Stellen Sie vor dem Senden sicher, dass keine sensiblen Informationen sichtbar sind. Verdecken Sie sensible Bereiche vor dem Absenden. Schw\xE4rzungen werden dauerhaft in das hochgeladene Bild eingebettet.",selectedElementNote:e=>`Ben\xF6tigen Sie mehr umgebenden Kontext? Passen Sie ${e} im BugDrop-Script-Tag an.`,toolDraw:"Zeichnen",toolArrow:"Pfeil",toolRectangle:"Rechteck",toolRedact:"Schw\xE4rzen",undo:"R\xFCckg\xE4ngig",retake:"Erneut aufnehmen",submitFeedback:"Feedback senden",captureTimeout:"Zeit\xFCberschreitung bei der Screenshot-Erfassung \u2014 die Seite ist m\xF6glicherweise zu komplex"};var rt={triggerLabel:"Feedback",triggerAriaLabel:"Report a bug or send feedback",dismissButtonAriaLabel:"Dismiss feedback button",pullTabAriaLabel:"Show feedback button",dragHandleTitle:"Drag feedback button",installRequiredTitle:"Install Required",connectionErrorTitle:"Connection Error",installRequiredMessage:"BugDrop requires GitHub App installation to create issues.",apiUnreachableMessage:"Unable to reach BugDrop API. Check your network connection or script tag URL.",installApp:"Install App",welcomeTitle:"Share Your Feedback",welcomeHeadline:"Help us improve by sharing your thoughts",welcomeBodyLine1:"Report bugs, suggest features, or leave feedback.",welcomeBodyLine2:"You can optionally include annotated screenshots.",getStarted:"Get Started",feedbackFormTitle:"Send Feedback",categoryLabel:"Category",categoryBug:"Bug",categoryFeature:"Feature",categoryQuestion:"Question",nameLabel:"Name",namePlaceholder:"Your name",emailLabel:"Email",emailPlaceholder:"your@email.com",titleLabel:"Title",titlePlaceholder:"Brief description of the issue or suggestion",descriptionLabel:"Description",descriptionPlaceholder:"Provide additional details, steps to reproduce, or context...",screenshotAutoNote:"This site will attach a full-page screenshot when you submit without showing a preview. Review your page for sensitive information before sending.",screenshotAutoRedactionNote:"Some fields this site marked private may be visually masked on supported pages, but unmarked sensitive information can still be included.",screenshotRequiredNote:"\u{1F4F8} A screenshot is required before submitting.",includeScreenshotLabel:"\u{1F4F8} Include a screenshot",sendConsoleLogsLabel:"Send Console Logs",uploadsAriaLabel:"Uploads",uploadFilesAriaLabel:"Upload files",uploadButton:"Upload",uploadTooMany:e=>`Upload up to ${e} files. Remove a file before adding another.`,uploadUnsupportedType:"That file type is not supported. Upload an image, PDF, or short video.",uploadTooLarge:e=>`File is too large. Upload files up to ${e}.`,uploadReadError:"Could not read that file. Try another one.",removeAttachmentAriaLabel:e=>`Remove ${e}`,cancel:"Cancel",continueButton:"Continue",submit:"Submit",submittingTitle:"Submitting...",creatingIssue:"Creating issue...",rateLimited:e=>`Too many submissions. Please try again in ${e} minute${e===1?"":"s"}.`,submitFailedFallback:"Failed to submit",networkError:"Network error. Please check your connection.",submissionFailedTitle:"Submission Failed",tryAgain:"Try Again",successTitle:"Feedback Submitted!",issueCreated:e=>`Issue ${e} has been created.`,feedbackSubmittedMessage:"Your feedback has been submitted successfully.",viewOnGitHub:"View on GitHub",done:"Done",captureScreenshotTitle:"Capture Screenshot",chooseWhatToCapture:"Choose what to capture:",viewportRedactionWarning:"Browser viewport capture cannot apply automatic private-field masks. Select Element to preserve automatic masking, or review and cover sensitive areas before sending.",redactionReviewNote:"This site marked some fields for redaction. Review the screenshot before sending.",pageTooComplexViewportNote:"This page is too complex for full-page or area capture. Capture the visible viewport or select a specific element instead.",pageTooComplexElementNote:"This page is too complex for full-page or area capture. Select a specific element instead.",fullPage:"Full Page",captureViewport:"Capture Viewport",selectArea:"Select Area",selectElement:"Select Element",skipScreenshot:"Skip Screenshot",areaPickerInstruction:"Draw a selection around the area to capture",areaPickerRedactionInstruction:"Draw a selection around the area to capture. Marked private fields may be masked if included.",elementPickerInstruction:"Click any element to capture it",elementPickerTouchInstruction:"Tap any element to capture it",escToCancel:"ESC to cancel",capturingTitle:"Capturing...",capturingScreenshot:"Capturing screenshot...",captureFailedTitle:"Capture Failed",captureFailedMessage:"Failed to capture screenshot. The page may be too complex or browser restrictions may apply.",chooseAnotherMethod:"Choose Another Method",maskFailureTitle:"Privacy masking failed",maskFailureMessage:"Automatic redaction of private fields could not be applied. To protect your data, this screenshot was discarded. You can still submit feedback without one.",continueWithoutScreenshot:"Continue without screenshot",reviewScreenshotTitle:"Review Screenshot",viewportRedactionUnavailableNote:"This browser viewport capture could not apply automatic private-field masks. Review and cover any sensitive areas before sending.",redactionCountNote:e=>`${e} private ${e===1?"item was":"items were"} marked for redaction in this screenshot. Review before sending.`,redactionLimitationsNote:"BugDrop only covered the measured marked boxes. It does not inspect pixels inside embedded or rendered content such as iframes, canvas, images, SVGs, videos, CSS backgrounds, or custom controls. Confirm the black box fully covers the sensitive region before sending, or retake after marking a larger wrapper.",annotationInstruction:"Check that no sensitive information is visible before sending. Cover sensitive areas before submitting. Redactions are baked into the uploaded image.",selectedElementNote:e=>`Need more surrounding context? Adjust ${e} on the BugDrop script tag.`,toolDraw:"Draw",toolArrow:"Arrow",toolRectangle:"Rectangle",toolRedact:"Redact",undo:"Undo",retake:"Retake",submitFeedback:"Submit Feedback",captureTimeout:"Screenshot capture timed out \u2014 the page may be too complex"};var Vt={triggerLabel:"Feedback",triggerAriaLabel:"Een fout melden of feedback versturen",dismissButtonAriaLabel:"Feedbackknop verbergen",pullTabAriaLabel:"Feedbackknop tonen",dragHandleTitle:"Feedbackknop verslepen",installRequiredTitle:"Installatie vereist",connectionErrorTitle:"Verbindingsfout",installRequiredMessage:"BugDrop vereist installatie van de GitHub-app om issues te kunnen aanmaken.",apiUnreachableMessage:"Kan de BugDrop-API niet bereiken. Controleer uw netwerkverbinding of de URL van de scripttag.",installApp:"App installeren",welcomeTitle:"Deel uw feedback",welcomeHeadline:"Help ons verbeteren door uw mening te delen",welcomeBodyLine1:"Meld fouten, stel functies voor of laat feedback achter.",welcomeBodyLine2:"U kunt optioneel schermafbeeldingen met aantekeningen toevoegen.",getStarted:"Aan de slag",feedbackFormTitle:"Feedback versturen",categoryLabel:"Categorie",categoryBug:"Fout",categoryFeature:"Suggestie",categoryQuestion:"Vraag",nameLabel:"Naam",namePlaceholder:"Uw naam",emailLabel:"E-mail",emailPlaceholder:"uw@email.nl",titleLabel:"Titel",titlePlaceholder:"Korte omschrijving van het probleem of de suggestie",descriptionLabel:"Omschrijving",descriptionPlaceholder:"Geef extra details, stappen om het te reproduceren of context...",screenshotAutoNote:"Deze site voegt bij het versturen automatisch een schermafbeelding van de volledige pagina toe, zonder voorbeeld. Controleer uw pagina op gevoelige informatie voordat u verstuurt.",screenshotAutoRedactionNote:"Sommige velden die deze site als priv\xE9 heeft gemarkeerd, kunnen op ondersteunde pagina\u2019s visueel worden gemaskeerd, maar niet-gemarkeerde gevoelige informatie kan nog steeds worden meegestuurd.",screenshotRequiredNote:"\u{1F4F8} Een schermafbeelding is vereist voordat u kunt versturen.",includeScreenshotLabel:"\u{1F4F8} Schermafbeelding toevoegen",sendConsoleLogsLabel:"Consolelogboeken meesturen",uploadsAriaLabel:"Uploads",uploadFilesAriaLabel:"Bestanden uploaden",uploadButton:"Uploaden",uploadTooMany:e=>`Upload maximaal ${e} bestanden. Verwijder een bestand voordat u er een toevoegt.`,uploadUnsupportedType:"Dat bestandstype wordt niet ondersteund. Upload een afbeelding, pdf of korte video.",uploadTooLarge:e=>`Het bestand is te groot. Upload bestanden tot ${e}.`,uploadReadError:"Kan dat bestand niet lezen. Probeer een ander bestand.",removeAttachmentAriaLabel:e=>`${e} verwijderen`,cancel:"Annuleren",continueButton:"Doorgaan",submit:"Versturen",submittingTitle:"Versturen...",creatingIssue:"Issue aanmaken...",rateLimited:e=>`Te veel inzendingen. Probeer het over ${e} ${e===1?"minuut":"minuten"} opnieuw.`,submitFailedFallback:"Versturen mislukt",networkError:"Netwerkfout. Controleer uw verbinding.",submissionFailedTitle:"Versturen mislukt",tryAgain:"Opnieuw proberen",successTitle:"Feedback verstuurd!",issueCreated:e=>`Issue ${e} is aangemaakt.`,feedbackSubmittedMessage:"Uw feedback is succesvol verstuurd.",viewOnGitHub:"Bekijken op GitHub",done:"Klaar",captureScreenshotTitle:"Schermafbeelding maken",chooseWhatToCapture:"Kies wat u wilt vastleggen:",viewportRedactionWarning:"Bij het vastleggen van het zichtbare deel via de browser kunnen priv\xE9velden niet automatisch worden gemaskeerd. Kies \u201CElement selecteren\u201D om automatische maskering te behouden, of controleer en dek gevoelige gebieden af voordat u verstuurt.",redactionReviewNote:"Deze site heeft enkele velden gemarkeerd voor redactie. Controleer de schermafbeelding voordat u verstuurt.",pageTooComplexViewportNote:"Deze pagina is te complex om volledig of per gebied vast te leggen. Leg het zichtbare deel vast of selecteer een specifiek element.",pageTooComplexElementNote:"Deze pagina is te complex om volledig of per gebied vast te leggen. Selecteer in plaats daarvan een specifiek element.",fullPage:"Volledige pagina",captureViewport:"Zichtbaar deel vastleggen",selectArea:"Gebied selecteren",selectElement:"Element selecteren",skipScreenshot:"Schermafbeelding overslaan",areaPickerInstruction:"Trek een selectie rond het gebied dat u wilt vastleggen",areaPickerRedactionInstruction:"Trek een selectie rond het gebied dat u wilt vastleggen. Gemarkeerde priv\xE9velden kunnen worden gemaskeerd als ze binnen de selectie vallen.",elementPickerInstruction:"Klik op een element om het vast te leggen",elementPickerTouchInstruction:"Tik op een element om het vast te leggen",escToCancel:"ESC om te annuleren",capturingTitle:"Vastleggen...",capturingScreenshot:"Schermafbeelding wordt gemaakt...",captureFailedTitle:"Opname mislukt",captureFailedMessage:"Kan geen schermafbeelding maken. De pagina is mogelijk te complex of de browser staat dit niet toe.",chooseAnotherMethod:"Kies een andere methode",maskFailureTitle:"Privacymaskering mislukt",maskFailureMessage:"Automatische redactie van priv\xE9velden kon niet worden toegepast. Om uw gegevens te beschermen is deze schermafbeelding verwijderd. U kunt uw feedback nog steeds zonder schermafbeelding versturen.",continueWithoutScreenshot:"Doorgaan zonder schermafbeelding",reviewScreenshotTitle:"Schermafbeelding controleren",viewportRedactionUnavailableNote:"Bij deze via de browser vastgelegde schermafbeelding konden priv\xE9velden niet automatisch worden gemaskeerd. Controleer en dek gevoelige gebieden af voordat u verstuurt.",redactionCountNote:e=>e===1?"1 priv\xE9-item is gemarkeerd voor redactie in deze schermafbeelding. Controleer voordat u verstuurt.":`${e} priv\xE9-items zijn gemarkeerd voor redactie in deze schermafbeelding. Controleer voordat u verstuurt.`,redactionLimitationsNote:"BugDrop heeft alleen de gemeten gemarkeerde vakken afgedekt. Het inspecteert geen pixels binnen ingesloten of gerenderde inhoud zoals iframes, canvas, afbeeldingen, SVG\u2019s, video\u2019s, CSS-achtergronden of aangepaste elementen. Controleer of het zwarte vak het gevoelige gebied volledig bedekt voordat u verstuurt, of maak de afbeelding opnieuw nadat u een groter element hebt gemarkeerd.",annotationInstruction:"Controleer of er geen gevoelige informatie zichtbaar is voordat u verstuurt. Dek gevoelige gebieden af voordat u indient. Redacties worden permanent in de ge\xFCploade afbeelding verwerkt.",selectedElementNote:e=>`Meer omringende context nodig? Pas ${e} aan op de BugDrop-scripttag.`,toolDraw:"Tekenen",toolArrow:"Pijl",toolRectangle:"Rechthoek",toolRedact:"Redigeren",undo:"Ongedaan maken",retake:"Opnieuw maken",submitFeedback:"Feedback versturen",captureTimeout:"Het maken van de schermafbeelding duurde te lang \u2014 de pagina is mogelijk te complex"};function ot(e){let t=e%10,n=e%100;return t>=2&&t<=4&&(n<12||n>14)}var Gt={triggerLabel:"Opinia",triggerAriaLabel:"Zg\u0142o\u015B b\u0142\u0105d lub wy\u015Blij opini\u0119",dismissButtonAriaLabel:"Ukryj przycisk opinii",pullTabAriaLabel:"Poka\u017C przycisk opinii",dragHandleTitle:"Przeci\u0105gnij przycisk opinii",installRequiredTitle:"Wymagana instalacja",connectionErrorTitle:"B\u0142\u0105d po\u0142\u0105czenia",installRequiredMessage:"BugDrop wymaga instalacji aplikacji GitHub, aby tworzy\u0107 zg\u0142oszenia.",apiUnreachableMessage:"Nie mo\u017Cna po\u0142\u0105czy\u0107 si\u0119 z API BugDrop. Sprawd\u017A po\u0142\u0105czenie sieciowe lub adres URL w tagu skryptu.",installApp:"Zainstaluj aplikacj\u0119",welcomeTitle:"Podziel si\u0119 opini\u0105",welcomeHeadline:"Pom\xF3\u017C nam si\u0119 rozwija\u0107, dziel\u0105c si\u0119 swoimi uwagami",welcomeBodyLine1:"Zg\u0142aszaj b\u0142\u0119dy, proponuj funkcje lub zostaw opini\u0119.",welcomeBodyLine2:"Opcjonalnie mo\u017Cesz do\u0142\u0105czy\u0107 zrzuty ekranu z adnotacjami.",getStarted:"Rozpocznij",feedbackFormTitle:"Wy\u015Blij opini\u0119",categoryLabel:"Kategoria",categoryBug:"B\u0142\u0105d",categoryFeature:"Propozycja",categoryQuestion:"Pytanie",nameLabel:"Imi\u0119 i nazwisko",namePlaceholder:"Twoje imi\u0119 i nazwisko",emailLabel:"E-mail",emailPlaceholder:"twoj@email.com",titleLabel:"Tytu\u0142",titlePlaceholder:"Kr\xF3tki opis problemu lub sugestii",descriptionLabel:"Opis",descriptionPlaceholder:"Podaj dodatkowe szczeg\xF3\u0142y, kroki do odtworzenia lub kontekst...",screenshotAutoNote:"Ta strona automatycznie do\u0142\u0105czy zrzut ca\u0142ej strony podczas wysy\u0142ania, bez pokazywania podgl\u0105du. Przed wys\u0142aniem sprawd\u017A, czy strona nie zawiera poufnych informacji.",screenshotAutoRedactionNote:"Niekt\xF3re pola oznaczone przez t\u0119 stron\u0119 jako prywatne mog\u0105 zosta\u0107 zamaskowane na obs\u0142ugiwanych stronach, ale nieoznaczone poufne informacje nadal mog\u0105 zosta\u0107 do\u0142\u0105czone.",screenshotRequiredNote:"\u{1F4F8} Zrzut ekranu jest wymagany przed wys\u0142aniem.",includeScreenshotLabel:"\u{1F4F8} Do\u0142\u0105cz zrzut ekranu",sendConsoleLogsLabel:"Wy\u015Blij logi konsoli",uploadsAriaLabel:"Za\u0142\u0105czniki",uploadFilesAriaLabel:"Prze\u015Blij pliki",uploadButton:"Prze\u015Blij",uploadTooMany:e=>`Mo\u017Cna przes\u0142a\u0107 maksymalnie ${e} ${ot(e)?"pliki":"plik\xF3w"}. Usu\u0144 plik, aby doda\u0107 kolejny.`,uploadUnsupportedType:"Ten typ pliku nie jest obs\u0142ugiwany. Prze\u015Blij obraz, plik PDF lub kr\xF3tki film.",uploadTooLarge:e=>`Plik jest za du\u017Cy. Prze\u015Blij pliki o rozmiarze do ${e}.`,uploadReadError:"Nie uda\u0142o si\u0119 odczyta\u0107 pliku. Spr\xF3buj z innym.",removeAttachmentAriaLabel:e=>`Usu\u0144 ${e}`,cancel:"Anuluj",continueButton:"Dalej",submit:"Wy\u015Blij",submittingTitle:"Wysy\u0142anie...",creatingIssue:"Tworzenie zg\u0142oszenia...",rateLimited:e=>`Zbyt wiele zg\u0142osze\u0144. Spr\xF3buj ponownie za ${e} ${e===1?"minut\u0119":ot(e)?"minuty":"minut"}.`,submitFailedFallback:"Nie uda\u0142o si\u0119 wys\u0142a\u0107",networkError:"B\u0142\u0105d sieci. Sprawd\u017A po\u0142\u0105czenie z internetem.",submissionFailedTitle:"Wysy\u0142anie nie powiod\u0142o si\u0119",tryAgain:"Spr\xF3buj ponownie",successTitle:"Opinia wys\u0142ana!",issueCreated:e=>`Utworzono zg\u0142oszenie ${e}.`,feedbackSubmittedMessage:"Twoja opinia zosta\u0142a pomy\u015Blnie wys\u0142ana.",viewOnGitHub:"Zobacz na GitHubie",done:"Gotowe",captureScreenshotTitle:"Zr\xF3b zrzut ekranu",chooseWhatToCapture:"Wybierz, co przechwyci\u0107:",viewportRedactionWarning:"Przechwytywanie widocznego obszaru przez przegl\u0105dark\u0119 nie pozwala automatycznie zamaskowa\u0107 p\xF3l prywatnych. Wybierz \u201EZaznacz element\u201D, aby zachowa\u0107 automatyczne maskowanie, albo sprawd\u017A i zakryj poufne obszary przed wys\u0142aniem.",redactionReviewNote:"Ta strona oznaczy\u0142a niekt\xF3re pola do zamazania. Sprawd\u017A zrzut ekranu przed wys\u0142aniem.",pageTooComplexViewportNote:"Ta strona jest zbyt z\u0142o\u017Cona, aby przechwyci\u0107 ca\u0142\u0105 stron\u0119 lub zaznaczony obszar. Przechwy\u0107 widoczny obszar albo zaznacz konkretny element.",pageTooComplexElementNote:"Ta strona jest zbyt z\u0142o\u017Cona, aby przechwyci\u0107 ca\u0142\u0105 stron\u0119 lub zaznaczony obszar. Zamiast tego zaznacz konkretny element.",fullPage:"Ca\u0142a strona",captureViewport:"Przechwy\u0107 widoczny obszar",selectArea:"Zaznacz obszar",selectElement:"Zaznacz element",skipScreenshot:"Pomi\u0144 zrzut ekranu",areaPickerInstruction:"Narysuj zaznaczenie wok\xF3\u0142 obszaru do przechwycenia",areaPickerRedactionInstruction:"Narysuj zaznaczenie wok\xF3\u0142 obszaru do przechwycenia. Pola oznaczone jako prywatne mog\u0105 zosta\u0107 zamaskowane, je\u015Bli znajd\u0105 si\u0119 w zaznaczeniu.",elementPickerInstruction:"Kliknij dowolny element, aby go przechwyci\u0107",elementPickerTouchInstruction:"Dotknij dowolny element, aby go przechwyci\u0107",escToCancel:"ESC, aby anulowa\u0107",capturingTitle:"Przechwytywanie...",capturingScreenshot:"Trwa przechwytywanie zrzutu ekranu...",captureFailedTitle:"Przechwytywanie nie powiod\u0142o si\u0119",captureFailedMessage:"Nie uda\u0142o si\u0119 przechwyci\u0107 zrzutu ekranu. Strona mo\u017Ce by\u0107 zbyt z\u0142o\u017Cona lub przegl\u0105darka na to nie pozwala.",chooseAnotherMethod:"Wybierz inn\u0105 metod\u0119",maskFailureTitle:"Maskowanie prywatno\u015Bci nie powiod\u0142o si\u0119",maskFailureMessage:"Nie uda\u0142o si\u0119 automatycznie zamaza\u0107 p\xF3l prywatnych. Aby chroni\u0107 Twoje dane, ten zrzut ekranu zosta\u0142 odrzucony. Nadal mo\u017Cesz wys\u0142a\u0107 opini\u0119 bez zrzutu ekranu.",continueWithoutScreenshot:"Kontynuuj bez zrzutu ekranu",reviewScreenshotTitle:"Sprawd\u017A zrzut ekranu",viewportRedactionUnavailableNote:"Na tym zrzucie przechwyconym przez przegl\u0105dark\u0119 nie uda\u0142o si\u0119 automatycznie zamaskowa\u0107 p\xF3l prywatnych. Sprawd\u017A i zakryj poufne obszary przed wys\u0142aniem.",redactionCountNote:e=>`${e} ${e===1?"prywatny element oznaczono":ot(e)?"prywatne elementy oznaczono":"prywatnych element\xF3w oznaczono"} do zamazania na tym zrzucie ekranu. Sprawd\u017A przed wys\u0142aniem.`,redactionLimitationsNote:"BugDrop zakrywa tylko zmierzone, oznaczone obszary. Nie analizuje pikseli wewn\u0105trz osadzonej lub renderowanej zawarto\u015Bci, takiej jak elementy iframe, canvas, obrazy, pliki SVG, filmy, t\u0142a CSS czy niestandardowe kontrolki. Przed wys\u0142aniem upewnij si\u0119, \u017Ce czarny prostok\u0105t w pe\u0142ni zakrywa poufny obszar, albo pon\xF3w zrzut po oznaczeniu wi\u0119kszego elementu.",annotationInstruction:"Przed wys\u0142aniem sprawd\u017A, czy nie wida\u0107 poufnych informacji. Zakryj poufne obszary przed przes\u0142aniem. Zamazania s\u0105 trwale zapisywane w przesy\u0142anym obrazie.",selectedElementNote:e=>`Potrzebujesz wi\u0119cej otaczaj\u0105cego kontekstu? Dostosuj ${e} w tagu skryptu BugDrop.`,toolDraw:"Rysuj",toolArrow:"Strza\u0142ka",toolRectangle:"Prostok\u0105t",toolRedact:"Zama\u017C",undo:"Cofnij",retake:"Pon\xF3w zrzut",submitFeedback:"Wy\u015Blij opini\u0119",captureTimeout:"Up\u0142yn\u0105\u0142 limit czasu przechwytywania zrzutu ekranu \u2014 strona mo\u017Ce by\u0107 zbyt z\u0142o\u017Cona"};var Xt=/[;{}<>]|\/\*|\*\/|@import|url\s*\(|<\/style/i,so=/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/,lo=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,co=/^(?:rgb|rgba|hsl|hsla)\(\s*[-+.\d%]+\s*(?:,\s*[-+.\d%]+\s*){2,3}\)$/i;function H(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function pe(e){let t=e?.trim();if(!t||t==="none")return t;try{let n=new URL(t,window.location.href);if(n.protocol==="https:"||n.protocol==="http:")return t}catch{return}}function B(e){let t=e?.trim();if(!(!t||Xt.test(t))&&(lo.test(t)||co.test(t)||so.test(t)||typeof CSS<"u"&&CSS.supports?.("color",t)))return t}function oe(e){let t=e?.trim();if(t){if(t==="inherit")return t;if(!Xt.test(t)&&/^[\w\s"',.-]+$/.test(t))return t}}function it(e){let t=e?.trim();if(!t||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(t))return;let n=Number(t);return Number.isFinite(n)?n:void 0}function G(e){let n=e?.trim()?.match(/^((?:0|[1-9]\d*)(?:\.\d+)?)(?:px)?$/);if(!n)return;let r=Number(n[1]);return Number.isFinite(r)?r:void 0}function Yt(e){let t=e?.trim();if(!t||!/^[1-9]\d*$/.test(t))return;let n=Number(t);return Number.isSafeInteger(n)?n:void 0}function Re(e){if(e==="none"||e==="soft"||e==="hard")return e}var Kt={en:rt,de:qt,nl:Vt,pl:Gt};function g(e){return H(e)}function Zt(e){if(!e)return"en";let t=e.toLowerCase().split(/[-_]/)[0];return Object.prototype.hasOwnProperty.call(Kt,t)?t:(console.warn(`[BugDrop] Unsupported data-locale "${e}"; falling back to English.`),"en")}var Qt=rt;function Jt(e){Qt=Kt[e]}function c(){return Qt}var uo=15e3;function me(e){let t,n=new Promise((r,o)=>{t=setTimeout(()=>o(new Error(c().captureTimeout)),uo)});return Promise.race([e,n]).finally(()=>clearTimeout(t))}var ie=class extends Error{constructor(t,n){super(t,n),this.name="MaskApplicationError"}},po="[data-bugdrop-mask], [data-bugdrop-redact], [data-bd-redact], [data-bugdrop-redacted]",mo='input[type="password"], input[autocomplete*="cc-number"], input[autocomplete*="cc-csc"], input[autocomplete*="cc-exp"]',en="iframe, canvas, img, svg, video",go=new Set(["CANVAS","IMG","SVG"]),bo=new Set(["VIDEO"]);function ze(e){return e.matches(po)?"developer-marked":e.matches(mo)?"sensitive-input":null}function Ae(e,t){let n=e.getBoundingClientRect();return n.width===0||n.height===0?null:{element:e,rect:{x:n.left+window.scrollX,y:n.top+window.scrollY,w:n.width,h:n.height},reason:t,strategy:"canvas-mask"}}function Ie(e){let t=[],n=[],r=ze(e);if(r){let o=Ae(e,r);return o&&(t.push(o),dt(e,n)),{targets:t,unsupportedSurfaces:n,redactionCount:t.length}}return lt(e,t,n),ct(e,t,n),{targets:t,unsupportedSurfaces:n,redactionCount:t.length}}function tn(e=document.body,t){let n=Ie(e).targets.map(r=>r.rect);return t?n.filter(r=>at(r,t)).length:n.length}function nn(e,t){let n=t?e.targets.filter(o=>at(o.rect,t)):e.targets,r=t?e.unsupportedSurfaces.filter(o=>at(o.rect,t)):e.unsupportedSurfaces;return{count:n.length,hasLimitations:r.length>0}}function at(e,t){return e.x<t.x+t.width&&e.x+e.w>t.x&&e.y<t.y+t.height&&e.y+e.h>t.y}function lt(e,t,n){for(let r of Array.from(e.children)){let o=ze(r);if(o){let i=Ae(r,o);i&&(t.push(i),dt(r,n));continue}lt(r,t,n),ct(r,t,n)}}function ct(e,t,n){let r=e.shadowRoot;if(r)for(let o of Array.from(r.children)){let i=ze(o);if(i){let a=Ae(o,i);a&&(t.push(a),dt(o,n));continue}lt(o,t,n),ct(o,t,n)}}function dt(e,t){st(e,t);for(let n of Array.from(e.querySelectorAll(en)))st(n,t);rn(e,t)}function st(e,t){let n=ho(e);if(!n)return;let r=Ae(e,ze(e)??"developer-marked");r&&t.push({tagName:e.tagName,reason:n,rect:r.rect})}function ho(e){let t=e.tagName.toUpperCase();return t==="IFRAME"?"embedded-document":go.has(t)?"pixel-content":bo.has(t)?"media-content":null}function rn(e,t){let n=e.shadowRoot;if(n)for(let r of Array.from(n.querySelectorAll(en)))st(r,t);for(let r of Array.from(e.children))rn(r,t)}function fo(e,t,n,r,o){let i=(e.x-n.x)*t,a=(e.y-n.y)*t,s=e.w*t,l=e.h*t,d=Math.max(0,Math.floor(i)-1),u=Math.max(0,Math.floor(a)-1),m=Math.min(r,Math.ceil(i+s)+1),y=Math.min(o,Math.ceil(a+l)+1);return{x:d,y:u,w:m-d,h:y-u}}async function ut(e,t,n,r={x:0,y:0}){if(t.length===0)return e;let o=await yo(e),i=document.createElement("canvas");i.width=o.naturalWidth||o.width,i.height=o.naturalHeight||o.height;let a=i.getContext("2d");if(!a)throw new ie("Failed to get canvas context for privacy masking");a.drawImage(o,0,0),a.fillStyle="#000";for(let s of t){let l=fo(s,n,r,i.width,i.height);l.w>0&&l.h>0&&a.fillRect(l.x,l.y,l.w,l.h)}return i.toDataURL("image/png")}function yo(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>t(r),r.onerror=()=>n(new ie("Failed to load image for privacy masking")),r.src=e})}var ge="#14b8a6";function ae(e){return e||ge}function De(e){return`color-mix(in srgb, ${e} 85%, black)`}function on(e){return e??0}function pt(){if(window.__bugdropMockViewportCapture)return window.__bugdropMockViewportCapture();if(!navigator.mediaDevices?.getDisplayMedia)return Promise.reject(new Error("Screen Capture API is not available"));let e={video:{displaySurface:"browser"},audio:!1,preferCurrentTab:!0};return me(navigator.mediaDevices.getDisplayMedia(e).then(t=>wo(t)))}async function wo(e){vo(e);let t=document.createElement("video");t.muted=!0,t.playsInline=!0;try{await xo(t,e);let n=t.videoWidth||window.innerWidth,r=t.videoHeight||window.innerHeight;if(!n||!r)throw new Error("Screen capture stream did not provide a video frame");let o=document.createElement("canvas");o.width=n,o.height=r;let i=o.getContext("2d");if(!i)throw new Error("Failed to get canvas context");return i.drawImage(t,0,0,n,r),o.toDataURL("image/png")}finally{for(let n of e.getTracks())n.stop();t.srcObject=null}}function vo(e){let[t]=e.getVideoTracks(),n=t?.getSettings().displaySurface;if(n&&n!=="browser"){for(let r of e.getTracks())r.stop();throw new Error("Please choose the current browser tab for viewport capture")}}async function xo(e,t){e.srcObject=t,await e.play().catch(()=>{}),!(e.requestVideoFrameCallback&&(await Promise.race([new Promise(n=>e.requestVideoFrameCallback?.(()=>n())),an(250)]),e.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA))&&(e.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA||await Promise.race([new Promise((n,r)=>{let o=()=>{a(),n()},i=()=>{a(),r(new Error("Failed to load screen capture stream"))},a=()=>{e.removeEventListener("loadeddata",o),e.removeEventListener("canplay",o),e.removeEventListener("error",i)};e.addEventListener("loadeddata",o),e.addEventListener("canplay",o),e.addEventListener("error",i)}),an(250)]))}function an(e){return new Promise(t=>setTimeout(t,e))}var sn=3e3,ln="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",ko=1e4,Eo=sn;function Be(){return document.body.querySelectorAll("*").length}function K(){return Be()>=So()}function So(e=navigator.userAgent){return To(e)?Eo:ko}function To(e=navigator.userAgent){return/Safari\//.test(e)&&!/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Opera)\//.test(e)}function cn(e,t){if(e&&Be()>sn)return 1;let n=t??2;return Math.max(window.devicePixelRatio||1,n)}function dn(){let e=window.isSecureContext||location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1",t=typeof window.__bugdropMockViewportCapture=="function"||typeof navigator.mediaDevices?.getDisplayMedia=="function";return e&&t}async function un(e,t,n={}){let r=e||document.body,o=!e,i=Fe(e||document.body),a=n.highlightElement&&r.contains(n.highlightElement)?Fe(n.highlightElement):null,s=n.pixelRatio??cn(o,t),l=e?window.getComputedStyle(e):null,d=gn(),u={cacheBust:!1,imagePlaceholder:ln,pixelRatio:s,filter:mn,...l&&(l.marginLeft!=="0px"||l.marginRight!=="0px")?{style:{margin:`${l.marginTop} 0px ${l.marginBottom} 0px`}}:{}},m=Ie(r),y=e?{x:i.x,y:i.y}:{x:0,y:0},x=d(r,u),v=await me(x),T=await ut(v,m.targets.map(k=>k.rect),s,y);return $e(a?await bn(T,a,i,n.highlightStyle):T,m)}async function pn(e,t,n={}){let r=n.pixelRatio??cn(!0,t),o={x:e.x,y:e.y,w:e.width,h:e.height},i=n.highlightElement&&document.body.contains(n.highlightElement)?Fe(n.highlightElement):null,a=gn(),s={cacheBust:!1,imagePlaceholder:ln,pixelRatio:r,width:e.width,height:e.height,style:{transform:`translate(${-e.x}px, ${-e.y}px)`,transformOrigin:"top left",width:`${document.documentElement.scrollWidth}px`,height:`${document.documentElement.scrollHeight}px`},filter:mn},l=Ie(document.body),d=await me(a(document.body,s)),u=await ut(d,l.targets.map(m=>m.rect),r,{x:e.x,y:e.y});return $e(i?await bn(u,i,o,n.highlightStyle):u,l,e)}function se(e,t){return tn(e??document.body,t)}function mn(e){return!(e.id==="bugdrop-host"||Co(e)&&Lo(e))}function Co(e){return e.tagName?.toUpperCase()==="IMG"}function Lo(e){let t=(e.ownerDocument.defaultView??window).getComputedStyle(e);if(t.display==="none"||t.visibility==="hidden")return!0;let n=e.getBoundingClientRect();return n.width<=0||n.height<=0}function gn(){return jt}function $e(e,t,n){return{dataUrl:e,redaction:nn(t,n)}}async function bn(e,t,n,r={}){if(t.w<=0||t.h<=0)return e;let o=await zo(e),i=o.naturalWidth||o.width,a=o.naturalHeight||o.height,s=i/Math.max(1,n.w),l=a/Math.max(1,n.h),d=Math.max(1,(s+l)/2),u=Mo(r.borderWidth,d),y=2*d+u/2,x=(t.x-n.x)*s-y,v=(t.y-n.y)*l-y,T=t.w*s+y*2,k=t.h*l+y*2,z=Math.max(0,Math.ceil(-x)),R=Math.max(0,Math.ceil(-v)),P=Math.max(0,Math.ceil(x+T-i)),M=Math.max(0,Math.ceil(v+k-a)),A=document.createElement("canvas");A.width=i+z+P,A.height=a+R+M;let f=A.getContext("2d");if(!f)throw new Error("Failed to get canvas context for selected element highlight");f.drawImage(o,z,R);let C=Math.round(x+z),D=Math.round(v+R),I=Math.round(T),F=Math.round(k),O=Ro(r.radius,d),w=ae(r.accentColor);return Po(f,C,D,I,F,O),f.lineWidth=u,f.strokeStyle=w,f.stroke(),A.toDataURL("image/png")}function Po(e,t,n,r,o,i){let a=Math.max(0,Math.min(i,r/2,o/2));e.beginPath(),e.moveTo(t+a,n),e.lineTo(t+r-a,n),e.quadraticCurveTo(t+r,n,t+r,n+a),e.lineTo(t+r,n+o-a),e.quadraticCurveTo(t+r,n+o,t+r-a,n+o),e.lineTo(t+a,n+o),e.quadraticCurveTo(t,n+o,t,n+o-a),e.lineTo(t,n+a),e.quadraticCurveTo(t,n,t+a,n),e.closePath()}function Mo(e,t){let n=Number.parseFloat(e||"3");return Math.max(1,Math.round((Number.isFinite(n)?n:3)*t))}function Ro(e,t){let n=Number.parseFloat(e||"6");return Math.max(0,Math.round((Number.isFinite(n)?n:6)*t))}function Fe(e){let t=e.getBoundingClientRect();return{x:t.left+window.scrollX,y:t.top+window.scrollY,w:t.width,h:t.height}}function zo(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>t(r),r.onerror=()=>n(new Error("Failed to load image for selected element highlight")),r.src=e})}function _e(e){let t=e?.theme==="dark",n=G(e?.radius),r=G(e?.borderWidth),o=oe(e?.font);return{accent:ae(B(e?.accentColor)),fontFamily:e?.font==="inherit"?"system-ui, sans-serif":o||"'Space Grotesk', system-ui, sans-serif",radius:n!==void 0?`${n}px`:"6px",bw:r!==void 0?String(r):"3",tooltipBg:B(e?.bgColor)||(t?"#0f172a":"#1a1a1a"),tooltipText:B(e?.textColor)||"#f1f5f9",tooltipBorder:B(e?.borderColor)||(t?"#334155":"#333")}}var Ao=new Set(["alert","alertdialog","application","article","banner","button","cell","checkbox","columnheader","combobox","complementary","contentinfo","definition","dialog","directory","document","feed","figure","form","grid","gridcell","group","heading","img","link","list","listbox","listitem","log","main","marquee","math","menu","menubar","menuitem","menuitemcheckbox","menuitemradio","meter","navigation","none","note","option","presentation","progressbar","radio","radiogroup","region","row","rowgroup","rowheader","scrollbar","search","searchbox","separator","slider","spinbutton","status","switch","tab","table","tablist","tabpanel","term","textbox","timer","toolbar","tooltip","tree","treegrid","treeitem"]),Io=new Set(["button","checkbox","link","menuitem","menuitemcheckbox","menuitemradio","option","radio","searchbox","switch","tab","textbox"]),Do=new Set(["button","input","select","textarea"]);function hn(e){return Fo(e)??e}function Fo(e){let{body:t,documentElement:n}=e.ownerDocument,r=e;for(;r&&r!==t&&r!==n;){if($o(r))return r;r=r.parentElement}return null}function $o(e){if(e.getAttribute("aria-disabled")==="true")return!1;let t=e.tagName.toLowerCase();if(t==="a")return e.hasAttribute("href");if(Do.has(t))return!("disabled"in e&&e.disabled);if(t==="summary")return!0;let n=Bo(e);if(n&&Io.has(n))return!0;let r=e.getAttribute("tabindex");return r!==null&&Number.parseInt(r,10)>=0}function Bo(e){let t=e.getAttribute("role");if(!t)return null;for(let n of t.split(/\s+/)){let r=n.toLowerCase();if(Ao.has(r))return r}return null}var _o=new Set(["bugdrop-element-picker-overlay","bugdrop-element-picker-highlight","bugdrop-element-picker-tooltip","bugdrop-element-picker-cancel"]);function No(){let e=navigator.maxTouchPoints>0;return window.matchMedia&&window.matchMedia("(hover: none), (pointer: coarse), (any-pointer: coarse)").matches||e}function Ho(){let e=document.createElement("div");return e.id="bugdrop-element-picker-overlay",e.style.cssText=`
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    background: transparent;
  `,e}function Oo(e){let t=document.createElement("div");return t.id="bugdrop-element-picker-highlight",t.style.cssText=`
    position: fixed;
    box-sizing: content-box;
    pointer-events: none;
    border: ${e.bw}px solid ${e.accent};
    background: transparent;
    z-index: 2147483645;
    transition: all 0.05s ease-out;
    box-shadow: none;
    border-radius: ${e.radius};
  `,t}function Uo(e,t){let n=document.createElement("div");if(n.id="bugdrop-element-picker-tooltip",n.style.cssText=`
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${e.tooltipBg};
    color: ${e.tooltipText};
    padding: 14px 28px;
    border-radius: ${e.radius};
    font-family: ${e.fontFamily};
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: ${e.bw}px solid ${e.tooltipBorder};
  `,!t)return n.textContent=`${c().elementPickerInstruction} (${c().escToCancel})`,{tooltip:n,cancelButton:null};let r=Go(e.accent);return n.append(`${c().elementPickerTouchInstruction} (`,r,")"),{tooltip:n,cancelButton:r}}function Wo(e,t){let n=t.getBoundingClientRect();e.style.top=`${n.top-2}px`,e.style.left=`${n.left-2}px`,e.style.width=`${n.width+4}px`,e.style.height=`${n.height+4}px`,e.style.display="block"}function jo(e){e.overlay.addEventListener("pointerdown",e.onPointerDown),e.overlay.addEventListener("pointermove",e.onPointerMove),e.overlay.addEventListener("pointerup",e.onPointerUp),e.overlay.addEventListener("pointercancel",e.onPointerCancel),document.addEventListener("mousemove",e.onMouseMove,!0)}function qo(e){e.overlay.removeEventListener("pointerdown",e.onPointerDown),e.overlay.removeEventListener("pointermove",e.onPointerMove),e.overlay.removeEventListener("pointerup",e.onPointerUp),e.overlay.removeEventListener("pointercancel",e.onPointerCancel),document.removeEventListener("mousemove",e.onMouseMove,!0)}function fn(e){return new Promise(t=>{setTimeout(()=>{Vo(t,e)},50)})}function Vo(e,t){let{accent:n,fontFamily:r,radius:o,bw:i,tooltipBg:a,tooltipText:s,tooltipBorder:l}=_e(t),d=Ho();document.body.appendChild(d);let u=Oo({accent:n,bw:i,radius:o});document.body.appendChild(u);let{tooltip:m,cancelButton:y}=Uo({accent:n,fontFamily:r,radius:o,bw:i,tooltipBg:a,tooltipText:s,tooltipBorder:l},No());document.body.appendChild(m);let x=null,v=null,T=!1,k;function z(p){return p===d||p===u||p===m||_o.has(p.id)}function R(p,U){let q=d.style.pointerEvents;return d.style.pointerEvents="none",(()=>{try{return document.elementsFromPoint(p,U)}finally{d.style.pointerEvents=q}})().find(Ce=>!(z(Ce)||Ce.closest("#bugdrop-host")))}function P(p,U,q){let Y=R(p,U);return Y?hn(Y):q}function M(p){x=P(p.clientX,p.clientY,x),x&&Wo(u,x)}function A(p,U,q=!1){x=P(p,U,x),f(x,q)}function f(p,U=!1){T||(T=!0,E(U),e(p))}function C(p){v!==null||!p.isPrimary||(p.preventDefault(),p.stopPropagation(),v=p.pointerId,d.setPointerCapture?.(p.pointerId),x=P(p.clientX,p.clientY,x))}function D(p){v!==null&&p.pointerId!==v||(p.preventDefault(),p.stopPropagation(),M(p))}function I(p){v!==null&&p.pointerId!==v||(p.preventDefault(),p.stopPropagation(),v=null,d.releasePointerCapture?.(p.pointerId),A(p.clientX,p.clientY,!0))}function F(p){p.pointerId===v&&(v=null,d.releasePointerCapture?.(p.pointerId))}function O(p){if(T){if(document.removeEventListener("click",O,!0),p.target instanceof Element&&p.target.closest("#bugdrop-host"))return;p.preventDefault(),p.stopImmediatePropagation();return}if(p.preventDefault(),p.stopImmediatePropagation(),p.target instanceof Element&&p.target.id==="bugdrop-element-picker-cancel"){f(null);return}A(p.clientX,p.clientY)}function w(p){p.target instanceof Element&&p.target.id==="bugdrop-element-picker-cancel"||(p.type==="pointerdown"&&C(p),p.type==="pointermove"&&D(p),p.type==="pointerup"&&I(p),p.type==="pointercancel"&&F(p),p.preventDefault(),p.stopImmediatePropagation())}function h(p){p.key==="Escape"&&f(null)}function b(p){p.preventDefault(),p.stopPropagation(),f(null)}function E(p=!1){k!==void 0&&(window.clearTimeout(k),k=void 0),qo({overlay:d,onPointerDown:C,onPointerMove:D,onPointerUp:I,onPointerCancel:F,onMouseMove:M}),p?k=window.setTimeout(()=>{document.removeEventListener("click",O,!0),k=void 0},1e3):document.removeEventListener("click",O,!0),document.removeEventListener("keydown",h),N(),y?.removeEventListener("click",b),d.remove(),u.remove(),m.remove(),document.body.style.cursor=""}function L(){window.addEventListener("pointerdown",w,!0),window.addEventListener("pointermove",w,!0),window.addEventListener("pointerup",w,!0),window.addEventListener("pointercancel",w,!0)}function N(){window.removeEventListener("pointerdown",w,!0),window.removeEventListener("pointermove",w,!0),window.removeEventListener("pointerup",w,!0),window.removeEventListener("pointercancel",w,!0)}document.body.style.cursor="crosshair",L(),jo({overlay:d,onPointerDown:C,onPointerMove:D,onPointerUp:I,onPointerCancel:F,onMouseMove:M}),document.addEventListener("click",O,!0),document.addEventListener("keydown",h),y?.addEventListener("click",b)}function Go(e){let t=document.createElement("button");return t.id="bugdrop-element-picker-cancel",t.type="button",t.textContent=c().cancel,t.style.cssText=`
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    color: ${e};
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-weight: 700;
    justify-content: center;
    margin: -10px -12px;
    min-height: 44px;
    min-width: 44px;
    padding: 10px 12px;
    pointer-events: auto;
    text-decoration: underline;
    text-underline-offset: 2px;
    touch-action: manipulation;
    white-space: nowrap;
    width: auto;
  `,t}var yn=10;function wn(e,t){return new Promise(n=>{setTimeout(()=>{Xo(n,e,t)},50)})}function Xo(e,t,n){let{accent:r,fontFamily:o,radius:i,bw:a,tooltipBg:s,tooltipText:l,tooltipBorder:d}=_e(t),u=Yo();document.body.appendChild(u);let m=Ko({accent:r,bw:a,radius:i});document.body.appendChild(m);let y=n?.redactionsAvailable?c().areaPickerRedactionInstruction:c().areaPickerInstruction,x=Qo(),v=Zo({accent:r,fontFamily:o,radius:i,bw:a,tooltipBg:s,tooltipText:l,tooltipBorder:d},y,x);document.body.appendChild(v);let T=v.querySelector("#bugdrop-area-picker-cancel"),k=0,z=0,R=!1,P=null;function M(w,h,b,E){let L=Math.min(w,b),N=Math.min(h,E),p=Math.abs(b-w),U=Math.abs(E-h);m.style.left=`${L}px`,m.style.top=`${N}px`,m.style.width=`${p}px`,m.style.height=`${U}px`,m.style.display="block";let q=L+p,Y=N+U;u.style.clipPath=`polygon(
      0% 0%, 0% 100%, ${L}px 100%, ${L}px ${N}px,
      ${q}px ${N}px, ${q}px ${Y}px,
      ${L}px ${Y}px, ${L}px 100%, 100% 100%, 100% 0%
    )`}function A(w){P!==null||!w.isPrimary||(w.preventDefault(),k=w.clientX,z=w.clientY,R=!0,P=w.pointerId,u.setPointerCapture?.(w.pointerId))}function f(w){!R||w.pointerId!==P||(w.preventDefault(),M(k,z,w.clientX,w.clientY))}function C(w){if(!R||w.pointerId!==P)return;w.preventDefault(),R=!1,P=null,u.releasePointerCapture?.(w.pointerId);let h=Math.abs(w.clientX-k),b=Math.abs(w.clientY-z);if(h<yn||b<yn){m.style.display="none",u.style.clipPath="";return}let E=Math.min(k,w.clientX)+window.scrollX,L=Math.min(z,w.clientY)+window.scrollY;O(),e(new DOMRect(E,L,h,b))}function D(w){w.pointerId===P&&(R=!1,P=null,m.style.display="none",u.style.clipPath="")}function I(w){w.key==="Escape"&&(O(),e(null))}function F(){O(),e(null)}function O(){u.removeEventListener("pointerdown",A),document.removeEventListener("pointermove",f),document.removeEventListener("pointerup",C),document.removeEventListener("pointercancel",D),document.removeEventListener("keydown",I),T?.removeEventListener("click",F),u.remove(),m.remove(),v.remove()}u.addEventListener("pointerdown",A),document.addEventListener("pointermove",f),document.addEventListener("pointerup",C),document.addEventListener("pointercancel",D),document.addEventListener("keydown",I),T?.addEventListener("click",F)}function Yo(){let e=document.createElement("div");return e.id="bugdrop-area-picker-overlay",e.style.cssText=`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2147483646;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  `,e}function Ko(e){let t=document.createElement("div");return t.id="bugdrop-area-picker-selection",t.style.cssText=`
    position: fixed;
    border: ${e.bw}px solid ${e.accent};
    box-shadow: 0 0 0 4px color-mix(in srgb, ${e.accent} 30%, transparent);
    border-radius: ${e.radius};
    z-index: 2147483647;
    pointer-events: none;
    display: none;
  `,t}function Zo(e,t,n){let r=document.createElement("div");if(r.id="bugdrop-area-picker-tooltip",r.style.cssText=`
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 20px);
    left: 50%;
    transform: translateX(-50%);
    background: ${e.tooltipBg};
    color: ${e.tooltipText};
    padding: 14px 28px;
    border-radius: ${e.radius};
    font-family: ${e.fontFamily};
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    max-width: min(420px, calc(100vw - 40px));
    box-sizing: border-box;
    text-align: center;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: ${e.bw}px solid ${e.tooltipBorder};
    pointer-events: none;
  `,n){let o=document.createElement("button");o.id="bugdrop-area-picker-cancel",o.type="button",o.textContent=c().cancel,o.style.cssText=`
      align-items: center;
      appearance: none;
      background: transparent;
      border: 0;
      color: ${e.accent};
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      justify-content: center;
      margin: -10px -12px;
      min-height: 44px;
      min-width: 44px;
      padding: 10px 12px;
      pointer-events: auto;
      text-decoration: underline;
      text-underline-offset: 2px;
      touch-action: manipulation;
      white-space: nowrap;
      width: auto;
    `,r.append(t," (",o,")")}else r.textContent=`${t} (${c().escToCancel})`;return r}function Qo(){let e=navigator.maxTouchPoints>0;return window.matchMedia&&window.matchMedia("(hover: none), (pointer: coarse), (any-pointer: coarse)").matches||e}var mt="#ff0000",Jo="#000000";var Ne=Math.PI/7,vn=2,xn=4,He=1;function kn(e,t){let n=document.createElement("canvas"),r=n.getContext("2d"),o="draw",i=!1,a=[],s=null,l=!1,d=[],u=new Image;u.onload=()=>{n.width=u.width,n.height=u.height,n.style.maxWidth="100%",n.style.height="auto",n.style.cursor="crosshair",r.drawImage(u,0,0),m()},u.src=t,e.appendChild(n);function m(){d.push(r.getImageData(0,0,n.width,n.height))}function y(h){r.putImageData(h,0,0)}function x(){return d[d.length-1]??null}function v(h,b){return Math.hypot(b.x-h.x,b.y-h.y)}function T(){window.removeEventListener("mouseup",w),i=!1,a=[],s=null,l=!1}function k(){s&&y(s),T()}function z(h){let b=n.getBoundingClientRect(),E=u.width/b.width,L=u.height/b.height,N=(h.clientX-b.left)*E,p=(h.clientY-b.top)*L;return{x:Math.max(0,Math.min(n.width,N)),y:Math.max(0,Math.min(n.height,p))}}function R(){let h=n.getBoundingClientRect(),b=Math.max(n.width/h.width,n.height/h.height,1);return Math.round(5.5*b)}function P(h,b){let E=R();r.beginPath(),r.moveTo(h.x,h.y),r.lineTo(b.x,b.y),r.strokeStyle=mt,r.lineWidth=E,r.lineCap="round",r.lineJoin="round",r.stroke()}function M(h,b){P(h,b);let E=Math.atan2(b.y-h.y,b.x-h.x),L=R()*5;r.beginPath(),r.moveTo(b.x,b.y),r.lineTo(b.x-L*Math.cos(E-Ne),b.y-L*Math.sin(E-Ne)),r.lineTo(b.x-L*Math.cos(E+Ne),b.y-L*Math.sin(E+Ne)),r.closePath(),r.fillStyle=mt,r.fill()}function A(h,b){r.strokeStyle=mt,r.lineWidth=R(),r.lineCap="round",r.lineJoin="round",r.strokeRect(h.x,h.y,b.x-h.x,b.y-h.y)}function f(h,b){let E=Math.min(h.x,b.x),L=Math.min(h.y,b.y),N=Math.abs(b.x-h.x),p=Math.abs(b.y-h.y);return{x:E,y:L,width:N,height:p}}function C(h,b){let{x:E,y:L,width:N,height:p}=f(h,b),U=Math.max(0,Math.floor(E)-He),q=Math.max(0,Math.floor(L)-He),Y=Math.min(n.width,Math.ceil(E+N)+He),Ce=Math.min(n.height,Math.ceil(L+p)+He);return{x:U,y:q,width:Math.max(0,Y-U),height:Math.max(0,Ce-q)}}function D(h,b){let{width:E,height:L}=C(h,b);return E>=xn&&L>=xn}function I(h,b){let{x:E,y:L,width:N,height:p}=C(h,b);r.fillStyle=Jo,r.fillRect(E,L,N,p)}function F(h){let b=x();b&&(i=!0,a=[z(h)],s=b,l=!1,window.addEventListener("mouseup",w))}function O(h){if(!i||!s)return;let b=z(h);o==="draw"?(P(a[a.length-1],b),a.push(b),l=l||v(a[0],b)>=vn):(y(s),o==="arrow"?M(a[0],b):o==="rect"?A(a[0],b):o==="redact"&&I(a[0],b))}function w(h){if(!i||!s){T();return}let b=z(h),E=a[0];if(!(o==="redact"?D(E,b):l||v(E,b)>=vn)){y(s),T();return}o==="arrow"?(y(s),M(E,b)):o==="rect"?(y(s),A(E,b)):o==="redact"?(y(s),I(E,b)):o==="draw"&&!l&&P(E,b),m(),T()}return n.addEventListener("mousedown",F),n.addEventListener("mousemove",O),n.addEventListener("mouseup",w),{setTool(h){k(),o=h},undo(){if(s){k();return}if(d.length<=1)return;T(),d.pop();let h=x();h&&y(h)},getImageData(){return n.toDataURL("image/png")},destroy(){T(),n.removeEventListener("mousedown",F),n.removeEventListener("mousemove",O),n.removeEventListener("mouseup",w),n.remove()}}}function ei(){return typeof window<"u"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}function Oe(e,t=ei){return e==="auto"?t():e}function Ue(e){return e==="light"||e==="dark"||e==="auto"}function be(e,t){e.classList.toggle("bd-dark",t==="dark")}function he(e,t,n){let r=n==="dark",o=B(t.accentColor);if(o){let u=o;e.style.setProperty("--bd-primary",u),e.style.setProperty("--bd-primary-hover",De(u)),e.style.setProperty("--bd-border-focus",u)}let i=B(t.bgColor);i&&(e.style.setProperty("--bd-bg-primary",i),r?(e.style.setProperty("--bd-bg-secondary",`color-mix(in srgb, ${i} 85%, white)`),e.style.setProperty("--bd-bg-tertiary",`color-mix(in srgb, ${i} 70%, white)`)):(e.style.setProperty("--bd-bg-secondary",`color-mix(in srgb, ${i} 93%, black)`),e.style.setProperty("--bd-bg-tertiary",`color-mix(in srgb, ${i} 85%, black)`)));let a=B(t.textColor);if(a){e.style.setProperty("--bd-text-primary",a);let u=i||(r?"#0f172a":"#fafaf9");e.style.setProperty("--bd-text-secondary",`color-mix(in srgb, ${a} 65%, ${u})`),e.style.setProperty("--bd-text-muted",`color-mix(in srgb, ${a} 40%, ${u})`)}let s=G(t.borderWidth)??null,l=B(t.borderColor)||null;if(s!==null||l!==null){let u=s!==null?`${s}px`:"1px",m=l||"var(--bd-border)";e.style.setProperty("--bd-border-width",u),l&&e.style.setProperty("--bd-border",m),e.style.setProperty("--bd-border-style",`var(--bd-border-width) solid ${m}`)}let d=Re(t.shadow)||null;if(d==="none")e.style.setProperty("--bd-shadow-sm","none"),e.style.setProperty("--bd-shadow-md","none"),e.style.setProperty("--bd-shadow-lg","none"),e.style.setProperty("--bd-shadow-glow","none");else if(d==="hard"){let u=l||(r?"#000":"#1a1a1a"),m=s!==null?"calc(var(--bd-border-width) + 2px)":"6px";e.style.setProperty("--bd-shadow-sm",`${u} 2px 2px 0 0`),e.style.setProperty("--bd-shadow-md",`${u} ${m} ${m} 0 0`),e.style.setProperty("--bd-shadow-lg",`${u} ${m} ${m} 0 0`),e.style.setProperty("--bd-shadow-glow","none")}}function En(e){if(typeof window>"u"||!window.matchMedia)return typeof console<"u"&&console.warn&&console.warn('[BugDrop] window.matchMedia unavailable; data-theme="auto" will not react to OS theme changes.'),()=>{};let t=window.matchMedia("(prefers-color-scheme: dark)"),n=r=>{try{e(r.matches?"dark":"light")}catch(o){console.warn("[BugDrop] Error applying system theme change:",o)}};return t.addEventListener("change",n),()=>t.removeEventListener("change",n)}var le=8,ti="(hover: none), (pointer: coarse)",ni="(max-width: 640px)";function ri(e,t,n){let r=pe(e);return!!(r&&r!=="none"&&r!=="#"&&n!=="never"&&(t||n==="always"))}function Sn(e,t){let n=t.position==="bottom-left"?"left: 0":"right: 0",r=Oe(t.theme),o=t.font==="inherit",i=t.font&&t.font!=="inherit"?oe(t.font):null,a=o||i?"":"@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');",s=o?"inherit":i?`${i}, system-ui, sans-serif`:"'Space Grotesk', system-ui, sans-serif",l=G(t.radius)??null,d=l!==null?`${l}px`:"6px",u=l!==null?`${Math.round(l*1.4)}px`:"10px",m=l!==null?`${Math.round(l*2)}px`:"14px",y=G(t.borderWidth)??null,x=document.createElement("style");x.textContent=`
    ${a}

    :host {
      /* Typography */
      --bd-font: ${s};

      /* Radius */
      --bd-radius-sm: ${d};
      --bd-radius-md: ${u};
      --bd-radius-lg: ${m};

      /* Border */
      --bd-border-width: ${y!==null?`${y}px`:"1px"};

      /* Transitions */
      --bd-transition: 0.15s ease;
      --bd-transition-slow: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Light Theme (Default) */
    .bd-root {
      --bd-bg-primary: #fafaf9;
      --bd-bg-secondary: #f5f5f4;
      --bd-bg-tertiary: #e7e5e4;
      --bd-text-primary: #1c1917;
      --bd-text-secondary: #57534e;
      --bd-text-muted: #a8a29e;
      --bd-border: #e7e5e4;
      --bd-border-style: var(--bd-border-width) solid var(--bd-border);
      --bd-border-focus: ${ge};
      --bd-primary: ${ge};
      --bd-primary-hover: ${De(ge)};
      --bd-primary-text: #ffffff;
      --bd-overlay-bg: rgba(0, 0, 0, 0.4);
      --bd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --bd-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
      --bd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
      --bd-shadow-glow: none;
      --bd-success: #22c55e;
      --bd-error: #ef4444;
    }

    /* Dark Theme */
    .bd-root.bd-dark {
      --bd-bg-primary: #0f172a;
      --bd-bg-secondary: #1e293b;
      --bd-bg-tertiary: #334155;
      --bd-text-primary: #f1f5f9;
      --bd-text-secondary: #94a3b8;
      --bd-text-muted: #64748b;
      --bd-border: #334155;
      --bd-border-focus: #22d3ee;
      --bd-primary: #22d3ee;
      --bd-primary-hover: #06b6d4;
      --bd-primary-text: #0f172a;
      --bd-overlay-bg: rgba(0, 0, 0, 0.6);
      --bd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
      --bd-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
      --bd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.4);
      --bd-shadow-glow: 0 0 40px rgba(34, 211, 238, 0.15);
      --bd-success: #34d399;
      --bd-error: #f87171;
    }

    .bd-root {
      font-family: var(--bd-font);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    * {
      box-sizing: border-box;
      font-family: inherit;
    }

    /* Trigger Button (edge label) */
    .bd-trigger {
      position: fixed;
      bottom: 20px;
      ${n};
      height: 44px;
      min-width: 0;
      padding: 0 0 0 16px;
      border-radius: ${l!==null?`${l*2}px 0 0 ${l*2}px`:"22px 0 0 22px"};
      border: ${y!==null?"var(--bd-border-style)":"none"};
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      cursor: pointer;
      box-shadow:
        var(--bd-shadow-md),
        0 0 0 0 var(--bd-primary);
      z-index: 999999;
      transition: transform var(--bd-transition), box-shadow var(--bd-transition), opacity var(--bd-transition);
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: visible;
      animation: bd-triggerSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }

    .bd-trigger--left {
      padding: 0 16px 0 0;
      border-radius: ${l!==null?`0 ${l*2}px ${l*2}px 0`:"0 22px 22px 0"};
    }

    .bd-trigger--positioned {
      animation: none;
    }

    .bd-trigger:hover {
      transform: scale(1.03);
      box-shadow:
        var(--bd-shadow-lg),
        0 0 20px color-mix(in srgb, var(--bd-primary) 30%, transparent);
    }

    .bd-trigger:active {
      transform: scale(0.97);
    }

    .bd-trigger-icon {
      font-size: 18px;
      line-height: 1;
    }

    .bd-trigger-icon img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      display: block;
    }

    .bd-trigger-label {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .bd-trigger-drag-handle {
      align-self: center;
      width: 30px;
      height: calc(100% - 8px);
      margin: 4px;
      border-radius: 7px;
      background: transparent;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bd-primary-text);
      opacity: 0.95;
      touch-action: none;
    }

    .bd-trigger--left .bd-trigger-drag-handle {
      order: -1;
    }

    .bd-trigger-drag-handle:hover,
    .bd-trigger-drag-handle:active,
    .bd-trigger--dragging .bd-trigger-drag-handle {
      background: color-mix(in srgb, var(--bd-primary-text) 18%, transparent);
      opacity: 1;
    }

    .bd-trigger-drag-handle:hover {
      cursor: grab;
    }

    .bd-trigger-drag-handle:active,
    .bd-trigger--dragging .bd-trigger-drag-handle {
      cursor: grabbing;
    }

    .bd-trigger-drag-handle svg {
      display: block;
      width: 14px;
      height: 22px;
      pointer-events: none;
    }

    @keyframes bd-triggerSlideIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Pull Tab (shown after dismissal) */
    .bd-pull-tab {
      position: fixed;
      bottom: 20px;
      right: 0;
      width: 24px;
      height: 48px;
      border-radius: 8px 0 0 8px;
      border: none;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      cursor: pointer;
      box-shadow: -2px 4px 12px color-mix(in srgb, var(--bd-primary) 30%, transparent);
      z-index: 999999;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bd-pullTabSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .bd-pull-tab:hover {
      width: 32px;
      box-shadow: -4px 6px 16px color-mix(in srgb, var(--bd-primary) 40%, transparent);
    }

    .bd-pull-tab:active {
      width: 28px;
    }

    .bd-pull-tab-chevron {
      font-size: 16px;
      font-weight: bold;
      transition: transform 0.2s;
    }

    .bd-pull-tab:hover .bd-pull-tab-chevron {
      transform: translateX(-2px);
    }

    /* Pull tab position for bottom-left */
    .bd-pull-tab--left {
      right: auto;
      left: 0;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 4px 12px color-mix(in srgb, var(--bd-primary) 30%, transparent);
    }

    .bd-pull-tab--left:hover {
      box-shadow: 4px 6px 16px color-mix(in srgb, var(--bd-primary) 40%, transparent);
    }

    .bd-pull-tab--left .bd-pull-tab-chevron {
      transform: rotate(180deg);
    }

    .bd-pull-tab--left:hover .bd-pull-tab-chevron {
      transform: rotate(180deg) translateX(-2px);
    }

    @media (max-width: 640px) {
      .bd-pull-tab {
        bottom: 16px;
        height: 44px;
        width: 22px;
      }

      .bd-pull-tab:hover {
        width: 28px;
      }
    }

    /* Touch devices - always slightly expanded */
    @media (hover: none) {
      .bd-pull-tab {
        width: 28px;
      }
    }

    /* Dismissible close button */
    .bd-trigger-close {
      position: absolute;
      top: -4px;
      right: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: none;
      background: var(--bd-text-primary);
      color: var(--bd-bg-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.8);
      transition: opacity var(--bd-transition), transform var(--bd-transition);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-trigger--left .bd-trigger-close {
      right: auto;
      left: 36px;
    }

    .bd-trigger--right .bd-trigger-close {
      right: 36px;
    }

    .bd-trigger:hover .bd-trigger-close,
    .bd-trigger-close:focus-visible {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    .bd-trigger-close:hover {
      background: var(--bd-error);
      color: white;
    }

    /* Modal Overlay */
    .bd-overlay {
      position: fixed;
      inset: 0;
      background: var(--bd-overlay-bg);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bd-fadeIn 0.2s ease;
    }

    /* Modal */
    .bd-modal {
      background: var(--bd-bg-primary);
      border-radius: var(--bd-radius-lg);
      border: var(--bd-border-style);
      box-shadow: var(--bd-shadow-lg), var(--bd-shadow-glow);
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: bd-slideUp var(--bd-transition-slow);
    }

    .bd-modal--positioned {
      position: fixed;
      margin: 0;
      animation: none;
    }

    .bd-modal--dragging {
      user-select: none;
    }

    .bd-modal--annotator {
      width: min(96vw, 1100px);
      max-width: 1100px;
    }

    /* Modal Header */
    .bd-header {
      position: relative;
      padding: 16px 20px;
      border-bottom: var(--bd-border-style);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bd-bg-primary);
      animation: bd-fadeIn 0.2s ease 0.05s both;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }

    .bd-modal-drag-indicator {
      position: absolute;
      top: 6px;
      left: 50%;
      transform: translateX(-50%);
      width: 28px;
      height: 10px;
      display: grid;
      grid-template-columns: repeat(3, 4px);
      grid-auto-rows: 4px;
      gap: 3px 5px;
      justify-content: center;
      align-content: center;
      color: var(--bd-text-muted);
      opacity: 0.8;
      pointer-events: none;
    }

    .bd-modal-drag-indicator span {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
    }

    .bd-modal--dragging .bd-header {
      cursor: grabbing;
    }

    .bd-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--bd-text-primary);
    }

    .bd-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--bd-radius-sm);
      font-size: 24px;
      cursor: pointer;
      color: var(--bd-text-secondary);
      padding: 0;
      line-height: 1;
      transition: background var(--bd-transition), color var(--bd-transition);
    }

    .bd-close:hover {
      background: var(--bd-bg-secondary);
      color: var(--bd-text-primary);
    }

    /* Modal Body with staggered animation */
    .bd-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .bd-modal--annotator .bd-body {
      padding-top: 0;
    }

    .bd-body > *:nth-child(1) { animation: bd-fadeIn 0.2s ease 0.1s both; }
    .bd-body > *:nth-child(2) { animation: bd-fadeIn 0.2s ease 0.15s both; }
    .bd-body > *:nth-child(3) { animation: bd-fadeIn 0.2s ease 0.2s both; }
    .bd-body > *:nth-child(4) { animation: bd-fadeIn 0.2s ease 0.25s both; }
    .bd-body > *:nth-child(5) { animation: bd-fadeIn 0.2s ease 0.3s both; }

    .bd-version {
      text-align: center;
      padding: 4px 0;
      font-size: 0.7rem;
      color: var(--bd-text-secondary);
      opacity: 0.5;
    }

    /* Form Elements */
    .bd-form-group {
      margin-bottom: 16px;
    }

    .bd-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 13px;
      color: var(--bd-text-secondary);
      letter-spacing: 0.01em;
    }

    .bd-input, .bd-textarea {
      width: 100%;
      padding: 12px 14px;
      background: var(--bd-bg-primary);
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-sm);
      font-size: 14px;
      color: var(--bd-text-primary);
      transition: border-color var(--bd-transition), box-shadow var(--bd-transition);
    }

    .bd-input::placeholder, .bd-textarea::placeholder {
      color: var(--bd-text-muted);
    }

    .bd-input:focus, .bd-textarea:focus {
      outline: none;
      border-color: var(--bd-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--bd-border-focus) 15%, transparent);
    }

    .bd-textarea {
      min-height: 100px;
      resize: vertical;
    }

    /* Buttons */
    .bd-btn {
      padding: 11px 20px;
      border-radius: var(--bd-radius-sm);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--bd-transition);
      position: relative;
    }

    .bd-btn-primary {
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border: none;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-btn-primary:hover {
      background: var(--bd-primary-hover);
      box-shadow: var(--bd-shadow-md);
    }

    .bd-dark .bd-btn-primary:hover {
      box-shadow: var(--bd-shadow-md), 0 0 20px rgba(34, 211, 238, 0.2);
    }

    .bd-btn-secondary {
      background: var(--bd-bg-primary);
      border: var(--bd-border-style);
      color: var(--bd-text-primary);
    }

    .bd-btn-secondary:hover {
      background: var(--bd-bg-secondary);
    }

    .bd-btn-quiet {
      background: transparent;
      border: none;
      color: var(--bd-text-secondary);
      padding-left: 12px;
      padding-right: 12px;
    }

    .bd-btn-quiet:hover {
      background: var(--bd-bg-secondary);
      color: var(--bd-text-primary);
    }

    .bd-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .bd-evidence-block {
      margin: 8px 0 16px;
    }

    .bd-evidence-row {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      align-items: center;
      gap: 14px;
    }

    .bd-screenshot-control {
      min-height: 36px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 3px;
    }

    .bd-checkbox {
      width: 18px;
      height: 18px;
      accent-color: var(--bd-primary);
      cursor: pointer;
      flex: 0 0 auto;
    }

    .bd-checkbox-label {
      color: var(--bd-text-secondary);
      cursor: pointer;
      font-size: 0.95rem;
      line-height: 1.35;
      user-select: none;
    }

    .bd-upload-group {
      min-width: 0;
      justify-self: end;
    }

    .bd-upload-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .bd-upload-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 6px 9px;
      font-size: 13px;
      white-space: nowrap;
    }

    .bd-upload-icon {
      width: 14px;
      height: 14px;
      flex: 0 0 auto;
    }

    .bd-upload-input {
      display: none;
    }

    .bd-upload-list {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }

    .bd-upload-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 28px;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 5px 5px 5px 10px;
      background: var(--bd-bg-secondary);
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-sm);
    }

    .bd-upload-item__name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--bd-text-primary);
      font-size: 13px;
    }

    .bd-upload-item__meta {
      color: var(--bd-text-secondary);
      font-size: 12px;
      white-space: nowrap;
    }

    .bd-upload-remove {
      width: 28px;
      height: 28px;
      display: inline-grid;
      place-items: center;
      border: none;
      border-radius: var(--bd-radius-sm);
      background: transparent;
      color: var(--bd-text-secondary);
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      transition: background var(--bd-transition), color var(--bd-transition);
    }

    .bd-upload-remove:hover {
      background: var(--bd-bg-tertiary);
      color: var(--bd-text-primary);
    }

    /* Loading States */
    .bd-btn--loading {
      color: transparent !important;
      pointer-events: none;
    }

    .bd-btn--loading::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      top: 50%;
      left: 50%;
      margin: -8px 0 0 -8px;
      border: 2px solid currentColor;
      border-color: var(--bd-primary-text) transparent var(--bd-primary-text) transparent;
      border-radius: 50%;
      animation: bd-spin 0.8s linear infinite;
    }

    .bd-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--bd-border);
      border-top-color: var(--bd-primary);
      border-radius: 50%;
      animation: bd-spin 0.8s linear infinite;
    }

    .bd-spinner--lg {
      width: 32px;
      height: 32px;
      border-width: 3px;
    }

    .bd-loading-overlay {
      position: absolute;
      inset: 0;
      background: var(--bd-bg-primary);
      opacity: 0.95;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 10;
      border-radius: var(--bd-radius-lg);
    }

    .bd-loading-text {
      font-size: 14px;
      color: var(--bd-text-secondary);
      font-weight: 500;
    }

    .bd-skeleton {
      background: linear-gradient(
        90deg,
        var(--bd-bg-secondary) 0%,
        var(--bd-bg-tertiary) 50%,
        var(--bd-bg-secondary) 100%
      );
      background-size: 200% 100%;
      animation: bd-shimmer 1.5s ease-in-out infinite;
      border-radius: var(--bd-radius-sm);
    }

    /* Error States */
    .bd-error-message {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--bd-radius-sm);
      color: var(--bd-error);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .bd-dark .bd-error-message {
      background: rgba(248, 113, 113, 0.1);
      border-color: rgba(248, 113, 113, 0.2);
    }

    .bd-error-message__icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }

    .bd-error-message__text {
      flex: 1;
      line-height: 1.4;
    }

    .bd-error-message__retry {
      background: none;
      border: none;
      color: inherit;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
      font-size: 13px;
    }

    .bd-input--error, .bd-textarea--error {
      border-color: var(--bd-error) !important;
    }

    /* Success Modal */
    .bd-success-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 0 16px;
    }

    .bd-success-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--bd-success);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .bd-success-icon svg {
      width: 28px;
      height: 28px;
      color: white;
    }

    .bd-success-issue {
      margin: 0 0 12px;
      color: var(--bd-text-primary);
      font-size: 15px;
    }

    .bd-issue-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--bd-primary);
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: var(--bd-radius-sm);
      background: var(--bd-bg-secondary);
      transition: background var(--bd-transition), color var(--bd-transition);
    }

    .bd-issue-link:hover {
      background: var(--bd-bg-tertiary);
      color: var(--bd-primary-hover);
    }

    .bd-issue-link svg {
      flex-shrink: 0;
    }

    .bd-powered-by {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--bd-border);
      text-align: center;
    }

    .bd-powered-by a {
      color: var(--bd-text-secondary);
      text-decoration: none;
      font-size: 12px;
      transition: color var(--bd-transition);
    }

    .bd-powered-by a:hover {
      color: var(--bd-text-primary);
    }

    .bd-input--error:focus, .bd-textarea--error:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
    }

    .bd-field-error {
      color: var(--bd-error);
      font-size: 12px;
      margin-top: 4px;
    }

    /* Actions */
    .bd-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .bd-success-actions {
      justify-content: center;
    }

    .bd-screenshot-actions {
      flex-wrap: wrap;
      gap: 8px;
    }

    /* Tools Toolbar */
    .bd-tools {
      display: flex;
      gap: 6px;
      padding: 8px;
      background: var(--bd-bg-secondary);
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-md);
      margin-bottom: 12px;
    }

    .bd-tool {
      padding: 8px 14px;
      background: transparent;
      border: none;
      border-radius: var(--bd-radius-sm);
      font-size: 13px;
      font-weight: 500;
      color: var(--bd-text-secondary);
      cursor: pointer;
      transition: all var(--bd-transition);
    }

    .bd-tool:hover {
      background: var(--bd-bg-tertiary);
      color: var(--bd-text-primary);
    }

    .bd-tool.active {
      background: var(--bd-bg-primary);
      color: var(--bd-primary);
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-annotation-stage {
      min-height: 240px;
      max-height: min(58vh, 620px);
      padding: 18px;
      border: 1px solid var(--bd-border, #e7e5e4);
      border-radius: var(--bd-radius-md);
      background:
        linear-gradient(45deg, var(--bd-bg-secondary) 25%, transparent 25%),
        linear-gradient(-45deg, var(--bd-bg-secondary) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, var(--bd-bg-secondary) 75%),
        linear-gradient(-45deg, transparent 75%, var(--bd-bg-secondary) 75%),
        var(--bd-bg-primary);
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-size: 16px 16px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bd-border) 60%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
    }

    .bd-annotation-stage canvas {
      display: block;
      max-width: 100%;
      max-height: calc(min(58vh, 620px) - 36px);
      width: auto;
      height: auto;
      background: #ffffff;
      box-shadow: var(--bd-shadow-md);
    }

    /* Preview */
    .bd-preview {
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-md);
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-preview img {
      width: 100%;
      display: block;
    }

    /* Toast Notifications */
    .bd-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-radius: var(--bd-radius-md);
      color: white;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000001;
      box-shadow: var(--bd-shadow-lg);
      animation: bd-slideIn 0.3s ease;
    }

    .bd-toast.success {
      background: var(--bd-success);
    }

    .bd-toast.error {
      background: var(--bd-error);
    }

    /* Animations */
    @keyframes bd-fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes bd-slideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes bd-slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes bd-pullTabSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Directional animations for dismiss/restore */
    @keyframes bd-triggerSlideInFromRight {
      from {
        opacity: 0;
        transform: translateX(100px) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes bd-triggerSlideOutToRight {
      from {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateX(100px) scale(0.8);
      }
    }

    .bd-trigger--dismissing {
      animation: bd-triggerSlideOutToRight 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    .bd-trigger--restoring {
      animation: bd-triggerSlideInFromRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes bd-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes bd-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Mobile Responsiveness */
    @media (max-width: 640px) {
      .bd-trigger {
        height: 40px;
        padding: 0 0 0 14px;
        bottom: 16px;
        gap: 6px;
      }

      .bd-trigger--left {
        padding: 0 14px 0 0;
      }

      .bd-trigger-drag-handle {
        width: 28px;
      }

      .bd-trigger-icon {
        font-size: 16px;
      }

      .bd-trigger-icon img {
        width: 16px;
        height: 16px;
      }

      .bd-trigger-label {
        font-size: 13px;
      }

      .bd-overlay {
        align-items: flex-end;
      }

      .bd-modal {
        width: 100%;
        max-width: 100%;
        max-height: 95vh;
        border-radius: var(--bd-radius-lg) var(--bd-radius-lg) 0 0;
        animation: bd-slideUpMobile var(--bd-transition-slow);
      }

      .bd-modal--positioned {
        position: static;
        width: 100%;
      }

      .bd-modal--annotator {
        width: calc(100% - 16px);
        max-width: calc(100% - 16px);
      }

      .bd-header {
        padding: 16px;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .bd-close {
        width: 44px;
        height: 44px;
        font-size: 28px;
      }

      .bd-body {
        padding: 16px;
        padding-bottom: 32px;
      }

      .bd-btn {
        padding: 14px 24px;
        font-size: 16px;
        min-height: 48px;
      }

      .bd-input, .bd-textarea {
        padding: 14px;
        font-size: 16px;
        min-height: 48px;
      }

      .bd-category-option {
        gap: 4px !important;
        padding: 8px !important;
        min-width: 0;
      }

      .bd-category-option span {
        font-size: 0.85rem !important;
        white-space: nowrap;
      }

      .bd-textarea {
        min-height: 120px;
      }

      .bd-evidence-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
      }

      .bd-upload-button {
        min-height: 34px;
        padding: 7px 10px;
        font-size: 14px;
      }

      .bd-actions {
        flex-direction: column-reverse;
        gap: 8px;
      }

      .bd-actions .bd-btn {
        width: 100%;
      }

      .bd-screenshot-actions {
        flex-direction: column;
      }

      .bd-tools {
        flex-wrap: wrap;
      }

      .bd-annotation-stage {
        min-height: 180px;
        max-height: 46vh;
        padding: 12px;
      }

      .bd-annotation-stage canvas {
        max-height: calc(46vh - 24px);
      }

      .bd-tool {
        flex: 1;
        min-width: calc(50% - 4px);
        justify-content: center;
        padding: 12px;
        text-align: center;
      }

      .bd-toast {
        left: 16px;
        right: 16px;
        bottom: 80px;
        justify-content: center;
      }
    }

    @keyframes bd-slideUpMobile {
      from { opacity: 0; transform: translateY(100%); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Touch-friendly hover states */
    @media (hover: none) {
      .bd-trigger:hover {
        transform: none;
        box-shadow: var(--bd-shadow-md);
      }

      .bd-trigger:active {
        transform: scale(0.97);
      }

      /* Always show close button on touch devices */
      .bd-trigger-close {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1);
      }

      .bd-header {
        cursor: default;
        user-select: auto;
        touch-action: auto;
      }

      .bd-modal-drag-indicator {
        display: none;
      }

      .bd-btn:hover {
        background: inherit;
      }

      .bd-btn-primary:hover {
        background: var(--bd-primary);
      }

      .bd-btn-primary:active {
        background: var(--bd-primary-hover);
      }

      .bd-btn-secondary:hover {
        background: var(--bd-bg-primary);
      }

      .bd-btn-secondary:active {
        background: var(--bd-bg-secondary);
      }
    }

    /* Safe area support for notched devices */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      .bd-modal {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `,e.appendChild(x);let v=document.createElement("div");return v.className="bd-root",be(v,r),he(v,t,r),e.appendChild(v),v}function fe(e){return`<p class="bd-redaction-note" style="margin: 0 0 12px; padding: 8px 12px; background: var(--bd-warning-bg, #fff8e1); border-radius: 6px; font-size: 13px; color: var(--bd-text-secondary);">${H(e)}</p>`}function _(e,t,n,r=!1,o=""){let i=document.createElement("div");i.className="bd-overlay";let a=["bd-modal",o].filter(Boolean).join(" "),s=r?'<div class="bd-version">BugDrop v1.53.1</div>':"";return i.innerHTML=`
    <div class="${a}">
      <div class="bd-header">
        <span class="bd-modal-drag-indicator" aria-hidden="true">
          <span></span><span></span><span></span>
          <span></span><span></span><span></span>
        </span>
        <h2 class="bd-title">${H(t)}</h2>
        <button class="bd-close">&times;</button>
      </div>
      <div class="bd-body">
        ${n}
      </div>
      ${s}
    </div>
  `,e.appendChild(i),oi(i),i}function oi(e){if(typeof window.matchMedia!="function"||window.matchMedia(ti).matches)return;let t=e.querySelector(".bd-modal"),n=e.querySelector(".bd-header");if(!t||!n)return;let r=t,o=n,i=null,a=0,s=0,l=0,d=0,u=!1,m=null,y=()=>{u||(u=!0,R(),window.removeEventListener("resize",T),window.visualViewport?.removeEventListener("resize",T),m?.disconnect())};function x(f,C){let D=r.getBoundingClientRect(),I=Math.max(le,window.innerWidth-D.width-le),F=Math.max(le,window.innerHeight-D.height-le);return{left:Math.min(Math.max(f,le),I),top:Math.min(Math.max(C,le),F)}}function v(f,C){let D=x(f,C);r.style.left=`${D.left}px`,r.style.top=`${D.top}px`}function T(){if(!e.isConnected){y();return}if(!r.classList.contains("bd-modal--positioned"))return;if(window.matchMedia(ni).matches){z();return}k();let f=r.getBoundingClientRect();v(f.left,f.top)}function k(){r.style.removeProperty("width"),r.style.removeProperty("max-width");let f=r.getBoundingClientRect(),C=Math.floor(window.innerWidth*.9);r.style.width=`${Math.min(f.width,C)}px`,r.style.maxWidth="none"}function z(){r.classList.remove("bd-modal--positioned","bd-modal--dragging"),r.style.removeProperty("left"),r.style.removeProperty("top"),r.style.removeProperty("width"),r.style.removeProperty("max-width")}function R(){i!==null&&(i=null,r.classList.remove("bd-modal--dragging"),window.removeEventListener("pointermove",P),window.removeEventListener("pointerup",M),window.removeEventListener("pointercancel",A))}function P(f){i===f.pointerId&&v(l+f.clientX-a,d+f.clientY-s)}function M(f){i===f.pointerId&&R()}function A(f){i===f.pointerId&&R()}o.addEventListener("pointerdown",f=>{if(f.target.closest("button, a, input, textarea, select, label"))return;f.preventDefault();let C=r.getBoundingClientRect();i=f.pointerId,a=f.clientX,s=f.clientY,l=C.left,d=C.top,r.classList.add("bd-modal--positioned","bd-modal--dragging"),r.style.width=`${C.width}px`,r.style.maxWidth="none",v(l,d),o.setPointerCapture(f.pointerId),window.addEventListener("pointermove",P),window.addEventListener("pointerup",M),window.addEventListener("pointercancel",A)}),window.addEventListener("resize",T),window.visualViewport?.addEventListener("resize",T),e.parentNode&&(m=new MutationObserver(()=>{e.isConnected||y()}),m.observe(e.parentNode,{childList:!0}))}function Tn(e,t,n,r,o="public"){return new Promise(i=>{let a=pe(n),s=ri(n,r,o),l=s&&a?`<a href="${H(a)}" target="_blank" rel="noopener noreferrer" class="bd-issue-link">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
          </svg>
          ${g(c().viewOnGitHub)}
        </a>`:"",d=r||o==="always"&&s?`
        <p class="bd-success-issue">${c().issueCreated(`<strong>#${t}</strong>`)}</p>
        ${l}
      `:`<p class="bd-success-issue">${g(c().feedbackSubmittedMessage)}</p>`,u=_(e,c().successTitle,`
        <div class="bd-success-content">
          <div class="bd-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          ${d}
        </div>
        <div class="bd-actions bd-success-actions">
          <button class="bd-btn bd-btn-primary" data-action="done">${g(c().done)}</button>
        </div>
        <div class="bd-powered-by">
          <a href="https://github.com/mean-weasel/bugdrop" target="_blank" rel="noopener noreferrer">Powered by BugDrop</a>
        </div>
      `,!0),m=u.querySelector(".bd-close"),y=u.querySelector('[data-action="done"]'),x=()=>{u.remove(),i()};m?.addEventListener("click",x),y?.addEventListener("click",x)})}function Cn(e,t,n=0,r){return new Promise(o=>{let i=[];r?.redactionUnavailable?i.push(c().viewportRedactionUnavailableNote):(n>0&&i.push(c().redactionCountNote(n)),r?.redactionLimitations&&i.push(c().redactionLimitationsNote));let a=i.length?fe(i.join(" ")):"",l=r?.selectedElementCapture?`
        <p class="bd-selected-element-note" style="margin: -4px 0 12px; color: var(--bd-text-secondary); font-size: 13px;">
          ${c().selectedElementNote('<a href="https://bugdrop.dev/docs/configuration#select-element-screenshots" target="_blank" rel="noopener noreferrer">data-element-context-max-area</a>')}
        </p>
      `:"",d=_(e,c().reviewScreenshotTitle,`
        ${a}
        <p style="margin: 0 0 12px; color: var(--bd-text-secondary); font-size: 13px;">
          ${g(c().annotationInstruction)}
        </p>
        ${l}
        <div class="bd-tools">
          <button class="bd-tool active" data-tool="draw">\u270F\uFE0F ${g(c().toolDraw)}</button>
          <button class="bd-tool" data-tool="arrow">\u27A1\uFE0F ${g(c().toolArrow)}</button>
          <button class="bd-tool" data-tool="rect">\u25A2 ${g(c().toolRectangle)}</button>
          <button class="bd-tool" data-tool="redact">${g(c().toolRedact)}</button>
          <button class="bd-tool" data-action="undo">\u21B6 ${g(c().undo)}</button>
        </div>
        <div id="annotation-canvas" class="bd-annotation-stage"></div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-secondary" data-action="retake">${g(c().retake)}</button>
          <button class="bd-btn bd-btn-primary" data-action="done">${g(c().submitFeedback)}</button>
        </div>
      `,!1,"bd-modal--annotator"),u=d.querySelector("#annotation-canvas"),m=kn(u,t),y=d.querySelectorAll("[data-tool]");y.forEach(z=>{z.addEventListener("click",R=>{let P=R.currentTarget,M=P.dataset.tool;M&&(y.forEach(A=>A.classList.remove("active")),P.classList.add("active"),m.setTool(M))})}),d.querySelector('[data-action="undo"]')?.addEventListener("click",()=>m.undo());let v=d.querySelector(".bd-close"),T=d.querySelector('[data-action="retake"]'),k=d.querySelector('[data-action="done"]');v?.addEventListener("click",()=>{m.destroy(),d.remove(),o("cancel")}),T?.addEventListener("click",()=>{m.destroy(),d.remove(),o("retake")}),k?.addEventListener("click",()=>{let z=m.getImageData();m.destroy(),d.remove(),o(z)})})}async function We(e,t,n,r){return je(e,()=>un(t,n,r?.captureOptions),r)}async function Ln(e,t,n,r){return je(e,()=>pn(t,n,r?.captureOptions),r)}async function je(e,t,n){let r=n?.showLoading===!1?null:_(e,c().capturingTitle,`
            <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
              <div class="bd-spinner bd-spinner--lg"></div>
              <p class="bd-loading-text" style="margin-top: 12px;">${g(c().capturingScreenshot)}</p>
            </div>
          `);try{r&&await ii();let i=await(typeof t=="function"?t():t);return r?.remove(),si(i)}catch(o){console.warn("[BugDrop] Screenshot capture failed:",o),r?.remove();let i=n?.allowSkip!==!1,a=n?.allowChooseAgain!==!1;return o instanceof ie?ai(e):new Promise(s=>{let l=_(e,c().captureFailedTitle,`
          <div class="bd-error-message">
            <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
            </svg>
            <span class="bd-error-message__text">${g(c().captureFailedMessage)}</span>
          </div>
          <div class="bd-actions">
            ${i?`<button class="bd-btn bd-btn-secondary" data-action="skip">${g(c().skipScreenshot)}</button>`:""}
            ${a?`<button class="bd-btn bd-btn-primary" data-action="choose-again">${g(c().chooseAnotherMethod)}</button>`:""}
          </div>
        `,!0),d=l.querySelector(".bd-close"),u=l.querySelector('[data-action="skip"]'),m=l.querySelector('[data-action="choose-again"]');d?.addEventListener("click",()=>{l.remove(),s({kind:"cancelled"})}),u?.addEventListener("click",()=>{l.remove(),s({kind:"skipped"})}),m?.addEventListener("click",()=>{l.remove(),s({kind:"choose-again"})})})}}function ii(){return typeof requestAnimationFrame!="function"?new Promise(e=>setTimeout(e,0)):new Promise(e=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>e())})})}function ai(e){return new Promise(t=>{let n=_(e,c().maskFailureTitle,`
        <div class="bd-error-message">
          <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
          </svg>
          <span class="bd-error-message__text">${g(c().maskFailureMessage)}</span>
        </div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-primary" data-action="skip">${g(c().continueWithoutScreenshot)}</button>
        </div>
      `,!0),r=n.querySelector(".bd-close"),o=n.querySelector('[data-action="skip"]');r?.addEventListener("click",()=>{n.remove(),t({kind:"cancelled"})}),o?.addEventListener("click",()=>{n.remove(),t({kind:"skipped"})})})}function si(e){return typeof e=="string"?{kind:"ok",dataUrl:e}:{kind:"ok",dataUrl:e.dataUrl,redaction:e.redaction}}function Rn(e,t){let n=e.getBoundingClientRect();if(!Mn(n))return e;let o=Math.max(1,window.innerWidth*window.innerHeight)*on(t.maxViewportAreaMultiplier),i=e,a=e.parentElement;for(;a&&a!==document.body&&a!==document.documentElement;){let s=a.getBoundingClientRect(),l=s.width*s.height;Mn(s)&&l<=o&&li(s,n)&&ci(s,n)&&(i=a),a=a.parentElement}return i}function Mn(e){return e.width>0&&e.height>0}function li(e,t){return e.left<=t.left&&e.top<=t.top&&e.right>=t.right&&e.bottom>=t.bottom}function ci(e,t){let n=e.width>=t.width+160,r=e.height>=t.height+160,o=t.width*t.height,i=e.width*e.height;return n||r||i>=o*4}function An(e){let t=[],n=e.ownerDocument.body,r=e;if(r===n)return qe(r);for(;r&&r!==n;){let o=qe(r);if(r.id){o=`#${ye(r.id)}`,t.unshift(o);break}let i=Dn(r).slice(0,2);i.length&&(o+=`.${i.map(ye).join(".")}`),t.unshift(o),r=r.parentElement}return t.join(" > ")}function In(e){let t=di(e),n=t.map(ui),r=t.map(gt);return mi(n,r,e)}function di(e){let t=[],n=e;for(;n;)t.unshift(n),n=n.parentElement;return t}function ui(e){let t=pi(e);return t.length<=128?t:gt(e)}function pi(e){let t=qe(e);e.id&&(t+=`#${ye(e.id)}`);let n=Dn(e).slice(0,3);return n.length>0&&(t+=`.${n.map(ye).join(".")}`),e.id||(t+=Fn(e)),t}function gt(e){return`${qe(e)}${Fn(e)}`}function Dn(e){return Array.from(e.classList).filter(Boolean)}function qe(e){return ye(e.localName||e.tagName.toLowerCase())}function mi(e,t,n){let r=e.join(" > ");return r.length<=1024?r:zn(e,n)||zn(t,n)||gt(n)}function zn(e,t){for(let n=e.length-1;n>=0;n-=1){let r=e.slice(n).join(" > ");if(!(r.length>1024)&&gi(r,t))return r}return null}function gi(e,t){try{return t.ownerDocument.querySelector(e)===t}catch{return!1}}function Fn(e){let t=bi(e);return t>1||hi(e)?`:nth-of-type(${t})`:""}function bi(e){let t=1,n=e.previousElementSibling;for(;n;)n.tagName===e.tagName&&(t+=1),n=n.previousElementSibling;return t}function hi(e){let t=e.previousElementSibling;for(;t;){if(t.tagName===e.tagName)return!0;t=t.previousElementSibling}for(t=e.nextElementSibling;t;){if(t.tagName===e.tagName)return!0;t=t.nextElementSibling}return!1}function ye(e){return typeof CSS<"u"&&typeof CSS.escape=="function"?CSS.escape(e):fi(e)}function fi(e){let t="";for(let n=0;n<e.length;n+=1){let r=e.charAt(n),o=e.charCodeAt(n),i=n===0,a=n===1,s=e.charCodeAt(0);if(o===0){t+="\uFFFD";continue}if(o>=1&&o<=31||o===127||i&&o>=48&&o<=57||a&&o>=48&&o<=57&&s===45){t+=`\\${o.toString(16)} `;continue}if(i&&o===45&&e.length===1){t+="\\-";continue}if(o>=128||o===45||o===95||o>=48&&o<=57||o>=65&&o<=90||o>=97&&o<=122){t+=r;continue}t+=`\\${r}`}return t}function $n(e,t){let n=K(),r=n&&dn(),o=t?.allowSkip!==!1,i="";return r?i=fe(c().viewportRedactionWarning):se()>0&&(i=fe(c().redactionReviewNote)),new Promise(a=>{let s=n?`<p style="margin: 0 0 12px; padding: 8px 12px; background: var(--bd-bg-secondary, #f5f5f5); border-radius: 6px; font-size: 13px; color: var(--bd-text-secondary);">${r?g(c().pageTooComplexViewportNote):g(c().pageTooComplexElementNote)}</p>`:"",l="";n?r&&(l=`<button class="bd-btn bd-btn-primary" data-action="viewport">${g(c().captureViewport)}</button>`):l=`<button class="bd-btn bd-btn-primary" data-action="capture">${g(c().fullPage)}</button>`;let d=_(e,c().captureScreenshotTitle,`
        <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">${g(c().chooseWhatToCapture)}</p>
        ${s}
        ${i}
        <div class="bd-actions bd-screenshot-actions">
          ${l}
          ${n?"":`<button class="bd-btn bd-btn-secondary" data-action="area">${g(c().selectArea)}</button>`}
          <button class="bd-btn bd-btn-secondary" data-action="element">${g(c().selectElement)}</button>
          ${o?`<button class="bd-btn bd-btn-quiet" data-action="skip">${g(c().skipScreenshot)}</button>`:""}
        </div>
      `),u=d.querySelector(".bd-close"),m=d.querySelector('[data-action="skip"]'),y=d.querySelector('[data-action="element"]'),x=d.querySelector('[data-action="area"]'),v=d.querySelector('[data-action="capture"]'),T=d.querySelector('[data-action="viewport"]');u?.addEventListener("click",()=>{d.remove(),a({kind:"cancel"})}),m?.addEventListener("click",()=>{d.remove(),a({kind:"skip"})}),y?.addEventListener("click",()=>{d.remove(),a({kind:"element"})}),x?.addEventListener("click",()=>{d.remove(),a({kind:"area"})}),v?.addEventListener("click",()=>{d.remove(),a({kind:"capture"})}),T?.addEventListener("click",()=>{d.remove();let k=pt();k.catch(()=>{}),a({kind:"viewport",capture:k})})})}async function Bn(e,t,n,r){if(t.screenshotMode==="auto")return wi(e,t);if(!n)return we();let o=t.screenshotMode==="required";for(;;){let i=await xi(e,t,o);if(i.kind==="returnToForm")return{...we(),returnToForm:!0};if(i.kind==="chooseAgain")continue;if(i.kind==="empty"){if(!o&&vi(i.reason)&&r(),o)continue;return{screenshot:null,elementSelector:i.elementSelector,fullElementSelector:i.fullElementSelector,returnToForm:!1}}let a=await Cn(e,i.screenshot,i.redactionCount,{redactionUnavailable:i.redactionUnavailable,...i.redactionLimitations?{redactionLimitations:!0}:{},...i.elementSelector?{selectedElementCapture:!0}:{}});if(a!=="retake")return a==="cancel"?{...we(),returnToForm:!0}:{screenshot:a,elementSelector:i.elementSelector,fullElementSelector:i.fullElementSelector,returnToForm:!1}}}async function wi(e,t){if(K())return we();let n=await We(e,void 0,t.screenshotScale,{allowChooseAgain:!1});return n.kind==="cancelled"?{...we(),returnToForm:!0}:{screenshot:n.kind==="ok"?n.dataUrl:null,elementSelector:null,fullElementSelector:null,returnToForm:!1}}function vi(e){return e==="explicit-skip"||e==="capture-failure-skip"}async function xi(e,t,n){let r=await $n(e,{allowSkip:!n});switch(r.kind){case"cancel":return{kind:"returnToForm"};case"skip":return Z("explicit-skip");case"viewport":return ki(e,r,n);case"capture":return Ei(e,t,n);case"element":return Si(e,t,n);case"area":return Ti(e,t,n);default:return Ci(r)}}async function ki(e,t,n){let r=await je(e,t.capture,{allowSkip:!n,showLoading:!1});return r.kind==="cancelled"?{kind:"returnToForm"}:r.kind==="choose-again"?{kind:"chooseAgain"}:r.kind==="skipped"?Z("capture-failure-skip"):{kind:"captured",screenshot:r.dataUrl,elementSelector:null,fullElementSelector:null,redactionCount:0,redactionUnavailable:!0,redactionLimitations:!1}}async function Ei(e,t,n){let r=await We(e,void 0,t.screenshotScale,{allowSkip:!n});return r.kind==="cancelled"?{kind:"returnToForm"}:r.kind==="choose-again"?{kind:"chooseAgain"}:r.kind==="skipped"?Z("capture-failure-skip"):{kind:"captured",screenshot:r.dataUrl,elementSelector:null,fullElementSelector:null,redactionCount:r.redaction?.count??0,redactionUnavailable:!1,redactionLimitations:r.redaction?.hasLimitations??!1}}async function Si(e,t,n){let r=await fn(_n(t));if(!r)return Z("selection-cancelled");let o={elementSelector:An(r),fullElementSelector:In(r)},i=Rn(r,{maxViewportAreaMultiplier:t.elementContextMaxArea}),a=await We(e,i,t.screenshotScale,{allowSkip:!n,captureOptions:{highlightElement:r,highlightStyle:{accentColor:t.accentColor,radius:t.radius,borderWidth:t.borderWidth},pixelRatio:1}});return a.kind==="cancelled"?{kind:"returnToForm"}:a.kind==="choose-again"?{kind:"chooseAgain"}:a.kind==="skipped"?Z("capture-failure-skip",o):{kind:"captured",screenshot:a.dataUrl,...o,redactionCount:a.redaction?.count??0,redactionUnavailable:!1,redactionLimitations:a.redaction?.hasLimitations??!1}}async function Ti(e,t,n){let r=await wn(_n(t),{redactionsAvailable:se()>0});if(!r)return Z("selection-cancelled");let o=await Ln(e,r,t.screenshotScale,{allowSkip:!n});return o.kind==="cancelled"?{kind:"returnToForm"}:o.kind==="choose-again"?{kind:"chooseAgain"}:o.kind==="skipped"?Z("capture-failure-skip"):{kind:"captured",screenshot:o.dataUrl,elementSelector:null,fullElementSelector:null,redactionCount:o.redaction?.count??0,redactionUnavailable:!1,redactionLimitations:o.redaction?.hasLimitations??!1}}function _n(e){return{accentColor:e.accentColor,font:e.font,radius:e.radius,borderWidth:e.borderWidth,bgColor:e.bgColor,textColor:e.textColor,borderColor:e.borderColor,theme:e.theme}}function we(){return{screenshot:null,...Nn(),returnToForm:!1}}function Z(e,t=Nn()){return{kind:"empty",reason:e,...t}}function Nn(){return{elementSelector:null,fullElementSelector:null}}function Ci(e){throw new Error(`Unhandled screenshot choice: ${JSON.stringify(e)}`)}function Hn(e,t=window){if(!e)return;let n=t[e];if(typeof n!="function"){console.warn(`[BugDrop] data-auth-token-provider "${e}" must reference a function.`);return}return n}async function bt(e){if(!e)return{};let t=await e();return t?{Authorization:t.startsWith("Bearer ")?t:`Bearer ${t}`}:{}}var Ve=String.raw`(?:"|')?\b(?:password|passwd|pwd|token|api[_-]?key|secret|authorization|auth|cookie)\b(?:"|')?`,Li=new RegExp(String.raw`(${Ve}\s*[:=]\s*)(["'])(?!Bearer\b)(?:\\[\s\S]|(?!\2)[^\\])*?\2`,"gi"),Pi=new RegExp(String.raw`(${Ve}\s*[:=]\s*)(["'])(?!Bearer\b)(?:\\[^\r\n]|(?!\2)[^\\\r\n])*(?=\r?\n|$)`,"gi"),Mi=new RegExp(String.raw`(${Ve}\s*[:=]\s*)(?:\[[^\]\r\n]*\]|\{[^\}\r\n]*\})`,"gi"),Ri=new RegExp(String.raw`(${Ve}\s*[:=]\s*)(?!Bearer\b)[^"',\s}&]+`,"gi"),zi=/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,Ai=/\b[A-Za-z0-9+/_=-]{32,}\b/g;function On(e){return e.replace(zi,"Bearer [redacted]").replace(Mi,"$1[redacted]").replace(Li,"$1$2[redacted]$2").replace(Pi,"$1$2[redacted]").replace(Ri,"$1[redacted]").replace(Ai,"[redacted]")}var Ii=50,Di=1e3,Xe=[],Un=!1;function Wn(){Un||typeof window>"u"||typeof console>"u"||(Un=!0,Ge("log"),Ge("info"),Ge("warn"),Ge("error"),window.addEventListener("error",e=>{ht({level:"error",message:e.message||"Unhandled error",timestamp:new Date().toISOString(),sourceUrl:e.filename||void 0,lineNumber:e.lineno||void 0,columnNumber:e.colno||void 0})}),window.addEventListener("unhandledrejection",e=>{ht({level:"error",message:`Unhandled promise rejection: ${qn(e.reason)}`,timestamp:new Date().toISOString()})}))}function jn(){return Xe.map(e=>({...e}))}function Ge(e){let t=console[e];typeof t=="function"&&(console[e]=(...n)=>{ht({level:e,message:n.map(qn).join(" "),timestamp:new Date().toISOString(),...Fi()}),t.apply(console,n)})}function ht(e){for(Xe.push({...e,message:On(e.message).slice(0,Di)});Xe.length>Ii;)Xe.shift()}function qn(e){if(e instanceof Error)return e.stack||e.message;if(typeof e=="string")return e;try{return JSON.stringify(e)}catch{return String(e)}}function Fi(){let e=new Error().stack;if(!e)return{};for(let t of e.split(`
`).slice(2)){if(t.includes("console-logs"))continue;let n=t.match(/\(?((?:https?:|file:|\/)[^():]+):(\d+):(\d+)\)?$/);if(n)return{sourceUrl:n[1],lineNumber:Number(n[2]),columnNumber:Number(n[3])}}return{}}function Vn(e){let t=!1,n=o=>{Ye(e,o)&&o.preventDefault()},r=o=>{if(!t&&$i(e,o)){if(o.type==="focusin"){o.stopImmediatePropagation();return}if(o.type==="focusout"){t=!0;try{Bi(o)}finally{t=!1}o.stopImmediatePropagation();return}o.stopImmediatePropagation()}};for(let o of["dismissableLayer.pointerDownOutside","dismissableLayer.interactOutside"])document.addEventListener(o,n,!0);window.addEventListener("focusin",r,!0),window.addEventListener("focusout",r,!0)}function Ye(e,t){let n=t.detail?.originalEvent;return(typeof n?.composedPath=="function"?n.composedPath():typeof t.composedPath=="function"?t.composedPath():[]).includes(e)?!0:(n?.target??t.target)===e}function $i(e,t){if(!(t instanceof FocusEvent)||t.type==="focusin")return Ye(e,t);if(t.type!=="focusout")return!1;let n=t.relatedTarget;return(n===e||n instanceof Node&&(e.shadowRoot?.contains(n)??!1))&&!Ye(e,t)}function Bi(e){let t=typeof e.composedPath=="function"?e.composedPath():[];for(let n of t)if(n instanceof HTMLElement&&(n.dispatchEvent(new FocusEvent("focusout",{bubbles:!1,composed:!1,relatedTarget:e instanceof FocusEvent?e.relatedTarget:null})),n===document.body))break}var Te="bugdrop_dismissed",_i="bugdrop_trigger_position_",tr="bugdrop_welcomed_",Ni="bugdrop_complex_screenshot_skipped_",Hi=10080*60*1e3,ke=8,Gn=16,Xn=5,Yn=5*1024*1024,nr=["image/png","image/jpeg","image/gif","image/webp","application/pdf","video/mp4","video/webm","video/quicktime"];function Oi(e){let t=[{name:"Edge",pattern:/Edg(?:e|A|iOS)?\/(\d+[\d.]*)/},{name:"Opera",pattern:/(?:OPR|Opera)\/(\d+[\d.]*)/},{name:"Chrome",pattern:/Chrome\/(\d+[\d.]*)/},{name:"Safari",pattern:/Version\/(\d+[\d.]*).*Safari/},{name:"Firefox",pattern:/Firefox\/(\d+[\d.]*)/}];for(let{name:n,pattern:r}of t){let o=e.match(r);if(o)return{name:n,version:o[1]||"unknown"}}return{name:"Unknown",version:"unknown"}}function Ui(e){let t=[{name:"iOS",pattern:/iPhone OS (\d+[_\d]*)/,versionIndex:1},{name:"iOS",pattern:/iPad.*OS (\d+[_\d]*)/,versionIndex:1},{name:"macOS",pattern:/Mac OS X (\d+[_.\d]*)/,versionIndex:1},{name:"Windows",pattern:/Windows NT (\d+\.\d+)/,versionIndex:1},{name:"Android",pattern:/Android (\d+[\d.]*)/,versionIndex:1},{name:"Linux",pattern:/Linux/,versionIndex:void 0},{name:"Chrome OS",pattern:/CrOS/,versionIndex:void 0}];for(let{name:n,pattern:r,versionIndex:o}of t){let i=e.match(r);if(i){let a=o!==void 0&&i[o]?i[o].replace(/_/g,"."):"";return{name:n,version:a}}}return{name:"Unknown",version:""}}function rr(e){try{let t=new URL(e);return`${t.origin}${t.pathname}`}catch{return e.split("?")[0].split("#")[0]}}function Wi(){let e=navigator.userAgent;return{browser:Oi(e),os:Ui(e),devicePixelRatio:window.devicePixelRatio||1,language:navigator.language||"unknown",url:rr(window.location.href)}}var ji=null,j=null,Ee=null,X=!1,qi=null,ce=!1;function Kn(e){try{let t=localStorage.getItem(Te);if(!t)return!1;if(t==="true")return!0;let n=parseInt(t,10);if(isNaN(n))return!1;if(e===void 0)return!0;let r=e*24*60*60*1e3;return Date.now()-n<r}catch{return!1}}function or(){try{localStorage.setItem(Te,Date.now().toString())}catch{}}function Vi(e){try{return localStorage.getItem(tr+e)!==null}catch{return!1}}function Gi(e){try{localStorage.setItem(tr+e,Date.now().toString())}catch{}}function kt(e){return`${Ni}${e}:${rr(window.location.href)}`}function Xi(e){try{let t=kt(e),n=localStorage.getItem(t);if(!n)return!1;let r=parseInt(n,10);return isNaN(r)||Date.now()-r>Hi?(localStorage.removeItem(t),!1):!0}catch{return!1}}function Yi(e){try{localStorage.setItem(kt(e),Date.now().toString())}catch{}}function Ki(e){try{localStorage.removeItem(kt(e))}catch{}}function Zi(e,t){K()&&(Yi(e.repo),t.includeScreenshot=!1)}function Qi(e){if(!e)return;let t;try{t=JSON.parse(e)}catch(o){let i=o instanceof Error?`: ${o.message}`:"";console.warn(`[BugDrop] Invalid data-category-labels JSON${i}. Using default GitHub labels.`);return}if(!t||typeof t!="object"||Array.isArray(t)){console.warn("[BugDrop] Invalid data-category-labels: expected a JSON object. Using default GitHub labels.");return}let n=["bug","feature","question"],r={};for(let[o,i]of Object.entries(t)){if(!n.includes(o)){console.warn(`[BugDrop] Invalid data-category-labels: unknown category "${o}" (expected ${n.join(", ")}). Ignoring.`);continue}typeof i=="string"||Array.isArray(i)&&i.every(a=>typeof a=="string")?r[o]=i:console.warn(`[BugDrop] Invalid data-category-labels: value for "${o}" must be a string or string array. Ignoring.`)}return Object.keys(r).length>0?r:void 0}var S=document.currentScript||document.querySelector('script[src*="bugdrop"][src*="widget"]');document.currentScript||console.warn("[BugDrop] document.currentScript is null \u2014 do not use async or defer on the BugDrop script tag.");var Se=S?.dataset.theme;Se&&!Ue(Se)&&console.warn(`[BugDrop] Invalid data-theme "${Se}". Expected "light", "dark", or "auto".`);var Ji=Zt(S?.dataset.locale||document.documentElement.lang),Zn=S?.dataset.requireName==="true",Qn=S?.dataset.requireEmail==="true",ve=S?.dataset.position;ve&&ve!=="bottom-right"&&ve!=="bottom-left"&&console.warn(`[BugDrop] Invalid data-position "${ve}". Expected "bottom-right" or "bottom-left".`);var ir=S?.dataset.dismissDuration,ar=Yt(ir);ir&&ar===void 0&&console.warn("[BugDrop] Invalid data-dismiss-duration. Expected a positive whole number of days.");var sr=S?.dataset.screenshotScale,lr=it(sr);sr&&lr===void 0&&console.warn("[BugDrop] Invalid data-screenshot-scale. Expected a non-negative number.");var cr=S?.dataset.elementContextMaxArea,dr=it(cr);cr&&dr===void 0&&console.warn("[BugDrop] Invalid data-element-context-max-area. Expected a non-negative number.");var ur=S?.dataset.shadow,pr=Re(ur);ur&&!pr&&console.warn('[BugDrop] Invalid data-shadow. Expected "soft", "hard", or "none".');var Q=S?.dataset.showIssueLink,mr=Q==="always"||Q==="never"?Q:"public";Q&&Q!=="public"&&Q!==mr&&console.warn(`[BugDrop] Invalid data-show-issue-link "${Q}". Expected "public", "always", or "never".`);var xe={repo:S?.dataset.repo||"",apiUrl:S?.src.replace(/\/widget(?:\.v[\d.]+)?\.js$/,"/api")||"",authTokenProvider:Hn(S?.dataset.authTokenProvider),position:ve==="bottom-left"?"bottom-left":"bottom-right",theme:Ue(Se)?Se:"auto",showName:S?.dataset.showName==="true"||Zn,requireName:Zn,showEmail:S?.dataset.showEmail==="true"||Qn,requireEmail:Qn,buttonDismissible:S?.dataset.buttonDismissible==="true",dismissDuration:ar,showRestore:S?.dataset.showRestore!=="false",showButton:S?.dataset.button!=="false",accentColor:B(S?.dataset.color),iconUrl:pe(S?.dataset.icon),label:S?.dataset.label||void 0,categoryLabels:Qi(S?.dataset.categoryLabels),font:oe(S?.dataset.font),radius:G(S?.dataset.radius)?.toString(),bgColor:B(S?.dataset.bg),textColor:B(S?.dataset.text),borderWidth:G(S?.dataset.borderWidth)?.toString(),borderColor:B(S?.dataset.borderColor),shadow:pr,welcome:(()=>{let e=S?.dataset.welcome;return e==="false"||e==="never"?"never":e==="always"?"always":"once"})(),screenshotMode:(()=>{let e=S?.dataset.screenshot;return e==="auto"||e==="required"?e:(e&&e!=="optional"&&console.warn(`[BugDrop] Invalid data-screenshot "${e}". Expected "optional", "auto", or "required".`),"optional")})(),screenshotScale:lr,elementContextMaxArea:dr,issueLinkVisibility:mr,sendConsoleLogs:S?.dataset.sendConsoleLogs==="true",locale:Ji};Jt(xe.locale);Wn();xe.repo?/^[^/]+\/[^/]+$/.test(xe.repo)?ra(xe):console.error(`[BugDrop] Invalid data-repo format "${xe.repo}". Expected "owner/repo" (e.g., "octocat/hello-world").`):console.error("[BugDrop] Missing data-repo attribute");function ea(e){return e.label!==void 0?e.label:c().triggerLabel}function gr(e,t){if(t.position==="bottom-left"&&e.appendChild(Jn()),t.iconUrl!=="none"){let r=document.createElement("span");if(r.className="bd-trigger-icon",t.iconUrl){let o=document.createElement("img");o.src=t.iconUrl,o.alt="";let i=document.createElement("span");i.textContent="\u{1F41B}",i.style.display="none",o.addEventListener("error",()=>{o.style.display="none",i.style.display=""}),r.append(o,i)}else r.textContent="\u{1F41B}";e.appendChild(r)}let n=document.createElement("span");n.className="bd-trigger-label",n.textContent=ea(t),e.appendChild(n),t.position!=="bottom-left"&&e.appendChild(Jn())}function Jn(){let e=document.createElement("span");return e.className="bd-trigger-drag-handle",e.setAttribute("aria-hidden","true"),e.title=c().dragHandleTitle,e.innerHTML=`
    <svg viewBox="0 0 12 24" aria-hidden="true" focusable="false">
      <circle cx="4" cy="5" r="1.5" fill="currentColor"></circle>
      <circle cx="8" cy="5" r="1.5" fill="currentColor"></circle>
      <circle cx="4" cy="9.5" r="1.5" fill="currentColor"></circle>
      <circle cx="8" cy="9.5" r="1.5" fill="currentColor"></circle>
      <circle cx="4" cy="14" r="1.5" fill="currentColor"></circle>
      <circle cx="8" cy="14" r="1.5" fill="currentColor"></circle>
      <circle cx="4" cy="18.5" r="1.5" fill="currentColor"></circle>
      <circle cx="8" cy="18.5" r="1.5" fill="currentColor"></circle>
    </svg>
  `,e}function br(e,t=!1){let n=["bd-trigger",`bd-trigger--${e.position==="bottom-left"?"left":"right"}`];return t&&n.push("bd-trigger--restoring"),n.join(" ")}function hr(e){return`${_i}${e.repo}_${e.position}`}function ta(e){try{let t=localStorage.getItem(hr(e));if(!t)return null;let n=Number(t);return Number.isFinite(n)?n:null}catch{return null}}function Et(e,t){try{localStorage.setItem(hr(e),String(Math.round(t)))}catch{}}function na(e,t){let n=e.getBoundingClientRect(),r=Math.max(ke,window.innerHeight-n.height-ke);return Math.min(Math.max(t,ke),r)}function Ke(e,t){let n=na(e,t);return e.style.top=`${n}px`,e.style.bottom="auto",n}function fr(e,t){let n=ta(t);n!==null&&(e.classList.add("bd-trigger--positioned"),Ke(e,n))}function vt(e,t){if(!e.style.top)return;let n=e.getBoundingClientRect();if(n.width===0||n.height===0)return;let r=parseFloat(e.style.top);if(!Number.isFinite(r))return;let o=Ke(e,r);Et(t,o)}function yr(e,t){let n=()=>{if(!e.isConnected){r();return}vt(e,t)},r=()=>{window.removeEventListener("resize",n),window.visualViewport?.removeEventListener("resize",n)};window.addEventListener("resize",n),window.visualViewport?.addEventListener("resize",n)}function wr(e,t){let n=e.querySelector(".bd-trigger-drag-handle");if(!n)return;let r=null,o=0,i=0,a=!1,s=()=>{r!==null&&(r=null,e.classList.remove("bd-trigger--dragging"),window.removeEventListener("pointermove",l),window.removeEventListener("pointerup",d),window.removeEventListener("pointercancel",u),a&&(Et(t,e.getBoundingClientRect().top),window.setTimeout(()=>{ce=!1},0)))};function l(m){if(r!==m.pointerId)return;let y=i+m.clientY-o;Math.abs(m.clientY-o)>3&&(a=!0,ce=!0),Ke(e,y)}function d(m){r===m.pointerId&&s()}function u(m){r===m.pointerId&&s()}n.addEventListener("pointerdown",m=>{m.preventDefault(),m.stopPropagation();let y=e.getBoundingClientRect();r=m.pointerId,o=m.clientY,i=y.top,a=!1,e.classList.add("bd-trigger--dragging"),n.setPointerCapture(m.pointerId),window.addEventListener("pointermove",l),window.addEventListener("pointerup",d),window.addEventListener("pointercancel",u)}),n.addEventListener("click",m=>{m.preventDefault(),m.stopPropagation()})}function vr(e,t){e.addEventListener("keydown",n=>{if(n.target!==e||!["ArrowUp","ArrowDown","Home","End"].includes(n.key))return;n.preventDefault(),n.stopPropagation();let r=e.getBoundingClientRect(),o=window.innerHeight-r.height-ke,i=n.key==="ArrowUp"?r.top-Gn:n.key==="ArrowDown"?r.top+Gn:n.key==="Home"?ke:o;e.classList.add("bd-trigger--positioned"),Et(t,Ke(e,i))})}function xt(e,t){let n=document.createElement("div");n.className=t.position==="bottom-left"?"bd-pull-tab bd-pull-tab--left":"bd-pull-tab",n.innerHTML='<span class="bd-pull-tab-chevron">\u2039</span>',n.setAttribute("role","button"),n.setAttribute("tabindex","0"),n.setAttribute("aria-label",c().pullTabAriaLabel);let r=()=>{try{localStorage.removeItem(Te)}catch{}n.remove(),Ee=null,xr(e,t,!0)};return n.addEventListener("click",r),n.addEventListener("keydown",o=>{(o.key==="Enter"||o.key===" ")&&(o.preventDefault(),r())}),e.appendChild(n),Ee=n,n}function ra(e){if(qi=e,!e.buttonDismissible)try{localStorage.removeItem(Te)}catch{}let t=document.createElement("div");t.id="bugdrop-host",t.style.pointerEvents="auto",document.body.appendChild(t);let n=t.attachShadow({mode:"open"});Vn(t);for(let i of["keydown","keypress","keyup"])n.addEventListener(i,a=>{let s=a.target;(s.tagName==="INPUT"||s.tagName==="TEXTAREA")&&a.stopPropagation()});let r=Sn(n,e);if(ji=r,e.showButton&&!(e.buttonDismissible&&Kn(e.dismissDuration))){let i=document.createElement("button");if(i.className=br(e),gr(i,e),i.setAttribute("aria-label",c().triggerAriaLabel),e.buttonDismissible){let a=document.createElement("button");a.className="bd-trigger-close",a.textContent="\xD7",a.setAttribute("aria-label",c().dismissButtonAriaLabel),i.appendChild(a),a.addEventListener("click",s=>{s.stopPropagation(),or(),i.classList.remove("bd-trigger--restoring"),i.classList.add("bd-trigger--dismissing"),i.addEventListener("animationend",()=>{i.remove(),j=null,e.showRestore&&xt(r,e)},{once:!0})})}r.appendChild(i),j=i,fr(i,e),yr(i,e),wr(i,e),vr(i,e),i.addEventListener("click",()=>{if(ce){ce=!1;return}St(r,e)})}else e.showButton&&e.buttonDismissible&&e.showRestore&&Kn(e.dismissDuration)&&xt(r,e);oa(r,e),window.dispatchEvent(new CustomEvent("bugdrop:ready"))}function oa(e,t){let n=t.theme;window.BugDrop={open:()=>{X||St(e,t,{skipWelcome:!0})},close:()=>{if(X){let r=e.querySelector(".bd-modal");r&&r.remove(),X=!1}},hide:()=>{j&&(j.style.display="none")},show:()=>{try{localStorage.removeItem(Te)}catch{}Ee&&(Ee.remove(),Ee=null),j?(j.style.display="",vt(j,t),window.requestAnimationFrame(()=>{j&&vt(j,t)})):t.showButton&&xr(e,t)},isOpen:()=>X,isButtonVisible:()=>j!==null&&j.style.display!=="none",setTheme:r=>{if(!Ue(r)){console.warn(`[BugDrop] Invalid theme ${String(r)}. Expected 'light' | 'dark' | 'auto'.`);return}n=r;let o=Oe(r);be(e,o),he(e,t,o)}},En(r=>{n==="auto"&&(be(e,r),he(e,t,r))})}function xr(e,t,n=!1){let r=document.createElement("button");if(r.className=br(t,n),gr(r,t),r.setAttribute("aria-label",c().triggerAriaLabel),t.buttonDismissible){let o=document.createElement("button");o.className="bd-trigger-close",o.textContent="\xD7",o.setAttribute("aria-label",c().dismissButtonAriaLabel),r.appendChild(o),o.addEventListener("click",i=>{i.stopPropagation(),or(),r.classList.remove("bd-trigger--restoring"),r.classList.add("bd-trigger--dismissing"),r.addEventListener("animationend",()=>{r.remove(),j=null,t.showRestore&&xt(e,t)},{once:!0})})}e.appendChild(r),j=r,fr(r,t),yr(r,t),wr(r,t),vr(r,t),r.addEventListener("click",()=>{if(ce){ce=!1;return}St(e,t)})}async function St(e,t,n){if(X)return;X=!0;let{status:r,appName:o}=await ia(t);if(r==="not_installed"){er(e,t,void 0,o);return}if(r==="unreachable"){er(e,t,c().apiUnreachableMessage,o);return}if(!(n?.skipWelcome||t.welcome==="never"||t.welcome==="once"&&Vi(t.repo))){if(!await aa(e)){X=!1;return}t.welcome==="once"&&Gi(t.repo)}let a=null;for(;;){if(a=await sa(e,t,a),!a){X=!1;return}let s=a,l=await Bn(e,t,s.includeScreenshot,()=>Zi(t,s));if(!l.returnToForm){await Er(e,t,{title:a.title,description:a.description,category:a.category,name:a.name,email:a.email,screenshot:l.screenshot,attachments:a.attachments,elementSelector:l.elementSelector,fullElementSelector:l.fullElementSelector,selectedElementHighlightColor:l.elementSelector?ae(t.accentColor):null,sendConsoleLogs:a.sendConsoleLogs});break}}X=!1}async function ia(e){try{let t=await fetch(`${e.apiUrl}/check/${e.repo}`,{headers:await bt(e.authTokenProvider)});if(!t.ok)return{status:"unreachable"};let n=await t.json();return{status:n.installed===!0?"installed":"not_installed",appName:n.appName}}catch{return{status:"unreachable"}}}function er(e,t,n,r){let i=`https://github.com/apps/${r||(t.apiUrl.includes("bugdrop.neonwatty.workers.dev")?"neonwatty-bugdrop":t.apiUrl.replace(/https?:\/\//,"").replace(/\..*/,""))}/installations/new`,a=n||c().installRequiredMessage,s=n?c().connectionErrorTitle:c().installRequiredTitle,l=_(e,s,`
      <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">${H(a)}</p>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">${g(c().cancel)}</button>
        ${n?"":`<a href="${i}" target="_blank" class="bd-btn bd-btn-primary" style="text-decoration: none;">${g(c().installApp)}</a>`}
      </div>
    `,!0),d=l.querySelector(".bd-close"),u=l.querySelector('[data-action="cancel"]');d?.addEventListener("click",()=>{l.remove(),X=!1}),u?.addEventListener("click",()=>{l.remove(),X=!1})}function aa(e){return new Promise(t=>{let n=_(e,c().welcomeTitle,`
        <div style="text-align: center; padding: 8px 0 16px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">\u{1F4AC}</div>
          <p style="margin: 0 0 12px; color: var(--bd-text-primary); font-size: 1.05rem; font-weight: 500;">
            ${g(c().welcomeHeadline)}
          </p>
          <p style="margin: 0 0 8px; color: var(--bd-text-secondary); font-size: 0.95rem; line-height: 1.6;">
            ${g(c().welcomeBodyLine1)}<br/>
            ${g(c().welcomeBodyLine2)}
          </p>
        </div>
        <div class="bd-actions" style="justify-content: center;">
          <button class="bd-btn bd-btn-primary" data-action="continue">${g(c().getStarted)}</button>
        </div>
      `,!0),r=n.querySelector(".bd-close"),o=n.querySelector('[data-action="continue"]');r?.addEventListener("click",()=>{n.remove(),t(!1)}),o?.addEventListener("click",()=>{n.remove(),t(!0)})})}function sa(e,t,n){return new Promise(r=>{let o=t.showName?`
          <div class="bd-form-group">
            <label class="bd-label" for="name">${g(c().nameLabel)}${t.requireName?" *":""}</label>
            <input type="text" id="name" class="bd-input" ${t.requireName?"required":""} placeholder="${g(c().namePlaceholder)}" value="${H(n?.name||"")}" />
          </div>
        `:"",i=t.showEmail?`
          <div class="bd-form-group">
            <label class="bd-label" for="email">${g(c().emailLabel)}${t.requireEmail?" *":""}</label>
            <input type="email" id="email" class="bd-input" ${t.requireEmail?"required":""} placeholder="${g(c().emailPlaceholder)}" value="${H(n?.email||"")}" />
          </div>
        `:"",a=_(e,c().feedbackFormTitle,`
        <form id="feedback-form">
          <div class="bd-form-group">
            <label class="bd-label">${g(c().categoryLabel)}</label>
            <div class="bd-category-selector" style="display: flex; gap: 8px; margin-top: 6px;">
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="bug" ${yt(n,"bug")} style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">\u{1F41B} ${g(c().categoryBug)}</span>
              </label>
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="feature" ${yt(n,"feature")} style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">\u2728 ${g(c().categoryFeature)}</span>
              </label>
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="question" ${yt(n,"question")} style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">\u2753 ${g(c().categoryQuestion)}</span>
              </label>
            </div>
          </div>
          <div class="bd-form-group">
            <label class="bd-label" for="title">${g(c().titleLabel)} *</label>
            <input type="text" id="title" class="bd-input" required placeholder="${g(c().titlePlaceholder)}" value="${H(n?.title||"")}" />
          </div>
          <div class="bd-form-group">
            <label class="bd-label" for="description">${g(c().descriptionLabel)}</label>
            <textarea id="description" class="bd-textarea" placeholder="${g(c().descriptionPlaceholder)}">${H(n?.description||"")}</textarea>
          </div>
          ${o}
          ${i}
          <div class="bd-evidence-block">
            <div class="bd-evidence-row">
              ${pa(t,n)}
              ${la()}
            </div>
            <input type="file" id="attachment-upload" accept="${nr.join(",")}" multiple class="bd-upload-input" />
            <div id="attachment-list" class="bd-upload-list" aria-live="polite">${n?.attachments.length,""}</div>
            <p id="attachment-error" class="bd-field-error" hidden></p>
            ${ma(t,n)}
          </div>
          <div class="bd-actions">
            <button type="button" class="bd-btn bd-btn-secondary" data-action="cancel">${g(c().cancel)}</button>
            <button type="submit" class="bd-btn bd-btn-primary" id="submit-btn">${t.screenshotMode==="auto"?g(c().submit):g(c().continueButton)}</button>
          </div>
        </form>
      `),s=a.querySelector("#feedback-form"),l=a.querySelector("#name"),d=a.querySelector("#email"),u=a.querySelector("#title"),m=a.querySelector("#description"),y=a.querySelector("#include-screenshot"),x=a.querySelector("#attachment-upload"),v=a.querySelector('[data-action="choose-uploads"]'),T=a.querySelector("#attachment-list"),k=a.querySelector("#attachment-error"),z=a.querySelector("#send-console-logs"),R=a.querySelector(".bd-close"),P=a.querySelector('[data-action="cancel"]'),M=[...n?.attachments??[]],A=()=>{a.remove(),r(null)};R?.addEventListener("click",A),P?.addEventListener("click",A),s.addEventListener("submit",C=>{if(C.preventDefault(),!u.value.trim()){u.classList.add("bd-input--error"),u.focus();return}if(t.requireName&&l&&!l.value.trim()){l.classList.add("bd-input--error"),l.focus();return}if(t.requireEmail&&d&&!d.value.trim()){d.classList.add("bd-input--error"),d.focus();return}let I=a.querySelector('input[name="category"]:checked')?.value||"bug",F=t.screenshotMode==="optional"?y?.checked??!1:!0;t.screenshotMode==="optional"&&F&&Ki(t.repo),a.remove(),r({title:u.value.trim(),description:m.value.trim(),category:I,name:l?.value.trim()||void 0,email:d?.value.trim()||void 0,includeScreenshot:F,attachments:M,sendConsoleLogs:z.checked})}),u.addEventListener("input",()=>u.classList.remove("bd-input--error")),l?.addEventListener("input",()=>l.classList.remove("bd-input--error")),d?.addEventListener("input",()=>d.classList.remove("bd-input--error"));let f=()=>{da(T,M,C=>{M=M.filter((D,I)=>I!==C),f()})};v.addEventListener("click",()=>x.click()),x.addEventListener("change",async()=>{let C=Array.from(x.files??[]);x.value="",k.textContent="",k.hidden=!0;let D=Xn-M.length;if(C.length>D){ft(k,c().uploadTooMany(Xn));return}for(let I of C){let F=ca(I);if(F){ft(k,F);return}}try{let I=await Promise.all(C.map(ua));M=[...M,...I],f()}catch{ft(k,c().uploadReadError)}}),f()})}function la(){return`
    <div class="bd-upload-group">
      <div class="bd-upload-row" aria-label="${g(c().uploadsAriaLabel)}">
        <button type="button" class="bd-btn bd-btn-secondary bd-upload-button" data-action="choose-uploads" aria-label="${g(c().uploadFilesAriaLabel)}">
          <svg class="bd-upload-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M8 11V3" />
            <path d="M4.5 6.5 8 3l3.5 3.5" />
            <path d="M3 12.5h10" />
          </svg>
          ${g(c().uploadButton)}
        </button>
      </div>
    </div>
  `}function ca(e){return nr.includes(e.type)?e.size>Yn?c().uploadTooLarge(kr(Yn)):null:c().uploadUnsupportedType}function ft(e,t){e.textContent=t,e.hidden=!1}function da(e,t,n){e.innerHTML=t.map((r,o)=>`
        <div class="bd-upload-item">
          <span class="bd-upload-item__name">${H(r.name)}</span>
          <span class="bd-upload-item__meta">${kr(r.size)}</span>
          <button type="button" class="bd-upload-remove" data-index="${o}" aria-label="${g(c().removeAttachmentAriaLabel(r.name))}">&times;</button>
        </div>
      `).join(""),e.querySelectorAll(".bd-upload-remove").forEach(r=>{r.addEventListener("click",()=>{let o=Number(r.dataset.index);Number.isInteger(o)&&n(o)})})}function ua(e){return new Promise((t,n)=>{let r=new FileReader;r.addEventListener("load",()=>{if(typeof r.result!="string"){n(new Error("Could not read file."));return}t({name:e.name,type:e.type,size:e.size,dataUrl:r.result})}),r.addEventListener("error",()=>n(new Error("Could not read file."))),r.readAsDataURL(e)})}function kr(e){return e<1024?`${e} B`:e<1024*1024?`${Math.round(e/1024)} KB`:`${Math.round(e/(1024*1024)*10)/10} MB`}function pa(e,t){if(e.screenshotMode==="auto"){let r=se()>0?` ${g(c().screenshotAutoRedactionNote)}`:"";return`
      <p style="margin: 8px 0 0; color: var(--bd-text-secondary); font-size: 0.95rem;">
        ${g(c().screenshotAutoNote)}${r}
      </p>
    `}return e.screenshotMode==="required"?`
      <p style="margin: 8px 0 0; color: var(--bd-text-secondary); font-size: 0.95rem;">
        ${g(c().screenshotRequiredNote)}
      </p>
    `:`
    <div class="bd-screenshot-control">
      <input type="checkbox" id="include-screenshot" ${t?.includeScreenshot??(!K()||!Xi(e.repo))?"checked":""} class="bd-checkbox" />
      <label for="include-screenshot" class="bd-checkbox-label">
        ${g(c().includeScreenshotLabel)}
      </label>
    </div>
  `}function ma(e,t){return`
    <div class="bd-form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
      <input type="checkbox" id="send-console-logs" ${t?.sendConsoleLogs??e.sendConsoleLogs?"checked":""} style="width: 18px; height: 18px; accent-color: var(--bd-primary); cursor: pointer;" />
      <label for="send-console-logs" style="font-size: 0.95rem; color: var(--bd-text-secondary); cursor: pointer; user-select: none;">
        ${g(c().sendConsoleLogsLabel)}
      </label>
    </div>
  `}function yt(e,t){return(e?.category||"bug")===t?"checked":""}async function Er(e,t,n){let r=_(e,c().submittingTitle,`
      <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
        <div class="bd-spinner bd-spinner--lg"></div>
        <p class="bd-loading-text" style="margin-top: 12px;">${g(c().creatingIssue)}</p>
      </div>
    `);try{let o=n.name||n.email?{name:n.name,email:n.email}:void 0,i=Wi(),a=Be(),s=n.sendConsoleLogs?jn():void 0,l=await fetch(`${t.apiUrl}/feedback`,{method:"POST",headers:{"Content-Type":"application/json",...await bt(t.authTokenProvider)},body:JSON.stringify({repo:t.repo,title:n.title,description:n.description,category:n.category,categoryLabels:t.categoryLabels,screenshot:n.screenshot,attachments:n.attachments,consoleLogs:s,submitter:o,metadata:{url:i.url,userAgent:navigator.userAgent,viewport:{width:window.innerWidth,height:window.innerHeight},timestamp:new Date().toISOString(),elementSelector:n.elementSelector,fullElementSelector:n.fullElementSelector,selectedElementHighlightColor:n.selectedElementHighlightColor||void 0,domNodeCount:a,fullPageDisabled:K(),browser:i.browser,os:i.os,devicePixelRatio:i.devicePixelRatio,language:i.language}})});if(r.remove(),l.status===429){let u=l.headers.get("Retry-After"),m=u?Math.ceil(parseInt(u,10)/60):15;wt(e,t,n,c().rateLimited(m));return}let d=await l.json();d.success?await Tn(e,d.issueNumber,d.issueUrl,d.isPublic??!1,t.issueLinkVisibility):wt(e,t,n,d.error||c().submitFailedFallback)}catch{r.remove(),wt(e,t,n,c().networkError)}}function wt(e,t,n,r){let o=_(e,c().submissionFailedTitle,`
      <div class="bd-error-message">
        <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
        </svg>
        <span class="bd-error-message__text">${H(r)}</span>
      </div>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">${g(c().cancel)}</button>
        <button class="bd-btn bd-btn-primary" data-action="retry">${g(c().tryAgain)}</button>
      </div>
    `,!0),i=o.querySelector(".bd-close"),a=o.querySelector('[data-action="cancel"]'),s=o.querySelector('[data-action="retry"]');i?.addEventListener("click",()=>o.remove()),a?.addEventListener("click",()=>o.remove()),s?.addEventListener("click",async()=>{o.remove(),await Er(e,t,n)})}})();
