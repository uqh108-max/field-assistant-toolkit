# Field Assistant — Treatment Toolkit

A free, offline-capable water-treatment field-dosing web app. Open it on your phone,
**Add to Home Screen**, and it runs like a native app with no signal.

## Screens

- **Products** — searchable library of flocculants & coagulants with data sheets, typical dose
  windows and make-up guidance. Each value is badged **TDS** (from a supplier data sheet),
  **TYPICAL** (regulatory/industry range) or **EXAMPLE**, and carries its source. Add your own.
- **Dosing Calc** — dose × flow → neat product mass, made-up solution feed rate (L/h), pump
  % stroke, batch make-up and dilution ratio, plus a field-calibration catch-test. Two modes:
  concentration (mg/L on flow) and sludge dewatering (kg/t dry solids, with sludge density).
- **Jar Testing** — dose a jar series, log pH / NTU / floc, mark the winner and send the
  equivalent full-scale dose to the calculator; save tests to history.
- **Dosing Pumps** — real metering pumps with max flow, max pressure and control. Add your own.
- **Clients** — save a site's flow / product / dose / solution setup and recall it in one tap.

Everything you save (clients, pumps, products, jar tests) stays **on your device** in the
browser — nothing is uploaded.

## Data & method

The product and pump library is built entirely from **publicly available** sources, each cited
per record:

- Manufacturer product data sheets (Solenis Zetag/Praestol, BASF/Solenis Magnafloc; and metering
  pumps from Grundfos, ProMinent, Pulsafeeder, LMI, SEKO, Iwaki, Blue-White, EMEC, Stenner,
  Watson-Marlow, Verderflex).
- The **NHMRC Australian Drinking Water Guidelines** for inorganic coagulant strengths, densities
  and typical dose ranges (PAC, ACH, ferric chloride, alum, sodium aluminate).

Nothing in the library is invented — where a data sheet gives no fixed dose, the app says so and
shows a typical starting window to confirm by jar test.

Every dosing formula was independently re-derived and unit-checked. Key assumptions are stated in
the calculator: dose is **as-supplied** (divide by active fraction if quoted active-basis),
solution strength is **% w/v**, sludge dry-solids is **% w/w on wet mass**, and pump % stroke
assumes capacity at operating back-pressure with roughly linear delivery — always confirm with the
catch-test. Always verify against the current supplier data sheet before dosing.

## Run locally

Static files — serve over http (service workers don't run on `file://`):

```
python -m http.server 5177
# → http://localhost:5177
```

## Disclaimer

Provided as a field aid. Doses and specifications are indicative and must be confirmed against
the current supplier data sheet and site conditions (jar/plant trials). No warranty is given.
