insert into public.dl_monitored_keywords (keyword, category, severity)
values
  ('access team', 'KSS / external', 'Medium'),
  ('guest services', 'KSS / external', 'Medium'),
  ('steward', 'KSS / external', 'Medium'),
  ('box office', 'KSS / external', 'Medium'),
  ('essential companion', 'Access admin', 'Low'),
  ('companion ticket', 'Access admin', 'Low'),
  ('access package', 'Access admin', 'Low'),
  ('access application', 'Access admin', 'Low'),
  ('access carpark', 'Travel / parking', 'Low'),
  ('access car park', 'Travel / parking', 'Low'),
  ('drop off', 'Travel / parking', 'Low'),
  ('pick up', 'Travel / parking', 'Low'),
  ('car park', 'Travel / parking', 'Low'),
  ('access camp', 'Campsite', 'Low'),
  ('camping in access', 'Campsite', 'Low'),
  ('packing list', 'Information', 'Low')
on conflict do nothing;
