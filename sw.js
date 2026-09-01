/* ═══════════ DISCIPLINE 90 — OUVERTURE INSTANTANÉE ═══════════
   Le problème : à chaque lancement, l'iPhone redemandait la page au serveur
   avant d'afficher quoi que ce soit (Vercel répond « max-age=0,
   must-revalidate »). Sur un réseau moyen, ça fait une à trois secondes
   d'écran blanc pour un fichier qu'on a déjà.

   Ce fichier sert la copie gardée sur le téléphone IMMÉDIATEMENT, puis va
   chercher la nouvelle version en arrière-plan. Si elle a changé, une pastille
   « nouvelle version » s'affiche dans l'appli : rien ne se recharge dans le dos
   de l'utilisateur au milieu d'une séance.

   Ce qui n'est JAMAIS mis en cache : Supabase et tout le reste. Les données
   passent toujours par le réseau, sinon on afficherait un suivi périmé. */

var CACHE = "d90-coquille-v1";
var COQUILLE = ["/", "/index.html", "/menu.html"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // addAll échoue en bloc si un seul fichier manque : on les prend un par un.
    return Promise.all(COQUILLE.map(function (u) {
      return c.add(u).catch(function () { });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function versionDe(txt) {
  var m = String(txt || "").match(/APP_VERSION\s*=\s*"([^"]*)"/);
  return m ? m[1] : "";
}
function prevenir(v) {
  self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ d90: "maj", version: v }); });
  });
}

self.addEventListener("fetch", function (e) {
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  var estCoquille = (u.origin === self.location.origin) &&
    (u.pathname === "/" || /\.html$/.test(u.pathname));
  if (e.request.method !== "GET" || !estCoquille) return;   // API et Supabase : réseau direct

  // La clé ignore le ?client=… : c'est le même fichier pour tout le monde.
  var cle = new Request(u.origin + u.pathname);

  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(cle).then(function (garde) {
      // On duplique la copie locale AVANT de la rendre : une fois servie au
      // navigateur, son contenu est consommé et devient illisible pour la
      // comparaison de version.
      var pourComparer = garde ? garde.clone() : null;
      var reseau = fetch(e.request).then(function (r) {
        if (!r || !r.ok) return r;
        var copie = r.clone();
        copie.text().then(function (neuf) {
          c.put(cle, new Response(neuf, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          }));
          if (pourComparer) pourComparer.text().then(function (vieux) {
            var vn = versionDe(neuf);
            if (vn && vn !== versionDe(vieux)) prevenir(vn);
          });
        }).catch(function () { });
        return r;
      }).catch(function () { return null; });

      // On rend la copie locale tout de suite ; le réseau travaille derrière.
      return garde || reseau.then(function (r) { return r || fetch(e.request); });
    });
  }));
});
