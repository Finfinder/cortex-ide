// ─── SSE Parser Tests ───────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { parseSseBuffer } from './sse';

describe('parseSseBuffer', () => {
  it('should parse a single event', () => {
    const buffer = 'event: message.updated\ndata: {"properties":{"info":{"id":"msg-1"}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('message.updated');
    expect(result.events[0].properties).toEqual({ info: { id: 'msg-1' } });
    expect(result.remaining).toBe('');
  });

  it('should parse multiple events', () => {
    const buffer =
      'event: message.updated\ndata: {"properties":{"info":{"id":"msg-1"}}}\n\n' +
      'event: session.idle\ndata: {"properties":{"sessionID":"s1"}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('message.updated');
    expect(result.events[1].type).toBe('session.idle');
    expect(result.remaining).toBe('');
  });

  it('should handle incomplete data (no double newline)', () => {
    const buffer = 'event: message.updated\ndata: {"properties":{"info":';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe(buffer);
  });

  it('should handle partial event with remaining data', () => {
    const buffer =
      'event: message.updated\ndata: {"properties":{"info":{"id":"msg-1"}}}\n\n' +
      'event: message.part.updated\ndata: {"properties":{"part":';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('message.updated');
    expect(result.remaining).toBe('event: message.part.updated\ndata: {"properties":{"part":');
  });

  it('should skip malformed JSON events', () => {
    const buffer = 'event: message.updated\ndata: {invalid json}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe('');
  });

  it('should skip events without event type', () => {
    const buffer = 'data: {"properties":{"info":{"id":"msg-1"}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe('');
  });

  it('should skip events without data', () => {
    const buffer = 'event: message.updated\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe('');
  });

  it('should handle event: without space after colon', () => {
    const buffer = 'event:message.updated\ndata:{"properties":{"info":{"id":"msg-1"}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('message.updated');
  });

  it('should handle data: without space after colon', () => {
    const buffer = 'event: message.updated\ndata:{"properties":{"info":{"id":"msg-1"}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].properties).toEqual({ info: { id: 'msg-1' } });
  });

  it('should handle empty buffer', () => {
    const result = parseSseBuffer('');

    expect(result.events).toHaveLength(0);
    expect(result.remaining).toBe('');
  });

  it('should handle tool call event', () => {
    const buffer =
      'event: message.part.updated\ndata: {"properties":{"part":{"id":"p1","callID":"c1","messageID":"m1","sessionID":"s1","state":{"status":"running","time":{"start":1000},"title":"Searching..."},"tool":"search","type":"tool"}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('message.part.updated');
    const part = result.events[0].properties.part as Record<string, unknown>;
    expect(part.type).toBe('tool');
    expect(part.tool).toBe('search');
  });

  it('should handle session error event', () => {
    const buffer =
      'event: session.error\ndata: {"properties":{"sessionID":"s1","error":"Something went wrong"}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('session.error');
    expect(result.events[0].properties).toEqual({
      sessionID: 's1',
      error: 'Something went wrong',
    });
  });

  it('should handle permission event', () => {
    const buffer =
      'event: permission.updated\ndata: {"properties":{"id":"perm-1","sessionID":"s1","title":"Allow edit?","time":{"created":1000},"metadata":{}}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('permission.updated');
  });

  it('should parse events with type in JSON payload (real OpenCode format)', () => {
    const buffer =
      'data: {"id":"evt_abc123","type":"server.connected","properties":{}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('server.connected');
    expect(result.events[0].properties).toEqual({});
  });

  it('should parse multiple data-only events with type in JSON', () => {
    const buffer =
      'data: {"id":"evt_1","type":"server.connected","properties":{}}\n\n' +
      'data: {"id":"evt_2","type":"session.idle","properties":{"sessionID":"s1"}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('server.connected');
    expect(result.events[1].type).toBe('session.idle');
    expect(result.events[1].properties).toEqual({ sessionID: 's1' });
  });

  it('should prefer event: header over JSON type when both present', () => {
    const buffer =
      'event: custom.event\ndata: {"id":"evt_1","type":"server.connected","properties":{}}\n\n';

    const result = parseSseBuffer(buffer);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('custom.event');
  });
});
