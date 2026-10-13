const clone = (value) => JSON.parse(JSON.stringify(value));

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

class AsyncMutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  async run(task) {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = next;
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

/**
 * Deterministic, provider-neutral model of the three authoritative command
 * RPCs. It is a local release gate, not a substitute for Supabase staging load
 * evidence. Each RPC is serialized like the migration's per-match row lock.
 */
export class AuthoritativeCommandGateStore {
  constructor({
    gameId,
    playerAId,
    playerBId,
    canonicalState,
    endsAt = null,
    clock = () => new Date()
  }) {
    this.gameId = gameId;
    this.playerAId = playerAId;
    this.playerBId = playerBId;
    this.canonicalState = clone(canonicalState);
    this.revision = canonicalState.revision;
    this.status = canonicalState.match?.status ?? 'active';
    this.endsAt = endsAt;
    this.clock = clock;
    this.commands = new Map();
    this.outbox = [];
    this.projections = new Map();
    this.mutex = new AsyncMutex();
    this.commitFailuresRemaining = 0;
  }

  get admin() {
    return { rpc: (name, parameters) => this.rpc(name, parameters) };
  }

  failNextCommit(count = 1) {
    this.commitFailuresRemaining = count;
  }

  snapshot() {
    return clone({
      revision: this.revision,
      commandStatuses: [...this.commands.values()].map(({ commandId, status, errorCode }) => ({
        commandId,
        status,
        errorCode: errorCode ?? null
      })),
      outbox: this.outbox.map(({ revision, viewerId }) => ({ revision, viewerId }))
    });
  }

  async rpc(name, parameters) {
    if (name === 'commit_authoritative_match_command_v2' && this.commitFailuresRemaining > 0) {
      this.commitFailuresRemaining -= 1;
      return { data: null, error: { message: 'injected commit interruption' } };
    }

    return this.mutex.run(async () => {
      if (name === 'begin_authoritative_match_command_v2') {
        return { data: this.begin(parameters), error: null };
      }
      if (name === 'commit_authoritative_match_command_v2') {
        return { data: this.commit(parameters), error: null };
      }
      if (name === 'reject_authoritative_match_command_v2') {
        return { data: this.reject(parameters), error: null };
      }
      return { data: null, error: { message: `Unexpected RPC: ${name}` } };
    });
  }

  actorRole(actorId) {
    if (actorId === this.playerAId) return 'playerA';
    if (actorId === this.playerBId) return 'playerB';
    return null;
  }

  begin(parameters) {
    if (parameters.p_game_id !== this.gameId) {
      return { status: 'rejected', errorCode: 'match_not_found' };
    }
    const actorRole = this.actorRole(parameters.p_actor_id);
    if (!actorRole) return { status: 'rejected', errorCode: 'unauthorized_actor' };

    const existing = this.commands.get(parameters.p_command_id);
    if (existing) {
      const conflicts = existing.actorId !== parameters.p_actor_id
        || existing.expectedRevision !== parameters.p_expected_revision
        || existing.type !== parameters.p_command_type
        || !sameJson(existing.payload, parameters.p_payload ?? {});
      if (conflicts) return { status: 'rejected', errorCode: 'command_id_conflict' };
      if (existing.status === 'accepted') return clone(existing.result);
      if (existing.status === 'rejected') {
        return { status: 'rejected', errorCode: existing.errorCode };
      }
      if (this.revision !== parameters.p_expected_revision) {
        existing.status = 'rejected';
        existing.errorCode = 'revision_conflict';
        return {
          status: 'rejected',
          errorCode: 'revision_conflict',
          currentRevision: this.revision
        };
      }
      return this.pending(actorRole);
    }

    let errorCode = null;
    if (this.status !== 'active') errorCode = 'match_not_active';
    else if (this.endsAt && this.clock().getTime() >= new Date(this.endsAt).getTime()) {
      errorCode = 'deadline_expired';
    } else if (this.revision !== parameters.p_expected_revision) errorCode = 'stale_revision';

    const entry = {
      commandId: parameters.p_command_id,
      actorId: parameters.p_actor_id,
      expectedRevision: parameters.p_expected_revision,
      type: parameters.p_command_type,
      payload: clone(parameters.p_payload ?? {}),
      status: errorCode ? 'rejected' : 'pending',
      errorCode
    };
    this.commands.set(entry.commandId, entry);
    if (errorCode) {
      return { status: 'rejected', errorCode, currentRevision: this.revision };
    }
    return this.pending(actorRole);
  }

  pending(actorRole) {
    return {
      status: 'pending',
      revision: this.revision,
      schemaVersion: this.canonicalState.schemaVersion,
      protocolVersion: this.canonicalState.protocolVersion,
      rulesetVersion: this.canonicalState.rulesetVersion,
      actorRole,
      canonicalState: clone(this.canonicalState),
      endsAt: this.endsAt
    };
  }

  commit(parameters) {
    const entry = this.commands.get(parameters.p_command_id);
    if (!entry) return { status: 'rejected', errorCode: 'command_not_started' };
    if (entry.actorId !== parameters.p_actor_id
      || entry.expectedRevision !== parameters.p_expected_revision) {
      return { status: 'rejected', errorCode: 'command_id_conflict' };
    }
    if (entry.status === 'accepted') return clone(entry.result);
    if (entry.status === 'rejected') {
      return { status: 'rejected', errorCode: entry.errorCode };
    }
    if (this.revision !== parameters.p_expected_revision) {
      entry.status = 'rejected';
      entry.errorCode = 'revision_conflict';
      return {
        status: 'rejected',
        errorCode: 'revision_conflict',
        currentRevision: this.revision
      };
    }

    const nextRevision = parameters.p_expected_revision + 1;
    for (const value of [
      parameters.p_new_canonical_state,
      parameters.p_player_a_projection,
      parameters.p_player_b_projection
    ]) {
      if (value?.revision !== nextRevision) {
        return { status: 'rejected', errorCode: 'invalid_commit_revision' };
      }
    }

    this.revision = nextRevision;
    this.canonicalState = clone(parameters.p_new_canonical_state);
    this.status = this.canonicalState.match?.status ?? this.status;
    this.projections.set(this.playerAId, clone(parameters.p_player_a_projection));
    this.projections.set(this.playerBId, clone(parameters.p_player_b_projection));
    this.outbox.push(
      { revision: nextRevision, viewerId: this.playerAId },
      { revision: nextRevision, viewerId: this.playerBId }
    );
    const actorProjection = parameters.p_actor_id === this.playerAId
      ? parameters.p_player_a_projection
      : parameters.p_player_b_projection;
    entry.status = 'accepted';
    entry.result = {
      status: 'accepted',
      revision: nextRevision,
      projection: clone(actorProjection)
    };
    return clone(entry.result);
  }

  reject(parameters) {
    const entry = this.commands.get(parameters.p_command_id);
    if (!entry) return { status: 'rejected', errorCode: 'command_not_started' };
    if (entry.status === 'accepted') return clone(entry.result);
    if (entry.status === 'rejected') {
      return { status: 'rejected', errorCode: entry.errorCode };
    }
    entry.status = 'rejected';
    entry.errorCode = ['rule_rejected', 'invalid_canonical_state'].includes(parameters.p_error_code)
      ? parameters.p_error_code
      : 'evaluation_failed';
    return { status: 'rejected', errorCode: entry.errorCode };
  }
}
