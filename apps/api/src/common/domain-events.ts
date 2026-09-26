import { Global, Injectable, Module } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Événements de domaine en mémoire : découple les tâches de leurs effets (synchronisation Google,
 * notifications…) sans dépendance circulaire entre modules.
 */
@Injectable()
export class DomainEvents {
  private readonly emitter = new EventEmitter();

  /** Les tâches d'un foyer ont changé (création, modification, suppression, coche…). */
  householdChanged(householdId: string): void {
    this.emitter.emit('household.changed', householdId);
  }

  onHouseholdChanged(listener: (householdId: string) => void): void {
    this.emitter.on('household.changed', listener);
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
