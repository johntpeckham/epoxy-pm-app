-- Add 'jsa_report' to the post_type CHECK constraint on feed_posts
alter table feed_posts drop constraint if exists feed_posts_post_type_check;
alter table feed_posts add constraint feed_posts_post_type_check
  check (post_type in ('text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report'));

-- Create jsa_task_templates table
create table if not exists jsa_task_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sort_order integer default 0,
  default_hazards text,
  default_precautions text,
  default_ppe text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS policies
alter table jsa_task_templates enable row level security;

create policy "Authenticated users can view task templates"
  on jsa_task_templates for select
  to authenticated
  using (true);

create policy "Authenticated users can insert task templates"
  on jsa_task_templates for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update task templates"
  on jsa_task_templates for update
  to authenticated
  using (true);

create policy "Authenticated users can delete task templates"
  on jsa_task_templates for delete
  to authenticated
  using (true);

-- Seed default task templates
insert into jsa_task_templates (name, sort_order, default_hazards, default_precautions, default_ppe) values
(
  'Concrete Prep',
  1,
  'Silica dust exposure, flying debris, noise hazards, tripping hazards from hoses/cords, hand-arm vibration',
  'Use dust collection systems, maintain proper ventilation, keep work area clear of debris, inspect equipment before use, take regular breaks',
  'Respirator (N95 or P100), safety glasses/goggles, hearing protection, steel-toe boots, gloves, high-visibility vest'
),
(
  'Epoxy / Urethane Installation',
  2,
  'Chemical exposure (skin/inhalation), slippery surfaces, flammable vapors, eye irritation, allergic reactions',
  'Ensure adequate ventilation, read SDS sheets before handling, no open flames or sparks in work area, use proper mixing ratios, have spill kit available',
  'Chemical-resistant gloves, respirator with organic vapor cartridge, safety glasses/splash goggles, chemical-resistant boot covers, long sleeves/coveralls'
),
(
  'Shot Blasting',
  3,
  'Flying debris/abrasive media, noise exposure (>85 dB), dust inhalation, electrical hazards, pinch points on equipment',
  'Inspect blast equipment before use, ensure dust collection is operational, barricade work area, verify electrical connections, never point blast at personnel',
  'Full face shield, hearing protection (dual protection recommended), respirator, steel-toe boots, heavy-duty gloves, blast suit/coveralls'
),
(
  'Diamond Grinding',
  4,
  'Silica dust, noise exposure, rotating equipment hazards, electrical hazards, vibration exposure, tripping on cords',
  'Use wet grinding when possible, maintain dust extraction systems, secure electrical cords, inspect grinding discs for damage, do not exceed RPM ratings',
  'Respirator (P100), hearing protection, safety glasses/face shield, steel-toe boots, anti-vibration gloves, knee pads'
),
(
  'Cove Base Installation',
  5,
  'Chemical exposure from adhesives, sharp tools/utility knives, awkward postures (kneeling/bending), eye irritation from vapors',
  'Ensure ventilation in work area, use sharp blades and cut away from body, take posture breaks, keep adhesives sealed when not in use, clean up spills immediately',
  'Chemical-resistant gloves, safety glasses, knee pads, respirator if in enclosed area, steel-toe boots'
);
