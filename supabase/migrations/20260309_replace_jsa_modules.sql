-- Replace the 5 original JSA task templates with 14 Peckham Coatings JSA Modules.
-- Soft-delete existing defaults (preserves references in historical JSA reports).
UPDATE jsa_task_templates SET is_active = false
WHERE name IN ('Concrete Prep', 'Epoxy / Urethane Installation', 'Shot Blasting', 'Diamond Grinding', 'Cove Base Installation');

-- Insert 14 new JSA modules
INSERT INTO jsa_task_templates (name, sort_order, default_hazards, default_precautions, default_ppe) VALUES
(
  'General Work (All Job Sites)',
  1,
  'Slips/trips/falls, struck-by hazards, electrical hazards, heat/cold stress, housekeeping hazards',
  'Maintain clean work areas, identify and mark hazards, follow lockout/tagout procedures, stay hydrated, conduct daily site safety briefing',
  'Hard hat, safety glasses, steel-toe boots, high-visibility vest, gloves'
),
(
  'Floor Surface Preparation – Grinding',
  2,
  'Silica dust exposure, noise exposure, rotating equipment hazards, electrical hazards, vibration exposure, tripping on cords',
  'Use wet grinding when possible, maintain dust extraction systems, secure electrical cords, inspect grinding discs for damage, do not exceed RPM ratings',
  'Respirator (P100), hearing protection, safety glasses/face shield, steel-toe boots, anti-vibration gloves, knee pads'
),
(
  'Floor Surface Preparation – Cutting',
  3,
  'Silica dust, flying debris, blade contact/laceration, noise exposure, electrical hazards, tripping on cords',
  'Use proper blade guards, inspect blades before use, ensure dust collection is operational, secure cords, never remove safety guards, cut away from body',
  'Respirator (P100), hearing protection, safety glasses/face shield, steel-toe boots, cut-resistant gloves, knee pads'
),
(
  'Floor Surface Preparation – Scarifying / Shot Blasting',
  4,
  'Flying debris/abrasive media, noise exposure (>85 dB), dust inhalation, electrical hazards, pinch points on equipment',
  'Inspect blast/scarifying equipment before use, ensure dust collection is operational, barricade work area, verify electrical connections, never point blast at personnel',
  'Full face shield, hearing protection (dual protection recommended), respirator, steel-toe boots, heavy-duty gloves, blast suit/coveralls'
),
(
  'Wall / Vertical Surface Preparation',
  5,
  'Falling debris, silica dust, overhead hazards, awkward postures, scaffold/ladder hazards, vibration exposure',
  'Barricade area below work zone, use proper dust collection, inspect scaffolding/ladders before use, take posture breaks, use proper lifting techniques',
  'Hard hat, respirator (P100), safety glasses/face shield, hearing protection, steel-toe boots, gloves'
),
(
  'Lifts (Boom & Scissor)',
  6,
  'Falls from elevation, tip-over, electrocution from overhead lines, crushing/pinch points, falling objects',
  'Inspect lift daily before use, verify outriggers are set on solid ground, maintain safe distance from power lines, do not exceed load capacity, use guardrails and mid-rails',
  'Hard hat, safety harness with lanyard (boom lifts), steel-toe boots, safety glasses, high-visibility vest'
),
(
  'Harness / Tie-Off / Fall Protection',
  7,
  'Falls from elevation, improper harness fit, anchor point failure, swing fall hazard, suspension trauma',
  'Inspect harness and lanyards before each use, verify anchor points rated for 5000 lbs, plan rescue procedures before work begins, minimize free-fall distance, never tie off to conduit or piping',
  'Full-body harness, shock-absorbing lanyard or SRL, hard hat with chin strap, steel-toe boots, safety glasses'
),
(
  'Forklifts',
  8,
  'Tip-over, pedestrian struck-by, falling loads, pinch points, limited visibility, ramp/grade hazards',
  'Only trained/certified operators, perform daily pre-use inspection, wear seatbelt, sound horn at intersections, do not exceed load capacity, keep forks low while traveling',
  'Steel-toe boots, hard hat (if overhead hazards), safety glasses, high-visibility vest'
),
(
  'Coating Installation (Epoxy / Urethane / Urethane Cement / MMA / Polyaspartic)',
  9,
  'Chemical exposure (skin/inhalation), slippery surfaces, flammable vapors, eye irritation, allergic reactions, exothermic reactions',
  'Ensure adequate ventilation, read SDS sheets before handling, no open flames or sparks in work area, use proper mixing ratios, have spill kit available, monitor for vapor buildup',
  'Chemical-resistant gloves, respirator with organic vapor cartridge, safety glasses/splash goggles, chemical-resistant boot covers, long sleeves/coveralls'
),
(
  'Spray Operations',
  10,
  'High-pressure injection injury, chemical inhalation/skin contact, overspray, flammable vapor accumulation, hose whip',
  'Never point spray gun at anyone, ensure proper ventilation/exhaust, inspect hoses and fittings before use, ground equipment to prevent static discharge, maintain exclusion zone',
  'Respirator with organic vapor cartridge, chemical-resistant suit/coveralls, chemical-resistant gloves, face shield/splash goggles, chemical-resistant boot covers'
),
(
  'Line / Pump Safety',
  11,
  'High-pressure line failure, chemical exposure, pinch points, hose whip, injection injury, material spills',
  'Inspect all lines/fittings/connections before pressurizing, relieve pressure before disconnecting, use proper whip checks on hoses, follow lockout/tagout for maintenance, keep spill kit nearby',
  'Chemical-resistant gloves, safety glasses/face shield, steel-toe boots, chemical-resistant coveralls'
),
(
  'Ladder Safety',
  12,
  'Falls from elevation, ladder tip-over, overreaching, electrical contact, improper setup on uneven surfaces',
  'Inspect ladder before use, maintain 3-point contact, set at proper 4:1 angle, do not stand on top two rungs, secure top and base, do not carry heavy items while climbing',
  'Steel-toe boots (non-slip sole), hard hat, safety glasses, gloves'
),
(
  'Roofing Operations – Fall Protection / Edge Safety',
  13,
  'Falls from roof edge, skylight fall-through, fragile surface collapse, wind hazards, heat stress',
  'Install warning lines/guardrails at roof edges, cover or barricade skylights, verify roof structural integrity, monitor weather conditions, establish rescue plan before starting',
  'Full-body harness with SRL or lanyard, hard hat with chin strap, steel-toe boots (non-slip), safety glasses, high-visibility vest'
),
(
  'Roof Coating / Roof Spray / Pump Operations',
  14,
  'Chemical inhalation, slippery coated surfaces, high-pressure equipment hazards, heat stress, falls from elevation, UV exposure',
  'Ensure adequate ventilation, apply non-slip measures on coated areas, inspect spray/pump equipment daily, hydrate frequently, maintain fall protection at all times, use sunscreen',
  'Respirator with organic vapor cartridge, chemical-resistant gloves, chemical-resistant boot covers, safety glasses, hard hat, sunscreen, full-body harness (when near edges)'
);
