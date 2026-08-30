import { describe, expect, it } from 'vitest';
import { deriveStatus, parseInspectState } from '$lib/server/docker/status';

describe('parseInspectState', () => {
	it('reads State.Status and State.Health.Status', () => {
		expect(
			parseInspectState({ State: { Status: 'running', Health: { Status: 'healthy' } } })
		).toEqual({ status: 'running', health: 'healthy' });
	});

	it('returns undefined health when the container has no healthcheck', () => {
		expect(parseInspectState({ State: { Status: 'exited' } })).toEqual({
			status: 'exited',
			health: undefined
		});
	});

	it('never throws on an unexpected shape', () => {
		for (const bad of [
			null,
			42,
			'x',
			{},
			{ State: null },
			{ State: 'running' },
			{ State: {} }
		]) {
			expect(parseInspectState(bad)).toEqual({ status: undefined, health: undefined });
		}
	});
});

describe('deriveStatus — health wins over state (data-model §4)', () => {
	it.each([
		['healthy', 'up', 'Running'],
		['unhealthy', 'down', 'Not running'],
		['starting', 'unknown', 'Starting']
	])('health=%s → %s', (health, status, label) => {
		expect(deriveStatus({ ok: true, state: { status: 'running', health } })).toEqual({
			status,
			statusLabel: label
		});
	});

	it('is case-insensitive on the health value', () => {
		expect(
			deriveStatus({ ok: true, state: { status: 'running', health: 'HEALTHY' } }).status
		).toBe('up');
	});
});

describe('deriveStatus — no healthcheck falls back to State.Status', () => {
	it('running → up', () => {
		expect(deriveStatus({ ok: true, state: { status: 'running', health: undefined } })).toEqual(
			{
				status: 'up',
				statusLabel: 'Running'
			}
		);
	});

	it.each(['exited', 'dead', 'created', 'paused', 'restarting'])('%s → down', (state) => {
		expect(deriveStatus({ ok: true, state: { status: state, health: undefined } })).toEqual({
			status: 'down',
			statusLabel: 'Not running'
		});
	});

	it('an unrecognised or missing state is unknown, never guessed as up', () => {
		for (const state of [undefined, '', 'weird']) {
			expect(deriveStatus({ ok: true, state: { status: state, health: undefined } })).toEqual(
				{
					status: 'unknown',
					statusLabel: 'Status unavailable'
				}
			);
		}
	});
});

describe('deriveStatus — per-container read failure (FR-030(a), SC-009)', () => {
	it('a failed inspect is unknown / "Status unavailable" — the service stays listed', () => {
		expect(deriveStatus({ ok: false })).toEqual({
			status: 'unknown',
			statusLabel: 'Status unavailable'
		});
	});
});
