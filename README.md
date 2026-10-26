# RV Spots Japan

Personal park4night-style map of places to stay overnight in Japan: RV parks, Michi-no-Eki,
campsites, motorhome parking, onsen and dump stations, loaded live from OpenStreetMap.

**Open the app:** https://antoinevanla.github.io/rv-spots/

This repo hosts the built app (branch `gh-pages`) and a weekly job (`.github/workflows/update-data.yml`)
that downloads every spot in Japan from OpenStreetMap into `data/osm.json` next to the app, so phones
load one file instead of querying the map servers live. Run it by hand from the Actions tab
("Update spot data" → Run workflow).

Spot data © OpenStreetMap contributors (ODbL).
