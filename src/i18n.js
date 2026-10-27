/* English / French for the newer screens (People, profiles, messages, follow-ups, reports).
   The language is remembered per device; the EN | FR switch sits in the header. */
import { ui } from './state.js';

const D = {
  en: {
    // people list
    people: 'People', everyone: 'Everyone', servingTeam: 'Serving team', teamsPositions: 'Teams & positions',
    peopleSub: '{n} people in the church directory', search: 'Search by name, phone or email',
    category: 'Category', allCategories: 'All categories', language: 'Language', anyLanguage: 'Any language',
    service: 'Service', anyService: 'Any service', english: 'English', french: 'French', both: 'Both',
    attendedEn: 'Comes to English', attendedFr: 'Comes to French',
    lastAttended: 'Last attended', anyTime: 'Any time', within2w: 'In the last 2 weeks', within1m: 'In the last month', within3m: 'In the last 3 months',
    notIn1m: 'Not in the last month', notIn3m: 'Not in the last 3 months', never: 'Never checked in',
    phone: 'Phone', email: 'Email', hasPhone: 'Has a phone', noPhone: 'No phone', hasEmail: 'Has an email', noEmail: 'No email', any: 'Any',
    clear: 'Clear filters', savedFilters: 'Saved filters', saveFilter: 'Save filter', filterName: 'Name this filter', shareFilter: 'Share with the serving team',
    deleteFilter: 'Delete', mine: 'Mine', shared: 'Shared',
    shown: '{n} shown', selected: '{n} selected', selectAll: 'Select all shown', clearSelection: 'Clear selection',
    exportCsv: 'Export CSV', setCategory: 'Set category…', addPerson: 'Add person', categories: 'Categories',
    noMatch: 'Nobody matches these filters.', noPeople: 'No people yet. Import them from Elvanto on Check-in, or add someone.',
    lastSeen: 'Last here {d}', neverSeen: 'Not checked in yet', family: 'Family',
    // profile
    back: 'People', details: 'Details', edit: 'Edit', firstName: 'First name', lastName: 'Last name', gender: 'Gender', male: 'Male', female: 'Female',
    birthday: 'Birthday', age: '{n} years old', address: 'Address', role: 'Role in family', adult: 'Adult', child: 'Child',
    noFamily: 'Not in a family yet', newFamily: 'New family…', familyName: 'Family name', familyMembers: 'Family',
    smsOptOut: 'No text messages', emailOptOut: 'No emails', optedOut: 'Opted out', contactPrefs: 'Contact',
    categoryHistory: 'Category history', setBy: 'by {who}', fromTo: '{from} → {to}', joined: 'Added as {to}',
    notes: 'Notes', addNote: 'Add a note', notePh: 'A call, a visit, a prayer request…', save: 'Save', cancel: 'Cancel', remove: 'Remove', del: 'Delete',
    noNotes: 'No notes yet.', attendance: 'Attendance', visits: '{n} visits', visits1: '1 visit', firstVisit: 'First visit {d}', noAttendance: 'No check-ins yet.',
    servesAs: 'Serves as', upcoming: 'Upcoming', notServing: 'Not on the serving team.', nothingScheduled: 'Nothing scheduled.',
    loading: 'Loading…', unknown: '—', saved: 'Saved', tapAgain: 'Tap again to confirm', confirmed: 'Confirmed', declined: 'Declined', awaiting: 'Awaiting reply',
    // categories editor
    catEditor: 'Categories', catEditorSub: 'Rename, reorder or add categories. A category in use can be hidden, not deleted.',
    nameEn: 'Name (English)', nameFr: 'Name (French)', hidden: 'Hidden', addCategory: 'Add category', inUse: '{n} people', inUse1: '1 person',
    // import
    familiesToCreate: '{n} new families',
    // messaging
    contact: 'Contact', contactN: 'Contact ({n})', contactShown: 'Contact all shown', contactTeam: 'Message this team', contactService: 'Message this service’s team',
    composeTitle: 'New message', to: 'To', channelEmail: 'Email', channelSms: 'Text (SMS)', channelBoth: 'Both',
    subject: 'Subject', message: 'Message', insertFirstName: 'Insert first name', mergeHint: '{first_name} becomes each person’s first name.',
    smsCount: '{chars} characters · {seg} text segment(s)', smsCount1: '{chars} characters · 1 text segment', unicode: 'Uses special characters (emoji, curly quotes, ê, ç…): each segment holds 70 instead of 160.',
    willGetSms: '{n} will get a text', willGetEmail: '{n} will get an email', skippedTitle: 'Won’t receive it',
    whyOptSms: 'Opted out of texts', whyOptEmail: 'Opted out of emails', whyNoPhone: 'No mobile number', whyNoEmail: 'No email address',
    notOnTeam: '{n} not on your team were left out (you can message your own team).', review: 'Review', backEdit: 'Back',
    confirmTitle: 'Ready to send?', confirmLine: 'Send to {people} people: {sms} texts and {email} emails.', confirmSegments: 'About {n} text segments in total.', sendNow: 'Send now',
    sending: 'Sending…', sentDone: 'Sent', sentSummary: '{sent} sent · {failed} failed · {skipped} skipped', viewSent: 'See sent messages', close: 'Close',
    sendError: 'Not sent: {msg}', retry: 'Try again', retrySafe: 'Trying again is safe: nobody gets it twice.', nobodyToSend: 'Nobody here can receive this message.',
    sentMessages: 'Sent messages', sentSub: 'Every email and text sent from ServiceSync, with what happened to each one.', noMessages: 'No messages sent yet.',
    statusSending: 'Sending', statusSent: 'Sent', statusPartial: 'Partly sent', statusFailed: 'Failed', statusDelivered: 'Delivered', statusSkipped: 'Skipped', statusQueued: 'Waiting',
    by: 'by {who}', recipients: 'Recipients', refresh: 'Refresh', allMessages: 'All messages', serviceReports: 'Service reports', activityLog: 'Activity log',
    // follow-ups
    followups: 'Follow-ups', followupsSub: 'Who to welcome, call and visit next. Newcomers are added automatically.', flow: 'Flow',
    onlyMine: 'Only mine', addToFlow: 'Add someone', editFlow: 'Edit steps', newFlow: 'New flow', activeN: '{n} in progress', overdueN: '{n} overdue', doneN: '{n} finished',
    due: 'Due {d}', dueToday: 'Due today', lateDays: '{n} days late', lateDays1: '1 day late', unassigned: 'Unassigned', assignTo: 'Assign to', dueDate: 'Due date',
    markDone: 'Done', doneTitle: 'Mark “{step}” done', doneNote: 'What happened? (saved on their timeline)', doneNext: 'Next: {step}', doneLast: 'This was the last step.',
    emptyStep: 'Nobody here.', noFlows: 'No follow-up flows yet.', noFlowsAsk: 'An administrator can set one up here.', myFollowups: 'My follow-ups', noMine: 'Nothing assigned to you. 🎉',
    followup: 'Follow-up', inFlow: '{flow}: {step}', addFollowup: 'Add to a follow-up', finished: 'Finished', choosePerson: 'Choose a person', whichFlow: 'Which follow-up',
    stepTitle: 'Step', titleEn: 'Title (English)', titleFr: 'Title (French)', defaultPerson: 'Default person', dueInDays: 'Due in (days)', addStep: 'Add step', flowName: 'Flow name',
    importFlows: 'Add imported Visitors to the Newcomer follow-up', notesField: 'Notes', seeAll: 'See all',
    dbUpdate: 'This needs a database update. Run {file} in Supabase, then reload.',
  },
  fr: {
    people: 'Personnes', everyone: 'Tout le monde', servingTeam: 'Équipe de service', teamsPositions: 'Équipes et postes',
    peopleSub: '{n} personnes dans l’annuaire de l’église', search: 'Rechercher par nom, téléphone ou courriel',
    category: 'Catégorie', allCategories: 'Toutes les catégories', language: 'Langue', anyLanguage: 'Toutes les langues',
    service: 'Culte', anyService: 'Tous les cultes', english: 'Anglais', french: 'Français', both: 'Les deux',
    attendedEn: 'Vient au culte anglais', attendedFr: 'Vient au culte français',
    lastAttended: 'Dernière présence', anyTime: 'N’importe quand', within2w: 'Ces 2 dernières semaines', within1m: 'Ce dernier mois', within3m: 'Ces 3 derniers mois',
    notIn1m: 'Pas depuis un mois', notIn3m: 'Pas depuis 3 mois', never: 'Jamais enregistré',
    phone: 'Téléphone', email: 'Courriel', hasPhone: 'A un téléphone', noPhone: 'Sans téléphone', hasEmail: 'A un courriel', noEmail: 'Sans courriel', any: 'Tous',
    clear: 'Effacer les filtres', savedFilters: 'Filtres enregistrés', saveFilter: 'Enregistrer le filtre', filterName: 'Nom du filtre', shareFilter: 'Partager avec l’équipe de service',
    deleteFilter: 'Supprimer', mine: 'Les miens', shared: 'Partagés',
    shown: '{n} affichés', selected: '{n} sélectionnés', selectAll: 'Tout sélectionner', clearSelection: 'Désélectionner',
    exportCsv: 'Exporter en CSV', setCategory: 'Changer la catégorie…', addPerson: 'Ajouter une personne', categories: 'Catégories',
    noMatch: 'Personne ne correspond à ces filtres.', noPeople: 'Personne pour l’instant. Importez-les depuis Elvanto dans l’onglet Check-in, ou ajoutez quelqu’un.',
    lastSeen: 'Dernière présence {d}', neverSeen: 'Pas encore enregistré', family: 'Famille',
    back: 'Personnes', details: 'Informations', edit: 'Modifier', firstName: 'Prénom', lastName: 'Nom', gender: 'Sexe', male: 'Homme', female: 'Femme',
    birthday: 'Date de naissance', age: '{n} ans', address: 'Adresse', role: 'Rôle dans la famille', adult: 'Adulte', child: 'Enfant',
    noFamily: 'Pas encore dans une famille', newFamily: 'Nouvelle famille…', familyName: 'Nom de la famille', familyMembers: 'Famille',
    smsOptOut: 'Pas de SMS', emailOptOut: 'Pas de courriels', optedOut: 'Désabonné', contactPrefs: 'Contact',
    categoryHistory: 'Historique des catégories', setBy: 'par {who}', fromTo: '{from} → {to}', joined: 'Ajouté comme {to}',
    notes: 'Notes', addNote: 'Ajouter une note', notePh: 'Un appel, une visite, un sujet de prière…', save: 'Enregistrer', cancel: 'Annuler', remove: 'Retirer', del: 'Supprimer',
    noNotes: 'Pas encore de notes.', attendance: 'Présence', visits: '{n} présences', visits1: '1 présence', firstVisit: 'Première visite le {d}', noAttendance: 'Aucune présence enregistrée.',
    servesAs: 'Sert comme', upcoming: 'À venir', notServing: 'Ne fait pas partie de l’équipe de service.', nothingScheduled: 'Rien de prévu.',
    loading: 'Chargement…', unknown: '—', saved: 'Enregistré', tapAgain: 'Touchez encore pour confirmer', confirmed: 'Confirmé', declined: 'Refusé', awaiting: 'En attente',
    catEditor: 'Catégories', catEditorSub: 'Renommez, réordonnez ou ajoutez des catégories. Une catégorie utilisée peut être masquée, pas supprimée.',
    nameEn: 'Nom (anglais)', nameFr: 'Nom (français)', hidden: 'Masquée', addCategory: 'Ajouter une catégorie', inUse: '{n} personnes', inUse1: '1 personne',
    familiesToCreate: '{n} nouvelles familles',
    contact: 'Contacter', contactN: 'Contacter ({n})', contactShown: 'Contacter tous les affichés', contactTeam: 'Écrire à cette équipe', contactService: 'Écrire à l’équipe de ce culte',
    composeTitle: 'Nouveau message', to: 'À', channelEmail: 'Courriel', channelSms: 'SMS', channelBoth: 'Les deux',
    subject: 'Objet', message: 'Message', insertFirstName: 'Insérer le prénom', mergeHint: '{first_name} est remplacé par le prénom de chaque personne.',
    smsCount: '{chars} caractères · {seg} segments SMS', smsCount1: '{chars} caractères · 1 segment SMS', unicode: 'Caractères spéciaux (emoji, guillemets, ê, ç…) : chaque segment contient 70 caractères au lieu de 160.',
    willGetSms: '{n} recevront un SMS', willGetEmail: '{n} recevront un courriel', skippedTitle: 'Ne le recevront pas',
    whyOptSms: 'Désabonnés des SMS', whyOptEmail: 'Désabonnés des courriels', whyNoPhone: 'Pas de numéro de portable', whyNoEmail: 'Pas d’adresse courriel',
    notOnTeam: '{n} personnes hors de votre équipe ont été retirées (vous pouvez écrire à votre équipe).', review: 'Vérifier', backEdit: 'Retour',
    confirmTitle: 'Prêt à envoyer ?', confirmLine: 'Envoyer à {people} personnes : {sms} SMS et {email} courriels.', confirmSegments: 'Environ {n} segments SMS au total.', sendNow: 'Envoyer',
    sending: 'Envoi…', sentDone: 'Envoyé', sentSummary: '{sent} envoyés · {failed} échoués · {skipped} ignorés', viewSent: 'Voir les messages envoyés', close: 'Fermer',
    sendError: 'Non envoyé : {msg}', retry: 'Réessayer', retrySafe: 'Vous pouvez réessayer sans risque : personne ne le recevra deux fois.', nobodyToSend: 'Personne ici ne peut recevoir ce message.',
    sentMessages: 'Messages envoyés', sentSub: 'Chaque courriel et SMS envoyé depuis ServiceSync, et ce qu’il est devenu.', noMessages: 'Aucun message envoyé pour l’instant.',
    statusSending: 'En cours', statusSent: 'Envoyé', statusPartial: 'Envoi partiel', statusFailed: 'Échec', statusDelivered: 'Remis', statusSkipped: 'Ignoré', statusQueued: 'En attente',
    by: 'par {who}', recipients: 'Destinataires', refresh: 'Actualiser', allMessages: 'Tous les messages', serviceReports: 'Rapports de culte', activityLog: 'Journal d’activité',
    followups: 'Suivis', followupsSub: 'Qui accueillir, appeler et visiter. Les nouveaux venus sont ajoutés automatiquement.', flow: 'Parcours',
    onlyMine: 'Seulement les miens', addToFlow: 'Ajouter quelqu’un', editFlow: 'Modifier les étapes', newFlow: 'Nouveau parcours', activeN: '{n} en cours', overdueN: '{n} en retard', doneN: '{n} terminés',
    due: 'Pour le {d}', dueToday: 'Pour aujourd’hui', lateDays: '{n} jours de retard', lateDays1: '1 jour de retard', unassigned: 'Non attribué', assignTo: 'Attribuer à', dueDate: 'Échéance',
    markDone: 'Fait', doneTitle: 'Marquer « {step} » comme fait', doneNote: 'Que s’est-il passé ? (enregistré dans son historique)', doneNext: 'Ensuite : {step}', doneLast: 'C’était la dernière étape.',
    emptyStep: 'Personne ici.', noFlows: 'Aucun parcours de suivi pour l’instant.', noFlowsAsk: 'Un administrateur peut en créer un ici.', myFollowups: 'Mes suivis', noMine: 'Rien ne vous est attribué. 🎉',
    followup: 'Suivi', inFlow: '{flow} : {step}', addFollowup: 'Ajouter à un suivi', finished: 'Terminé', choosePerson: 'Choisir une personne', whichFlow: 'Quel suivi',
    stepTitle: 'Étape', titleEn: 'Titre (anglais)', titleFr: 'Titre (français)', defaultPerson: 'Personne par défaut', dueInDays: 'Échéance (jours)', addStep: 'Ajouter une étape', flowName: 'Nom du parcours',
    importFlows: 'Ajouter les visiteurs importés au suivi des nouveaux venus', notesField: 'Notes', seeAll: 'Tout voir',
    dbUpdate: 'Une mise à jour de la base de données est nécessaire. Exécutez {file} dans Supabase, puis rechargez.',
  },
};

export const LANGS = ['en', 'fr'];
export const lang = () => (ui.lang === 'fr' ? 'fr' : 'en');
export const locale = () => (lang() === 'fr' ? 'fr-FR' : 'en-US');

/** Translate a key, filling {placeholders}. Falls back to English, then the key itself. */
export function t(key, vars = {}) {
  if (vars.n === 1 && (D[lang()][key + '1'] ?? D.en[key + '1'])) key += '1';   // singular forms: "1 person"
  const s = D[lang()][key] ?? D.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}
export const hasKey = key => key in D.en;
export const keys = l => Object.keys(D[l]);

/** A date in the current language: "Nov 1, 2026" / "1 nov. 2026". */
export const dateText = (isoDate, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), opts);
};
