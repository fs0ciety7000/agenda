import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QuickAddContext } from './quick-add';

// Samedi 26 septembre 2026
const ctx: QuickAddContext = {
  today: '2026-09-26',
  members: [
    { id: 'g', displayName: 'Grace' },
    { id: 'n', displayName: 'Nicolas' },
  ],
  categories: [
    { id: 'c-menage', name: 'Ménage' },
    { id: 'c-courses', name: 'Courses' },
    { id: 'c-maison', name: 'Maison' },
  ],
};
const p = (text: string) => parseQuickAdd(text, ctx);

describe('quick add — exemples du cahier des charges', () => {
  it('« Sortir les poubelles demain 19h »', () => {
    expect(p('Sortir les poubelles demain 19h')).toMatchObject({
      title: 'Sortir les poubelles',
      date: '2026-09-27',
      startMinute: 19 * 60,
    });
  });

  it('« Nettoyer la salle de bain samedi 10h pendant 45 min @nicolas #ménage »', () => {
    const r = p('Nettoyer la salle de bain samedi 10h pendant 45 min @nicolas #ménage');
    expect(r).toMatchObject({
      title: 'Nettoyer la salle de bain',
      date: '2026-09-26', // samedi = aujourd'hui
      startMinute: 600,
      durationMinutes: 45,
      assigneeIds: ['n'],
      categoryId: 'c-menage',
    });
    expect(r.tokens.map((t) => t.kind)).toEqual([
      'date',
      'time',
      'duration',
      'assignee',
      'category',
    ]);
  });
});

describe('quick add — dates', () => {
  it.each([
    ["Appeler maman aujourd'hui", '2026-09-26'],
    ['Appeler maman auj', '2026-09-26'],
    ['Payer le loyer après-demain', '2026-09-28'],
    ['Payer le loyer apres demain', '2026-09-28'],
    ['Courses lundi', '2026-09-28'],
    ['Courses samedi prochain', '2026-10-03'],
    ['Vidange dans 3 jours', '2026-09-29'],
    ['Vidange dans 2 semaines', '2026-10-10'],
    ['Assurance le 12 octobre', '2026-10-12'],
    ['Assurance le 1er octobre', '2026-10-01'],
    ['Impôts 15/06', '2027-06-15'], // passé cette année → l'an prochain
    ['Impôts le 30/09/2026', '2026-09-30'],
    ['Loyer le 5', '2026-10-05'], // le 5 est passé ce mois-ci
    ['Loyer le 30', '2026-09-30'],
    ['Call mom tomorrow', '2026-09-27'],
    ['Groceries next monday', '2026-09-28'],
    ['Taxes in 10 days', '2026-10-06'],
  ])('%s → %s', (text, date) => {
    expect(p(text).date).toBe(date);
  });

  it('ignore une date impossible et la laisse dans le titre', () => {
    expect(p('Anniversaire 31/02')).toEqual({ title: 'Anniversaire 31/02', tokens: [] });
  });

  it('ne garde que la première date', () => {
    expect(p('Réunion demain lundi')).toMatchObject({ date: '2026-09-27', title: 'Réunion lundi' });
  });
});

describe('quick add — heures et durées', () => {
  it.each([
    ['Dentiste 19h30', 1170],
    ['Dentiste à 9h', 540],
    ['Dentiste 08:15', 495],
    ['Dentiste vers 18h', 1080],
    ['Déjeuner midi', 720],
    ['Dentist 7pm', 1140],
    ['Dentist at 12am', 0],
  ])('%s → %i', (text, minute) => {
    expect(p(text).startMinute).toBe(minute);
  });

  it('« ce soir » donne 19:00 par défaut, sauf heure explicite', () => {
    expect(p('Lessive ce soir')).toMatchObject({
      date: '2026-09-26',
      startMinute: 1140,
      title: 'Lessive',
    });
    expect(p('Lessive ce soir 21h')).toMatchObject({ startMinute: 1260 });
  });

  it('distingue durée et heure', () => {
    const r = p('Repassage pendant 1h30');
    expect(r).toMatchObject({ durationMinutes: 90, title: 'Repassage' });
    expect(r.startMinute).toBeUndefined();
    expect(p('Repassage 20h 30 min')).toMatchObject({
      startMinute: 1200,
      durationMinutes: 30,
      title: 'Repassage',
    });
  });

  it('refuse une heure invalide', () => {
    expect(p('Truc 25h')).toEqual({ title: 'Truc 25h', tokens: [] });
  });
});

describe('quick add — responsables, catégorie, priorité', () => {
  it('@nous = les deux membres', () => {
    expect(p('Nettoyer la cuisine 20h @nous').assigneeIds).toEqual(['g', 'n']);
    expect(p('Cuisine @ensemble').assigneeIds).toEqual(['g', 'n']);
  });

  it('préfixe et accents', () => {
    expect(p('Courses @gra #cour').assigneeIds).toEqual(['g']);
    expect(p('Courses @gra #cour').categoryId).toBe('c-courses');
    expect(p('Balai #menage').categoryId).toBe('c-menage');
  });

  it('mention inconnue : laissée dans le titre', () => {
    expect(p('Écrire à @paul')).toEqual({ title: 'Écrire à @paul', tokens: [] });
  });

  it('priorité', () => {
    expect(p('Payer la facture ! demain')).toMatchObject({
      priority: 'HIGH',
      title: 'Payer la facture',
    });
    expect(p('Fuite !! ')).toMatchObject({ priority: 'URGENT', title: 'Fuite' });
    expect(p('Wow!').priority).toBeUndefined();
  });
});

describe('quick add — titre', () => {
  it('nettoie les connecteurs orphelins', () => {
    expect(p('Rendez-vous garage le 12 octobre à 9h').title).toBe('Rendez-vous garage');
  });

  it('texte sans rien de reconnu : inchangé', () => {
    expect(p('  Arroser   les plantes ')).toEqual({ title: 'Arroser les plantes', tokens: [] });
  });

  it('ne reconnaît pas des mots contenant un jour ou une date', () => {
    expect(p('Relire le samedisme').date).toBeUndefined();
    expect(p('Acheter 2h2o').startMinute).toBeUndefined();
  });
});
