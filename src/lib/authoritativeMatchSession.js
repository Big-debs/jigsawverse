import {
  MATCH_PROTOCOL_VERSION,
  MATCH_STATE_SCHEMA_VERSION,
  createMatchCommand
} from './matchProtocol.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireUuid = (value, name) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID`);
  }
};

const requireTransportMethod = (transport, name) => {
  if (typeof transport?.[name] !== 'function') {
    throw new TypeError(`transport.${name} must be a function`);
  }
};

const defaultCommandIdFactory = () => globalThis.crypto.randomUUID();

/**
 * Reconciles authorized projections independently of any renderer or realtime
 * provider. The transport must provide complete projections, not state deltas.
 */
export class AuthoritativeMatchSession {
  constructor({
    gameId,
    userId,
    transport,
    onProjection = () => {},
    onStatus = () => {},
    commandIdFactory = defaultCommandIdFactory,
    maxSubmitAttempts = 2
  }) {
    requireUuid(gameId, 'gameId');
    requireUuid(userId, 'userId');
    requireTransportMethod(transport, 'fetchProjection');
    requireTransportMethod(transport, 'subscribeProjection');
    requireTransportMethod(transport, 'submitCommand');

    if (typeof commandIdFactory !== 'function') {
      throw new TypeError('commandIdFactory must be a function');
    }
    if (!Number.isInteger(maxSubmitAttempts) || maxSubmitAttempts < 1) {
      throw new TypeError('maxSubmitAttempts must be a positive integer');
    }

    this.gameId = gameId;
    this.userId = userId;
    this.transport = transport;
    this.onProjection = onProjection;
    this.onStatus = onStatus;
    this.commandIdFactory = commandIdFactory;
    this.maxSubmitAttempts = maxSubmitAttempts;

    this.status = 'idle';
    this.revision = -1;
    this.projection = null;
    this.unsubscribe = null;
    this.generation = 0;
    this.connectPromise = null;
    this.recoveryPromise = null;
    this.submitQueue = Promise.resolve();
  }

  setStatus(status, detail = null) {
    this.status = status;
    this.onStatus({ status, detail, revision: this.revision });
  }

  validateProjection(projection) {
    if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
      throw new TypeError('Projection must be an object');
    }
    if (!Number.isInteger(projection.revision) || projection.revision < 0) {
      throw new TypeError('Projection revision must be a non-negative integer');
    }
    if (projection.schemaVersion !== MATCH_STATE_SCHEMA_VERSION) {
      throw new TypeError('Projection uses an unsupported state schema');
    }
    if (projection.protocolVersion !== MATCH_PROTOCOL_VERSION) {
      throw new TypeError('Projection uses an unsupported protocol version');
    }
    if (!Number.isInteger(projection.rulesetVersion) || projection.rulesetVersion < 1) {
      throw new TypeError('Projection ruleset version must be a positive integer');
    }

    const projectedGameId = projection.match?.gameId;
    if (projectedGameId && projectedGameId !== this.gameId) {
      throw new TypeError('Projection belongs to a different match');
    }
  }

  acceptProjection(projection, source) {
    this.validateProjection(projection);
    if (projection.revision <= this.revision) return false;

    this.projection = projection;
    this.revision = projection.revision;
    this.onProjection(projection, { source });
    return true;
  }

  async connect() {
    if (this.connectPromise) return this.connectPromise;
    if (this.status === 'connected') return this.projection;

    const generation = ++this.generation;
    this.setStatus('connecting');

    this.connectPromise = (async () => {
      try {
        const initial = await this.transport.fetchProjection({
          gameId: this.gameId,
          userId: this.userId
        });
        if (generation !== this.generation) return null;
        this.acceptProjection(initial, 'initial_snapshot');

        const subscription = await this.transport.subscribeProjection({
          gameId: this.gameId,
          userId: this.userId,
          onProjection: (projection) => {
            return this.handleIncomingProjection(projection, generation).catch((error) => {
              if (generation === this.generation) this.setStatus('error', error);
            });
          }
        });

        const unsubscribe = typeof subscription === 'function'
          ? subscription
          : subscription?.unsubscribe;
        if (typeof unsubscribe !== 'function') {
          throw new TypeError('Projection subscription must provide an unsubscribe function');
        }
        if (generation !== this.generation) {
          await unsubscribe();
          return null;
        }
        this.unsubscribe = unsubscribe;

        // Confirm after subscribing to close the initial fetch/subscribe race.
        const confirmed = await this.transport.fetchProjection({
          gameId: this.gameId,
          userId: this.userId
        });
        if (generation !== this.generation) return null;
        this.acceptProjection(confirmed, 'confirmed_snapshot');
        this.setStatus('connected');
        return this.projection;
      } catch (error) {
        if (generation === this.generation) this.setStatus('error', error);
        throw error;
      } finally {
        if (generation === this.generation) this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  async recover(reason = 'revision_gap', generation = this.generation) {
    if (this.recoveryPromise) return this.recoveryPromise;
    if (generation !== this.generation) return null;

    this.setStatus('recovering', reason);
    this.recoveryPromise = (async () => {
      try {
        const snapshot = await this.transport.fetchProjection({
          gameId: this.gameId,
          userId: this.userId
        });
        if (generation !== this.generation) return null;
        this.acceptProjection(snapshot, 'recovery_snapshot');
        this.setStatus('connected');
        return this.projection;
      } finally {
        if (generation === this.generation) this.recoveryPromise = null;
      }
    })();

    return this.recoveryPromise;
  }

  async handleIncomingProjection(projection, generation = this.generation) {
    if (generation !== this.generation) return false;
    this.validateProjection(projection);
    if (projection.revision <= this.revision) return false;

    if (this.revision >= 0 && projection.revision > this.revision + 1) {
      await this.recover('revision_gap', generation);
      if (generation !== this.generation || projection.revision <= this.revision) return false;
    }

    return this.acceptProjection(projection, 'realtime');
  }

  submit(type, payload = {}) {
    const operation = this.submitQueue.then(() => this.submitNow(type, payload));
    this.submitQueue = operation.catch(() => {});
    return operation;
  }

  async submitNow(type, payload) {
    if (this.status !== 'connected' || !this.projection) {
      throw new Error('Authoritative match session is not connected');
    }

    const generation = this.generation;
    const command = createMatchCommand({
      gameId: this.gameId,
      commandId: this.commandIdFactory(),
      expectedRevision: this.revision,
      type,
      payload
    });

    this.setStatus('submitting', command.commandId);
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxSubmitAttempts; attempt += 1) {
      try {
        const response = await this.transport.submitCommand(command);
        if (generation !== this.generation) return response;

        if (response?.status === 'accepted' && response.projection) {
          if (response.revision !== response.projection.revision) {
            throw Object.assign(new Error('Command acknowledgement revision mismatch'), {
              retryable: false
            });
          }
          await this.handleIncomingProjection(response.projection, generation);
        } else if (response?.status === 'rejected' && ['stale_revision', 'revision_conflict'].includes(response.errorCode)) {
          await this.recover(response.errorCode, generation);
        }

        this.setStatus('connected');
        return response;
      } catch (error) {
        lastError = error;
        if (error?.retryable === false || attempt === this.maxSubmitAttempts) break;
      }
    }

    if (generation === this.generation) this.setStatus('connected');
    throw lastError;
  }

  async disconnect() {
    this.generation += 1;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = null;
    this.connectPromise = null;
    this.recoveryPromise = null;

    if (unsubscribe) await unsubscribe();
    this.setStatus('disconnected');
  }
}
