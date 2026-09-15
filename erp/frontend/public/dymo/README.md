# Label assets

## `material-label.dymo`

The operator's own DYMO Connect template, shipped verbatim. It is the label
design — this repo does not generate one.

Every variable field in it is a `DataMappingTextSpan` bound to a `<ColumnName>`,
and the DataMatrix encodes a composite of several of those columns. Printing is
therefore a **data merge**: `src/lib/dymo/labelset.ts` supplies values for those
columns and the template does the rest.

**To change the label design**, edit it in DYMO Connect for Desktop and replace
this file. No code change is needed unless you add or rename a *column*, in
which case update `COLUMN_ALIASES` in `labelset.ts`.

Two things to watch when re-exporting:

- **Strip the byte-order mark.** DYMO Connect writes a BOM; with it present the
  web service rejects the label with HTTP 400 and no useful message.
  `loadLabelTemplate()` strips a leading BOM defensively, but keep the committed
  file clean.
- The columns currently bound are: `UID`, `AT&A#`, `Description`, `MPN`,
  `Manufacturer Part Number`, `MFR`, `PO#`, `PO# ` (note the trailing space),
  `QTY`, `Quantity`, `Packaging`, `Mounting Type`, `Customer`,
  `Customer Reference`.

## No JavaScript framework needed

An earlier design loaded DYMO's `dymo.connect.framework.js`. **DYMO Connect for
Desktop v1.5 does not ship that file** — it is absent from the installation and
the web service does not serve it. We call the service's REST API directly
instead (`src/lib/dymo/service.ts`), which works, and returns
`Access-Control-Allow-Origin: *` so the page may call it over fetch.

## What each workstation needs

DYMO Connect for Desktop, which installs the DYMO Web Service on
`https://127.0.0.1:41951`. That is per-machine, so every bench that prints needs
it — and each bench picks its own printer, which is why the selection lives in
`localStorage` rather than on the user record.

Serving the app over plain HTTP is fine: browsers block HTTPS pages from loading
HTTP subresources, not the reverse, so HTTP → `https://127.0.0.1` is an upgrade
and is permitted. The workstation must trust the local certificate DYMO's
installer sets up.

Without it, `isDymoAvailable()` returns false, the printer controls hide, and the
print dialog explains why. **Receiving works normally** — a print failure never
blocks or reverses a receipt.

## Known limitation: no rendered preview

The web service's `RenderLabel` endpoint returns HTTP 200 with an empty body on
this build, for both the modern `DesktopLabel` and legacy `DieCutLabel` schemas,
with and without a BOM. There is no way to obtain a rendered PNG, so the print
dialog shows the merged field values instead of a picture of the label.
