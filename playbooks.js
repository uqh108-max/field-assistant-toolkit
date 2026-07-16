/* ============================================================================
 * Field Assistant — application playbooks (Guide tab content)
 * Framework guidance distilled from the field-playbooks brief (Jul 2026).
 * It narrows the test range per application — it never replaces jar/bench
 * testing. Numeric bands rendered with an EXAMPLE badge are illustrative
 * demo values, not sourced standards.
 * ==========================================================================*/
window.PLAYBOOKS = {
  source: 'Field-playbooks brief, Jul 2026 — application framework for surrogate-led product selection. Guidance to narrow testing, not a sourced standard.',
  rule: 'Use surrogate measurements to narrow the test range — never to eliminate testing.',
  chain: ['Measure', 'Mechanism', 'Product family', 'Dose range', 'Confirm'],
  kit: {
    l1: ['pH', 'Conductivity', 'Temperature', 'Turbidity', 'Alkalinity', 'Accurate sample volume & dosing', 'Repeatable mixing', 'Settling & filtration assessment'],
    l2: [
      { m: 'Potable', t: 'UV254, true colour, residual Al/Fe' },
      { m: 'Municipal wastewater', t: 'COD, filtered COD, TSS, phosphate' },
      { m: 'Sludge', t: 'Solids %, capillary suction time, drainage' },
      { m: 'Oily industrial', t: 'Oil & grease, COD, flotation assessment' },
      { m: 'Metal treatment', t: 'Metals, ORP, acidity / alkalinity' },
      { m: 'Mining', t: 'Solids %, slurry density, settling column, water recovery, filtration' }
    ],
    l3: ['Actual zeta potential', 'Particle-size distribution', 'DOC', 'Detailed mineralogy', 'Metals', 'Charge demand', 'Rheology']
  },
  list: [
    {
      id: 'potable', tag: 'POT', tint: '#E7F1FB', tintText: '#1D5F99',
      name: 'Potable surface water',
      mech: 'Charge neutralisation · adsorption · sweep floc · NOM removal',
      intro: 'The application where surrogate prediction works best. UV254 and colour flag natural-organic-matter demand; turbidity flags particle loading — neither is sufficient alone, so read them together and confirm with a compact jar test.',
      outputs: [
        'Likely optimum coagulant family',
        'Approximate active Al or Fe dose',
        'Whether alkalinity supplementation is likely',
        'Expected post-dose pH',
        'Charge neutralisation vs sweep flocculation lean',
        'Polymer-aid starting range'
      ],
      measure: [
        { n: 'Raw & post-dose pH', why: 'coagulation window and acid demand' },
        { n: 'Alkalinity', why: 'buffering against coagulant pH depression' },
        { n: 'Turbidity', why: 'suspended-particle loading' },
        { n: 'UV254 or filtered true colour', why: 'NOM / organics demand' },
        { n: 'Temperature', why: 'floc formation slows when cold' },
        { n: 'Conductivity', why: 'background ionic strength' },
        { n: 'DOC', why: 'when lab data are available' },
        { n: 'Algae / chlorophyll indicators', why: 'where relevant' }
      ],
      endpointGroups: [{
        title: 'Performance endpoints',
        items: ['Settled turbidity', 'Gravity-filtered turbidity', 'UV254 / true-colour removal', 'Post-dose pH', 'Residual aluminium or iron', 'Floc strength & filtration behaviour']
      }],
      doseBasis: {
        label: 'mg/L on plant flow',
        body: 'Dose as mg/L of product on the treated flow — this is the Concentration mode in the Dosing Calc. Quote active Al or Fe where the comparison is between coagulants.'
      },
      cautions: [
        'Never select a product on settled turbidity alone — visually impressive floc can still give poor filtered-water quality or excessive residual metal.',
        'Jar testing, streaming current, zeta potential and pilot filtration are complementary control methods, not interchangeable ones (per the playbook brief, citing EPA guidance).'
      ],
      products: [{ label: 'Browse coagulants (alum · PACl · ferric)', filter: 'Coagulant' }],
      actions: [{ act: 'guideToJars', label: 'Set up a jar test' }, { act: 'goCalc', label: 'Open dosing calc' }],
      fields: [
        { k: 'turb', label: 'Turbidity', u: 'NTU' },
        { k: 'uv', label: 'UV254', u: '/cm' },
        { k: 'alk', label: 'Alkalinity', u: 'mg/L CaCO₃' },
        { k: 'ph', label: 'Raw pH', u: '' },
        { k: 'cond', label: 'Conductivity', u: 'µS/cm' },
        { k: 'temp', label: 'Temperature', u: '°C' }
      ],
      tdi: true
    },
    {
      id: 'sewage', tag: 'SEW', tint: '#EAF5EC', tintText: '#2C7A45',
      name: 'Municipal wastewater — liquid stream',
      mech: 'Colloid capture · CEPT · phosphorus precipitation',
      intro: 'Chemical demand can come from suspended solids, soluble organics, phosphate, detergents and biological colloids — so measure total AND 0.45 µm filtered fractions. Particulate COD = total COD − filtered COD; coagulation removes particulate and colloidal COD far more readily than truly dissolved COD.',
      measure: [
        { n: 'Total suspended solids', why: 'clarification target' },
        { n: 'Turbidity', why: 'quick surrogate for solids' },
        { n: 'Total COD', why: 'organic load' },
        { n: 'Filtered COD (0.45 µm)', why: 'splits coagulable from dissolved' },
        { n: 'Orthophosphate & total P', why: 'chemical P-removal demand' },
        { n: 'pH & alkalinity', why: 'metal-salt dosing depresses both' },
        { n: 'Conductivity & temperature', why: 'background conditions' },
        { n: 'Volatile suspended solids', why: 'when available' }
      ],
      endpointGroups: [
        { title: 'Clarification (CEPT)', items: ['TSS removal', 'Particulate COD removal', 'Settling velocity', 'Sludge volume', 'Supernatant clarity'] },
        { title: 'Phosphorus removal', items: ['Residual soluble orthophosphate', 'Total phosphorus', 'pH', 'Alkalinity consumption', 'Additional sludge production'] }
      ],
      doseBasis: {
        label: 'mg/L on flow — per objective',
        body: 'Keep separate dose models for: primary influent, secondary-effluent polishing, phosphorus precipitation, wet-weather sewage, and industrially-influenced sewage. One model per site per objective.'
      },
      cautions: [
        'Best phosphorus removal does not sit at the lowest charge — metal salts also remove P by precipitation and adsorption onto metal-hydroxide solids. Judge P removal by residual ortho-P, not floc appearance.'
      ],
      products: [{ label: 'Browse coagulants (ferric · alum · PACl)', filter: 'Coagulant' }],
      actions: [{ act: 'guideToJars', label: 'Set up a jar test' }, { act: 'goCalc', label: 'Open dosing calc' }],
      fields: [
        { k: 'tss', label: 'TSS', u: 'mg/L' },
        { k: 'codt', label: 'Total COD', u: 'mg/L' },
        { k: 'codf', label: 'Filtered COD', u: 'mg/L' },
        { k: 'po4', label: 'Orthophosphate', u: 'mg/L P' },
        { k: 'ph', label: 'pH', u: '' },
        { k: 'alk', label: 'Alkalinity', u: 'mg/L CaCO₃' }
      ]
    },
    {
      id: 'sludge', tag: 'SLG', tint: '#FBF6EC', tintText: '#8A5E17',
      name: 'Sludge conditioning & dewatering',
      mech: 'Charge conditioning + polymer bridging',
      intro: 'Charge alone is an inadequate endpoint here: dewatering polymers work largely by bridging, so molecular weight, charge density, architecture, make-down strength, maturation, mixing energy, dose point, feed solids and upstream ferric/alum all shift performance. A polymer can work well while the sludge still measures negative.',
      measure: [
        { n: 'Feed solids %', why: 'dose must be reported per dry tonne' },
        { n: 'pH & conductivity', why: 'affects polymer charge performance' },
        { n: 'Temperature', why: '' },
        { n: 'Sludge type & volatile solids', why: 'biological vs mineral character' },
        { n: 'Prior ferric / alum / lime additions', why: 'pre-conditioned charge' },
        { n: 'Polymer solution age & strength', why: 'matured vs fresh make-down' }
      ],
      endpointGroups: [{
        title: 'Bench endpoints',
        items: ['Capillary suction time', 'Gravity drainage', 'Filtrate turbidity', 'Floc resistance to shear', 'Cake solids', 'Solids capture', 'Centrate / filtrate quality', 'Polymer kg per dry tonne']
      }],
      doseBasis: {
        label: 'kg active polymer / t dry solids',
        body: 'Report per dry tonne, never as mg/L of sludge — otherwise a change in feed solids masquerades as a change in polymer performance. The Dosing Calc sludge mode works in these units.'
      },
      cautions: [
        'Matured polymer is shear-sensitive — record solution age and make-down strength with every test, or results are not comparable.'
      ],
      products: [{ label: 'Browse cationic flocculants (Zetag · Praestol)', filter: 'Cationic' }],
      actions: [{ act: 'guideToSludgeCalc', label: 'Open sludge dewatering calc' }],
      fields: [
        { k: 'solids', label: 'Feed solids', u: '% DS' },
        { k: 'vs', label: 'Volatile solids', u: '% of DS' },
        { k: 'ph', label: 'pH', u: '' },
        { k: 'cond', label: 'Conductivity', u: 'µS/cm' }
      ]
    },
    {
      id: 'industrial', tag: 'IND', tint: '#F3EFFA', tintText: '#6A4CA0',
      name: 'Industrial wastewater',
      mech: 'Classify the stream first — emulsion breaking · precipitation · colour removal · colloid capture',
      intro: 'Too broad for one model. Classify by the principal treatment problem, then use the matching sub-playbook. The right chemistry is often controlled by something other than particle charge — emulsion stability, metal-hydroxide solubility, or soluble anionic load.',
      measure: [],
      subs: [
        {
          title: 'Oily / emulsified',
          m: 'Free & emulsified oil · oil & grease · turbidity · total & filtered COD · pH · conductivity · surfactant loading · emulsion stability',
          note: 'The challenge is emulsion breaking, not mineral-particle charge. Screen acidic and alkaline pH adjustment, inorganic coagulants and cationic organic coagulants. Judge on oil removal, COD removal, clarity, flotation/settling response, sludge volume and filterability.'
        },
        {
          title: 'Metal finishing & mine water',
          m: 'Dissolved & total metals · pH · ORP · alkalinity or acidity · sulphate · conductivity · complexing agents · TSS',
          note: 'The programme is controlled by hydroxide solubility, oxidation state, precipitation pH and complexation — then flocculation. Raw-water charge matters less than hitting the right precipitation pH.'
        },
        {
          title: 'Food & beverage',
          m: 'Total & filtered COD · TSS · fats, oils & grease · pH · conductivity · phosphate · protein loading',
          note: 'Composition swings with production shift, cleaning cycle and product loss — always record the sampling time alongside the result.'
        },
        {
          title: 'Pulp, paper, textile & coloured effluent',
          m: 'True colour · turbidity · total & filtered COD · pH · conductivity · TSS · anionic charge demand where practical',
          note: 'Strong candidate for a manual charge-demand test — soluble anionic material consumes cationic coagulant without showing up as turbidity.'
        }
      ],
      endpointGroups: [{
        title: 'Judge on',
        items: ['Contaminant removal (oil, metals, colour, COD)', 'Clarification', 'Sludge production', 'Filterability', 'Discharge compliance']
      }],
      doseBasis: {
        label: 'Stream-specific',
        body: 'mg/L on flow for clarification chemistry; pH-adjust chemicals by titration to the target precipitation pH; polymers per dry tonne where sludge is the product.'
      },
      cautions: [
        'No single charge measurement describes success in oily or coloured streams — industrial studies evaluate oil, COD, TSS and turbidity together (per the playbook brief).'
      ],
      products: [{ label: 'Browse coagulants & cationic organics', filter: 'Coagulant' }],
      actions: [{ act: 'guideToJars', label: 'Set up a jar test' }],
      fields: [
        { k: 'ph', label: 'pH', u: '' },
        { k: 'cond', label: 'Conductivity', u: 'µS/cm' },
        { k: 'codt', label: 'Total COD', u: 'mg/L' },
        { k: 'codf', label: 'Filtered COD', u: 'mg/L' },
        { k: 'og', label: 'Oil & grease', u: 'mg/L' },
        { k: 'colour', label: 'True colour', u: 'PtCo' }
      ]
    },
    {
      id: 'mining', tag: 'MIN', tint: '#FBEFE7', tintText: '#B05A28',
      name: 'Mining & mineral processing',
      mech: 'Polymer bridging · thickening · tailings dewatering',
      intro: 'Least emphasis on inferred charge, most on directly measured separation performance. High solids, mixed coarse/ultrafine particles, clay type, saline recycle water, flotation reagents and multivalent ions mean bridging, floc structure, shear history and slurry rheology dominate — high-MW polymer flocculants are central to tailings dewatering (per the brief, citing CSIRO work).',
      measure: [
        { n: 'Weight-% solids & dry mass per sample', why: 'dose basis' },
        { n: 'Particle-size distribution', why: '% below ~20 µm and ~2 µm if available' },
        { n: 'Mineralogy / clay type', why: 'kaolinite, illite, smectite behave differently' },
        { n: 'Slurry density', why: '' },
        { n: 'pH', why: '' },
        { n: 'Conductivity / TDS', why: 'saline process water' },
        { n: 'Calcium & magnesium', why: 'multivalent-ion effects' },
        { n: 'Sulphate', why: '' },
        { n: 'Temperature', why: '' },
        { n: 'Residual flotation / processing reagents', why: 'compete with the flocculant' }
      ],
      endpointGroups: [{
        title: 'Bench endpoints',
        items: ['Initial interface settling rate', 'Overflow / supernatant turbidity', '% water recovered', 'Final sediment / underflow solids', 'Compacted bed height', 'CST or filtration rate', 'Yield stress (underflow handling)', 'Floc response to shear']
      }],
      doseBasis: {
        label: 'g active polymer / t dry solids',
        body: 'Dry-solids basis stops a change in slurry concentration masquerading as a dose change.',
        formulas: ['m(dry solids) = m(slurry) × %solids ÷ 100', 'Dose (g/t) = active polymer (g) ÷ dry solids (t)']
      },
      cautions: [
        'Clay identity matters: salinity can improve settling for one clay system and impair another — kaolinite, bentonite and illite settle differently in saline water (per the brief). Conductivity is not a universal correction factor.',
        'High-pH seawater systems: one tailings study found impaired flocculation above ~pH 10.3 under its tested conditions — a site-specific finding, not a universal limit. Magnesium precipitation changes particle surface area and polymer requirement.'
      ],
      products: [{ label: 'Browse anionic flocculants (Magnafloc · FLOPAM AN)', filter: 'Anionic' }],
      actions: [],
      fields: [
        { k: 'solids', label: 'Solids', u: '% w/w' },
        { k: 'ph', label: 'pH', u: '' },
        { k: 'cond', label: 'Conductivity', u: 'µS/cm' },
        { k: 'ca', label: 'Calcium', u: 'mg/L' },
        { k: 'mg', label: 'Magnesium', u: 'mg/L' },
        { k: 'so4', label: 'Sulphate', u: 'mg/L' }
      ],
      bench: true
    }
  ]
};
