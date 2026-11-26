# Split step B — deploy marker — review note (2026-11-26)

Adds `commons/build.txt`, a plain-text file naming the repo and Cloudflare project that serve commons.ae. The old Pages project (`commons`, linked to zgauba.github.io) has no such file and answers 404, so after the domain move `curl https://commons.ae/build.txt` returning this text proves contract row 1 (commons.ae is served from this repo).

Not linked from any page; no script, no personal data, nothing secret. Checked: `curl https://commons-app-cp6.pages.dev/build.txt` after merge.

Disposition: no reviewer agent (static text file, no app logic).
