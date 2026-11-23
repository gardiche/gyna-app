"use client";

/** Formulaire Notion des tickets (bug, idée, question). Notion refuse d'être affiché dans une autre page : on l'ouvre à côté. */
const TICKET_URL = "https://wry-gorilla-0ea.notion.site/41dca86a94e580a4a383fa31770b5a57";

/**
 * Bulle d'aide en bas à droite de chaque page : un clic ouvre le formulaire de ticket dans une petite fenêtre,
 * ou dans un nouvel onglet si le navigateur bloque les fenêtres.
 */
export function HelpBubble() {
  return (
    <a
      href={TICKET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="help-bubble"
      aria-label="Faire un ticket : un bug, une idée ou une question"
      onClick={(e) => {
        const w = window.open(TICKET_URL, "gyna-ticket", "popup,width=560,height=780");
        if (w) {
          w.opener = null;
          e.preventDefault();
        }
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
        <path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .8-1 1.6" />
        <path d="M12 16.4h.01" />
      </svg>
      <span className="help-bubble-label">Faire un ticket</span>
    </a>
  );
}
