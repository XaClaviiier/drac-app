import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../src/lib/workOrderTimelineHistory.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const { workOrderDay, overtimeSessions, operatingMilliseconds, WORKSHOP_HOURS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const time = (day, clock) => `2026-11-${String(day).padStart(2, '0')}T${clock}:00+08:00`;
const log = (day, clock, from, to, reason = '') => ({ from, to, at: time(day, clock), reason });
const wo = overrides => ({ id: 'W1', date: '2026-11-01', transactionTime: '08:00', status: 'Proses', statusLog: [], ...overrides });
const view = (order, day, now = new Date(time(9, '12:00'))) => workOrderDay(order, `2026-11-${String(day).padStart(2,'0')}`, now);
const HOUR = 3600000;

test('Lost Sales on day 1 reopens on day 5 and remains visible until completion, preserving history', () => {
  const order = wo({ status: 'Selesai', statusLog: [log(1, '10:00', 'Register', 'Closed'), log(5, '09:00', 'Closed', 'Proses'), log(7, '10:00', 'Proses', 'Selesai')] });
  const original = JSON.stringify(order);
  assert.equal(view(order, 1).stage, 'lost');
  for (const day of [2, 3, 4, 8, 9]) assert.equal(view(order, day).visible, false, `day ${day}`);
  for (const day of [5, 6]) { assert.equal(view(order, day).visible, true); assert.equal(view(order, day).stage, 'working'); }
  assert.equal(view(order, 6).visitDay, 2);
  assert.equal(view(order, 6).workingMs / HOUR, 18);
  assert.equal(view(order, 7).stage, 'done');
  assert.equal(view(order, 7).workingMs / HOUR, 20);
  assert.equal(JSON.stringify(order), original);
});

test('unfinished work carries forward and pauses overnight without resetting on progress heartbeat', () => {
  const order = wo({ statusLog: [log(1, '09:00', 'Register', 'Proses'), log(2, '10:00', 'Proses', 'Proses', '[WO_TIMELINE_STAGE:working] Progress')] });
  const result = view(order, 3, new Date(time(3, '09:00')));
  assert.equal(result.visitDay, 3);
  assert.equal(result.workingMs / HOUR, 19);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].duration / HOUR, 1);
  assert.equal(view(order, 2, new Date(time(2, '23:00'))).workingMs / HOUR, 18);
});

test('parts and approval count as visit presence but not working time; completed visits can reopen', () => {
  const order = wo({ statusLog: [log(1, '09:00', 'Register', 'Proses'), log(1, '10:00', 'Proses', 'Proses', '[WO_TIMELINE_STAGE:parts]'), log(3, '10:00', 'Proses', 'Proses', '[WO_TIMELINE_STAGE:working]'), log(3, '11:00', 'Proses', 'Selesai'), log(5, '09:00', 'Selesai', 'Proses')] });
  assert.equal(view(order, 2).stage, 'parts');
  assert.equal(view(order, 2).workingMs / HOUR, 1);
  assert.equal(view(order, 2).presenceMs / HOUR, 19);
  assert.equal(view(order, 4).visible, false);
  assert.equal(view(order, 5).visitDay, 1);
  assert.equal(view(order, 5).workingMs / HOUR, 8.5);
});

test('explicit Over Time adds only hours outside normal schedule and stops at completion or waiting', () => {
  const logs = [log(1, '08:00', 'Register', 'Proses'), log(1, '17:30', 'Proses', 'Proses', '[WO_OVERTIME:start]'), log(1, '20:00', 'Proses', 'Proses', '[WO_OVERTIME:stop]')];
  const result = view(wo({ statusLog: logs }), 1, new Date(time(1, '23:00')));
  assert.equal(result.workingMs / HOUR, 9.5);
  assert.equal(result.overtimeMs / HOUR, 2.5);
  assert.equal(result.overtimeActive, false);
  for (const stop of [log(1, '19:00', 'Proses', 'Selesai'), log(1, '19:00', 'Proses', 'Proses', '[WO_TIMELINE_STAGE:parts]')]) {
    const r = view(wo({ statusLog: [...logs.slice(0,2), stop] }), 1, new Date(time(1, '23:00')));
    assert.equal(r.overtimeMs / HOUR, 1.5);
    assert.equal(r.overtimeActive, false);
  }
});

test('Over Time spans midnight, expires next 08:00, and never carries into another night', () => {
  const order = wo({ statusLog: [log(1, '08:00', 'Register', 'Proses'), log(1, '22:00', 'Proses', 'Proses', '[WO_OVERTIME:start]')] });
  assert.equal(view(order, 2, new Date(time(2, '01:00'))).overtimeMs / HOUR, 3);
  assert.equal(overtimeSessions(order, new Date(time(2, '08:00'))).active, false);
  assert.equal(view(order, 3, new Date(time(3, '23:00'))).overtimeMs / HOUR, 10);
});

test('midnight transitions belong to the next day, and future dates do not show rows', () => {
  const order = wo({ status: 'Selesai', statusLog: [log(1, '09:00', 'Register', 'Proses'), log(2, '00:00', 'Proses', 'Selesai')] });
  assert.equal(view(order, 1).stage, 'working');
  assert.equal(view(order, 2).stage, 'done');
  assert.equal(view(order, 10).visible, false);
});

test('legacy completed rows with missing final audit do not remain active forever', () => {
  const order = wo({ status: 'Selesai', updatedAt: time(2, '11:00'), statusLog: [log(1,'09:00','Register','Proses')] });
  assert.equal(view(order, 1).stage, 'done');
  assert.equal(view(order, 1).approximate, true);
  assert.equal(view(order, 2).visible, false);
  assert.equal(view(order, 3).visible, false);
});

test('legacy completed rows updated by later administration stay on their transaction day', () => {
  const order = wo({ status: 'Selesai', updatedAt: time(9, '11:00'), statusLog: [] });
  assert.equal(view(order, 1).stage, 'done');
  assert.equal(view(order, 9).visible, false);
});

test('backdated WO entered today does not appear on the entry day', () => {
  const order = wo({
    date: '2026-11-01',
    createdAt: time(9, '10:00'),
    updatedAt: time(9, '10:05'),
    status: 'Selesai',
    statusLog: [log(9, '10:00', 'Register', 'Register'), log(9, '10:04', 'Register', 'Selesai')],
  });
  assert.equal(view(order, 9).visible, false);
  assert.equal(view(order, 1).stage, 'done');
});

test('operating time supports closed days, holidays, and breaks without depending on computer timezone', () => {
  const start = new Date(time(1,'08:00')).getTime(), end = new Date(time(3,'17:30')).getTime();
  assert.equal(operatingMilliseconds(start, end, WORKSHOP_HOURS) / HOUR, 28.5);
  const schedule = { ...WORKSHOP_HOURS, days: [1,2,3,4,5,6], holidays: ['2026-11-02'], breakStart:'12:00', breakEnd:'13:00' };
  assert.equal(operatingMilliseconds(start, end, schedule) / HOUR, 8.5);
});

test('PHP Over Time transitions validate hours and state, audit the actor, and are idempotent', () => {
  const result = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['tests/fixtures/work-order-overtime.php'], { encoding:'utf8' }));
  assert.deepEqual(result, { normalRejected:true, waitingRejected:true, completedRejected:true, active:true, nextMorning:false, oneStart:1, oneStop:2, actor:'U1', ended:false });
});
