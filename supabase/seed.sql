insert into public.dl_site_locations (name, description)
values
  ('Accessibility Campsite A', 'Primary accessibility camping area.'),
  ('Accessibility Campsite B', 'Overflow accessibility camping area.'),
  ('Blue Badge Parking', 'Accessible parking and vehicle movement.'),
  ('Accessible Car Park', 'General accessible car park operations.'),
  ('Shuttle Stop', 'Accessible shuttle pick-up.'),
  ('Main Arena Viewing Platform', 'Main arena accessible viewing platform.'),
  ('Accessible Toilets North', 'Northern accessible toilet block.'),
  ('Accessible Toilets South', 'Southern accessible toilet block.'),
  ('Accessible Showers', 'Accessible shower units.'),
  ('Trackway East', 'Eastern trackway route.'),
  ('Trackway West', 'Western trackway route.'),
  ('Gate A', 'Festival gate A.'),
  ('Gate B', 'Festival gate B.'),
  ('Medical Tent', 'Medical support tent.'),
  ('Campsite Welfare', 'Welfare and safeguarding point.'),
  ('Box Office', 'Ticketing and wristband support.')
on conflict do nothing;

insert into public.dl_sources (name, source_type, platform, url, active, approved_for_monitoring, notes)
values
  ('Download Festival Access Facebook group', 'Facebook Group', 'Facebook', 'https://www.facebook.com/groups/downloadfestivalaccess', true, true, 'Approved group URL for authorised visible-page Chrome extension monitoring only. No bot login, hidden scraping, group crawling or profile harvesting.'),
  ('Authorised Chrome monitor', 'Chrome Extension', 'Browser', null, true, true, 'Visible-page monitoring by authorised staff only.'),
  ('Accessibility QR report form', 'Direct QR Report', 'KSS form', '/report', true, true, 'Direct structured reports from accessibility campsite users.'),
  ('Official Download Festival updates', 'Official Update', 'Download Festival', 'https://downloadfestival.co.uk', true, true, 'Public official updates only.'),
  ('Approved RSS and public web', 'RSS', 'Public web', null, true, true, 'Public feeds only.'),
  ('Weather warnings', 'Weather', 'Public weather', null, true, true, 'Public weather warning sources.'),
  ('Reddit approved API source', 'Public API', 'Reddit', null, false, false, 'Enable only after approved API credentials are provided.')
on conflict do nothing;

insert into public.dl_monitored_keywords (keyword, category, severity)
values
  ('wheelchair stuck', 'Mobility access', 'Critical'),
  ('stuck in mud', 'Ground condition', 'Critical'),
  ('cannot get out', 'Mobility access', 'Critical'),
  ('can''t get out', 'Mobility access', 'Critical'),
  ('medical emergency', 'Medical', 'Critical'),
  ('need medic', 'Medical', 'Critical'),
  ('insulin', 'Medical', 'Critical'),
  ('medication fridge', 'Medical', 'Critical'),
  ('fallen', 'Injury', 'Critical'),
  ('injured', 'Injury', 'Critical'),
  ('unsafe', 'Safety', 'Critical'),
  ('vulnerable', 'Safeguarding', 'Critical'),
  ('abandoned', 'Safeguarding', 'Critical'),
  ('missing person', 'Safeguarding', 'Critical'),
  ('safeguarding', 'Safeguarding', 'Critical'),
  ('panic attack', 'Welfare', 'Critical'),
  ('distressed', 'Welfare', 'Critical'),
  ('blocked access', 'Access route', 'Critical'),
  ('no accessible access', 'Access route', 'Critical'),
  ('accessible toilet blocked', 'Accessible toilet', 'High'),
  ('accessible toilet overflowing', 'Accessible toilet', 'High'),
  ('no accessible toilet', 'Accessible toilet', 'High'),
  ('accessible shower broken', 'Accessible shower', 'High'),
  ('blue badge issue', 'Parking', 'High'),
  ('carer pass issue', 'Ticketing', 'High'),
  ('PA wristband issue', 'Ticketing', 'High'),
  ('charging point broken', 'Power', 'High'),
  ('shuttle not arrived', 'Transport', 'High'),
  ('cannot reach campsite', 'Transport', 'High'),
  ('trackway problem', 'Ground condition', 'High'),
  ('ground condition', 'Ground condition', 'High'),
  ('viewing platform issue', 'Viewing platform', 'High'),
  ('queue too long', 'Queue', 'High'),
  ('left waiting', 'Queue', 'High'),
  ('confusing signage', 'Signage', 'Medium'),
  ('information request', 'Information', 'Medium'),
  ('long queue', 'Queue', 'Medium'),
  ('delay', 'Delay', 'Medium'),
  ('staff did not know', 'Staff briefing', 'Medium'),
  ('access route unclear', 'Access route', 'Medium'),
  ('parking confusion', 'Parking', 'Medium'),
  ('campsite facilities', 'Facilities', 'Medium'),
  ('complaint', 'Complaint', 'Medium'),
  ('feedback', 'Feedback', 'Low'),
  ('suggestion', 'Feedback', 'Low'),
  ('general question', 'Information', 'Low'),
  ('security', 'Security', 'Medium'),
  ('fight', 'Security', 'High'),
  ('assault', 'Security', 'High'),
  ('harassment', 'Security', 'High'),
  ('threatening', 'Security', 'High'),
  ('aggressive', 'Security', 'Medium'),
  ('stolen', 'Security', 'Medium'),
  ('theft', 'Security', 'Medium'),
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

-- Create a Chrome extension source token after generating a random token.
-- Keep the plain token only in the extension and your secret store.
--
-- Example:
--   openssl rand -hex 32
--
-- Then replace YOUR_PLAIN_TOKEN_HERE below and run:
--
-- insert into public.dl_source_api_tokens (source_id, label, token_hash)
-- select id, 'Chrome extension production token',
--        encode(digest('YOUR_PLAIN_TOKEN_HERE', 'sha256'), 'hex')
-- from public.dl_sources
-- where name = 'Download Festival Access Facebook group';
