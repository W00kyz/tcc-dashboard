-- Removes every record the e2e suite created, in foreign-key order, in one transaction.
--
-- The API has no hard-delete endpoints (history must survive), so the suite cleans up straight
-- in the database. Everything a spec creates carries the "E2E" marker in its name (or an
-- "e2e-" e-mail); records hanging off them (the routes of E2E workers and over E2E points, their
-- stops, executions, impediments, appeals, alerts, the notifications about any of those, audit
-- entries) are found through their foreign keys.
-- Seed data (app.seed) never carries the marker, so it is left alone.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE e2e_buildings ON COMMIT DROP AS
  SELECT id FROM buildings WHERE name LIKE 'E2E %';
CREATE TEMP TABLE e2e_floors ON COMMIT DROP AS
  SELECT id FROM floors WHERE building_id IN (SELECT id FROM e2e_buildings);
CREATE TEMP TABLE e2e_points ON COMMIT DROP AS
  SELECT id FROM service_points
  WHERE floor_id IN (SELECT id FROM e2e_floors) OR name LIKE 'E2E %';
CREATE TEMP TABLE e2e_companies ON COMMIT DROP AS
  SELECT id FROM contractor_companies WHERE name LIKE 'E2E %';
CREATE TEMP TABLE e2e_users ON COMMIT DROP AS
  SELECT id FROM users WHERE name LIKE 'E2E %' OR email LIKE 'e2e-%';
-- A worker signs up in the app with a user of their own: either one marks them.
CREATE TEMP TABLE e2e_workers ON COMMIT DROP AS
  SELECT id FROM field_workers
  WHERE full_name LIKE 'E2E %'
     OR contractor_company_id IN (SELECT id FROM e2e_companies)
     OR user_id IN (SELECT id FROM e2e_users);
CREATE TEMP TABLE e2e_service_types ON COMMIT DROP AS
  SELECT id FROM service_types
  WHERE name LIKE 'E2E %' OR contractor_company_id IN (SELECT id FROM e2e_companies);
-- A seed worker allocated an E2E point holds an E2E route: the route is the test's, so it goes
-- by its points, not by its worker.
CREATE TEMP TABLE e2e_routes ON COMMIT DROP AS
  SELECT id FROM routes
  WHERE field_worker_id IN (SELECT id FROM e2e_workers)
     OR id IN (SELECT route_id FROM route_stops
               WHERE service_point_id IN (SELECT id FROM e2e_points));
CREATE TEMP TABLE e2e_stops ON COMMIT DROP AS
  SELECT id FROM route_stops WHERE route_id IN (SELECT id FROM e2e_routes);
CREATE TEMP TABLE e2e_executions ON COMMIT DROP AS
  SELECT id FROM executions
  WHERE route_stop_id IN (SELECT id FROM e2e_stops)
     OR field_worker_id IN (SELECT id FROM e2e_workers);
CREATE TEMP TABLE e2e_qr_codes ON COMMIT DROP AS
  SELECT id FROM qr_codes WHERE floor_id IN (SELECT id FROM e2e_floors);
CREATE TEMP TABLE e2e_alerts ON COMMIT DROP AS
  SELECT id FROM alerts
  WHERE route_id IN (SELECT id FROM e2e_routes)
     OR route_stop_id IN (SELECT id FROM e2e_stops)
     OR field_worker_id IN (SELECT id FROM e2e_workers);
CREATE TEMP TABLE e2e_impediments ON COMMIT DROP AS
  SELECT id FROM impediments
  WHERE route_id IN (SELECT id FROM e2e_routes)
     OR route_stop_id IN (SELECT id FROM e2e_stops)
     OR reported_by IN (SELECT id FROM e2e_workers);
CREATE TEMP TABLE e2e_appeals ON COMMIT DROP AS
  SELECT id FROM appeals
  WHERE route_stop_id IN (SELECT id FROM e2e_stops)
     OR field_worker_id IN (SELECT id FROM e2e_workers);

-- Audit entries of the records about to go: the trail would otherwise point at ids that no
-- longer exist.
DELETE FROM audit_trail WHERE entity_id IN (
  SELECT id FROM e2e_buildings UNION ALL SELECT id FROM e2e_floors
  UNION ALL SELECT id FROM e2e_points UNION ALL SELECT id FROM e2e_companies
  UNION ALL SELECT id FROM e2e_workers UNION ALL SELECT id FROM e2e_service_types
  UNION ALL SELECT id FROM e2e_users UNION ALL SELECT id FROM e2e_routes
  UNION ALL SELECT id FROM e2e_stops UNION ALL SELECT id FROM e2e_executions
  UNION ALL SELECT id FROM e2e_qr_codes UNION ALL SELECT id FROM e2e_alerts
  UNION ALL SELECT id FROM e2e_impediments UNION ALL SELECT id FROM e2e_appeals
);

-- Notifications point at what they are about only inside the JSON payload, not by foreign key:
-- the route (impediment, alert), the alert, the impediment or the appeal.
DELETE FROM notifications
  WHERE user_id IN (SELECT id FROM e2e_users)
     OR data->>'route_id' IN (SELECT id::text FROM e2e_routes)
     OR data->>'alert_id' IN (SELECT id::text FROM e2e_alerts)
     OR data->>'impediment_id' IN (SELECT id::text FROM e2e_impediments)
     OR data->>'appeal_id' IN (SELECT id::text FROM e2e_appeals);

DELETE FROM evidence_items WHERE execution_id IN (SELECT id FROM e2e_executions);
DELETE FROM qr_scans
  WHERE execution_id IN (SELECT id FROM e2e_executions)
     OR service_point_id IN (SELECT id FROM e2e_points)
     OR qr_code_id IN (SELECT id FROM e2e_qr_codes);
DELETE FROM executions WHERE id IN (SELECT id FROM e2e_executions);
DELETE FROM alerts WHERE id IN (SELECT id FROM e2e_alerts);
DELETE FROM impediments WHERE id IN (SELECT id FROM e2e_impediments);
DELETE FROM appeals WHERE id IN (SELECT id FROM e2e_appeals);
DELETE FROM worker_positions
  WHERE route_id IN (SELECT id FROM e2e_routes)
     OR field_worker_id IN (SELECT id FROM e2e_workers);
DELETE FROM route_stops WHERE id IN (SELECT id FROM e2e_stops);
DELETE FROM routes WHERE id IN (SELECT id FROM e2e_routes);

DELETE FROM qr_codes WHERE id IN (SELECT id FROM e2e_qr_codes);
DELETE FROM service_points WHERE id IN (SELECT id FROM e2e_points);
DELETE FROM rooms WHERE floor_id IN (SELECT id FROM e2e_floors);
DELETE FROM floors WHERE id IN (SELECT id FROM e2e_floors);
DELETE FROM buildings WHERE id IN (SELECT id FROM e2e_buildings);

DELETE FROM field_workers WHERE id IN (SELECT id FROM e2e_workers);

DELETE FROM service_types WHERE id IN (SELECT id FROM e2e_service_types);
-- After its workers and its service types: both point at the company.
DELETE FROM contractor_companies WHERE id IN (SELECT id FROM e2e_companies);

DELETE FROM consent_records WHERE user_id IN (SELECT id FROM e2e_users);
DELETE FROM auth_logs
  WHERE user_id IN (SELECT id FROM e2e_users) OR attempted_email LIKE 'e2e-%';
DELETE FROM users WHERE id IN (SELECT id FROM e2e_users);


-- What the run wrote about seed data, which carries no marker: audit entries of the alert rule the
-- alert-rules spec edits and restores, of the settings the run widens to a service day (see
-- support/serviceDay.ts) and of "Meus dados" reads; and the seed accounts' sign-ins (setup and
-- SeedApi) and consents. The settings and alert-rule rows themselves are put back by cleanup.ts.
-- Only rows inside the run's window (e2e/support/cleanup.ts passes :'run_started_at';
-- "infinity" when no run is on record, which matches nothing).
-- IMPORTANT: someone using the dev stack with a seed account during a run loses those sign-in
-- and consent rows too; the e-mails mirror e2e/support/users.ts.
DELETE FROM audit_trail
  WHERE created_at >= :'run_started_at'::timestamptz
    AND entity_type IN ('alert_rule', 'personal_data', 'system_settings');
DELETE FROM auth_logs
  WHERE created_at >= :'run_started_at'::timestamptz
    AND attempted_email IN ('admin@pu.ufcg.edu.br', 'larissa@pu.ufcg.edu.br', 'joao@empresa.com');
-- The seed accounts' acceptance of a privacy notice newer than their last consent (auth.setup).
DELETE FROM consent_records
  WHERE created_at >= :'run_started_at'::timestamptz
    AND user_id IN (SELECT id FROM users WHERE email IN (
      'admin@pu.ufcg.edu.br', 'larissa@pu.ufcg.edu.br', 'joao@empresa.com'));


-- Records a spec removed through the dashboard (building/point removal, which takes the routes'
-- stops, executions, impediments and appeals with it) are gone before this sweep runs, so the marker cannot find them; their audit entries can: inside the run's window,
-- an entry about a catalog or route record that no longer exists was left by this run.
DELETE FROM audit_trail AS entry
  WHERE entry.created_at >= :'run_started_at'::timestamptz
    AND (
      (entry.entity_type = 'building'
        AND NOT EXISTS (SELECT 1 FROM buildings WHERE id = entry.entity_id))
      OR (entry.entity_type = 'floor'
        AND NOT EXISTS (SELECT 1 FROM floors WHERE id = entry.entity_id))
      OR (entry.entity_type = 'service_point'
        AND NOT EXISTS (SELECT 1 FROM service_points WHERE id = entry.entity_id))
      OR (entry.entity_type = 'route'
        AND NOT EXISTS (SELECT 1 FROM routes WHERE id = entry.entity_id))
      OR (entry.entity_type = 'qr_code'
        AND NOT EXISTS (SELECT 1 FROM qr_codes WHERE id = entry.entity_id))
      OR (entry.entity_type = 'route_stop'
        AND NOT EXISTS (SELECT 1 FROM route_stops WHERE id = entry.entity_id))
      OR (entry.entity_type = 'execution'
        AND NOT EXISTS (SELECT 1 FROM executions WHERE id = entry.entity_id))
      OR (entry.entity_type = 'impediment'
        AND NOT EXISTS (SELECT 1 FROM impediments WHERE id = entry.entity_id))
      OR (entry.entity_type = 'appeal'
        AND NOT EXISTS (SELECT 1 FROM appeals WHERE id = entry.entity_id))
      OR (entry.entity_type = 'alert'
        AND NOT EXISTS (SELECT 1 FROM alerts WHERE id = entry.entity_id))
    );

COMMIT;
