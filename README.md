# CoP Map: GitHub Pages / Leaflet migration

This is a **separate, trial replacement** for the existing Streamlit app at https://github.com/ninaharmse777/ocean_cop_map. It is intentionally independent: **do not delete or replace the old repo before testing**.

## What stays the same

- Google Form -> Google Sheets -> existing `syncMapData` Apps Script workflow.
- Existing published `Map_Data` CSV link is preconfigured in `scripts/build_data.py`.
- Only records with `consent_map = Yes` AND `show_on_map = Yes` AND valid coordinates appear.
- `public_contact` appears only where `consent_contact = Yes`.
- Organisation map markers, clickable profiles, organisation-type filter, directory, manual CSV fallback, approximate city-centre coordinates.

## What changes

- Leaflet replaces Folium/Streamlit as the browser interface.
- GitHub Pages replaces Streamlit Cloud hosting: no Streamlit sleep page.
- GitHub Actions fetches approved Sheet CSV every 30 minutes (schedules may be delayed) and deploys updated static `data.json` plus map.
- Google Sheet itself remains the authoritative source; GitHub Actions runs the Python exporter and publishes only consent-approved fields.

## Deploy from GitHub web interface

1. Log into the **same GitHub account** (`ninaharmse777`). Create a **new public repository**, for example `ocean_cop_map_static`. Do not select "Add README" when creating it.
2. Unzip this package onto your computer. Upload the **contents** of the folder, not the outer folder, to the new repo (`Add file > Upload files` and commit to `main`). **Important:** `.github/workflows/deploy.yml` is a hidden dot-folder; some browsers refuse folder upload. If it doesn't appear, use the GitHub web editor: `Add file > Create new file`, enter `.github/workflows/deploy.yml`, and paste the contents of that local file. Upload `docs/` and `scripts/` preserving their paths, too.
3. Open the new repository -> **Settings > Pages** -> **Build and deployment > Source: GitHub Actions**.
4. Go to **Actions**. Open **Update and publish CoP Map** -> **Run workflow** (branch `main`). Allow workflows if prompted.
5. Check the workflow: the "Build approved public data" step should report the number of approved organisations, and the "Publish website" step should complete. If it fails, check the logs. A failed data fetch will **not** publish an empty map.
6. Return to **Settings > Pages** -> click **Visit site**. Likely URL if using suggested name: `https://ninaharmse777.github.io/ocean_cop_map_static/`.
7. Compare your new site against your existing Streamlit map: marker counts, popups, organisation types, directory rows, contact permission, links, and map responsiveness. Test in Notion with a separate embed block, without replacing the working one.
8. Once satisfied, replace only the Notion **embed URL**. Keep the old Streamlit app as a backup initially.

### Why automatic updates work

The workflow `.github/workflows/deploy.yml` runs on pushes to `main`, when manually triggered, and on a recurring 30-minute schedule (`13,43 * * * *` UTC). Each run downloads the **already published** `Map_Data` CSV, filters it, generates `docs/data.json` and deploys the `docs/` folder to GitHub Pages. The `data.json` feed is created during workflow execution, not committed back to the repository, so no tricky GitHub Pages rebuild loop is needed.

### Important limitations

- GitHub Actions' schedule is best-effort: updates can be delayed or skipped. Don't promise a strict 30-minute SLA.
- If Google's published CSV is unavailable, the scheduled workflow fails and the **previous deployed site remains available**. Check GitHub Actions failure logs.
- GitHub Pages sites are public, and generated `data.json` is downloadable by anyone. Review the source Sheet's published CSV privacy and the approved fields carefully. **Even if the map hides unapproved fields, publishing the raw Google CSV might independently expose data.**
- No always-on paid server is needed, but Leaflet JavaScript and basemap tiles still require network access. OpenStreetMap's standard tile service has a usage policy and is best for modest traffic; larger traffic may require a suitable tile provider.
- Organisation types support multi-selection (checkboxes), matching the Streamlit multi-select behaviour.
- The manual CSV upload is purely local to that person's browser; it does not update the public site or Google Sheet.

### File tree

```
.github/workflows/deploy.yml  # automatic updates and publishing
scripts/build_data.py         # download and consent-filter public CSV
docs/index.html               # page structure
docs/style.css                # styling
docs/map.js                   # map, filters, directory, pop-ups
docs/data.json                # generated on GitHub Actions (not in starter)
README.md                     # these instructions
