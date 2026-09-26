import { Global, Injectable, Module } from '@nestjs/common';
import type { RealtimeTopic } from '@agenda/contracts';
import { EventEmitter } from 'node:events';

/**
 * Événements de domaine en mémoire : découple les tâches de leurs effets (synchronisation Google,
 * notifications, temps réel…) sans dépendance circulaire entre modules. Une seule instance d'API
 * (cf. ThrottlerModule) : pas besoin de Redis pub/sub.
 */
@Injectable()
export class DomainEvents {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  /** Les tâches d'un foyer ont changé (création, modification, suppression, coche…). */
  householdChanged(householdId: string): void {
    this.emitter.emit('household.changed', householdId);
    this.publish(householdId, 'tasks');
  }

  onHouseholdChanged(listener: (householdId: string) => void): void {
    this.emitter.on('household.changed', listener);
  }

  /** Signal temps réel pour les écrans ouverts du foyer (site, app) : « rechargez ce sujet ». */
  publish(householdId: string, topic: RealtimeTopic): void {
    this.emitter.emit('realtime', householdId, topic);
  }

  /** Renvoie la fonction de désabonnement. */
  onRealtime(listener: (householdId: string, topic: RealtimeTopic) => void): () => void {
    this.emitter.on('realtime', listener);
    return () => this.emitter.off('realtime', listener);
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
