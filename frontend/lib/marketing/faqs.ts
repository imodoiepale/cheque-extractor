/* =========================================================================
   Homepage FAQ, shared with the FAQPage JSON-LD in app/page.tsx so the markup
   can never describe answers the page does not show. The 15 pairs are
   verbatim from the client's approved redesign site (kyriq-website-redesign,
   Sep 2026). This is customer-facing copy about
   billing and data handling: change it only with the client's sign-off.
   ========================================================================= */
export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does Kyriq do?',
    a: 'Upload the bank statement you already download and Kyriq extracts the checks from it. Kyriq then reads each check, compares every processed check with the corresponding QuickBooks Online transaction, and lets your team approve 100% matches together, review lower-confidence results individually, identify duplicates and discrepancies, and clear approved matches in the QBO reconciliation.',
  },
  {
    q: 'Should I use the extension or the web app?',
    a: 'Use the extension for day-to-day reconciling. It works beside QuickBooks so you can see the register and the matches together. Use the web app for setup and admin: adding users and companies, billing, usage, and reviewing the audit log. Both can run a full reconciliation.',
  },
  {
    q: 'Do I need another program to extract checks from my bank statement?',
    a: 'No. Upload your downloaded bank statement directly to Kyriq and Kyriq extracts the checks for you. This removes the separate extraction and re-upload steps. You may also upload individual check images when needed.',
  },
  {
    q: 'Does Kyriq display every processed check?',
    a: 'Yes. Every processed check remains visible. Use the 100% Matches view for exact matches, Needs Attention for results requiring a decision, and All Checks for the complete batch.',
  },
  {
    q: 'How does bulk approval work?',
    a: 'Kyriq groups checks that match their QuickBooks transactions with 100% confidence. An authorized user can review those checks individually or approve the entire 100% match group at once. Lower-confidence matches and discrepancies remain available for individual review.',
  },
  {
    q: 'Does Kyriq automatically clear checks in QuickBooks?',
    a: 'Nothing is cleared without user approval. After an authorized user approves a match, Kyriq clears the corresponding transaction in the QuickBooks reconciliation.',
  },
  {
    q: 'Can Kyriq process multiple checks on one page?',
    a: 'Yes. Kyriq supports PDF, JPG, and PNG files and can identify and process multiple checks appearing on the same uploaded page.',
  },
  {
    q: 'Can Kyriq read handwritten checks?',
    a: 'Yes. Kyriq can extract information from both typed and handwritten checks. Each result includes a confidence score, and lower-confidence information remains available for your team to review and approve before anything is cleared in QuickBooks.',
  },
  {
    q: 'Is the Kyriq Chrome extension included?',
    a: 'Yes. The Kyriq Chrome extension and web app are included with every paid plan and during the free trial. No separate extension purchase is required.',
  },
  {
    q: 'What counts toward my monthly check allowance?',
    a: 'A check counts when it is successfully processed from an upload. If the same check is uploaded and processed again, it counts again. System retries should not create duplicate usage.',
  },
  {
    q: 'What is included in the free trial?',
    a: 'The trial lasts 14 days or until 250 checks have been processed, whichever comes first. No credit card is required, and you can use the complete reconciliation workflow during the trial.',
  },
  {
    q: 'Are companies and team members limited?',
    a: 'No. Kyriq plans include unlimited QuickBooks companies and unlimited users. Pricing is based on the number of checks processed.',
  },
  {
    q: 'What happens when I exceed my plan allowance?',
    a: 'You can continue processing checks. Additional checks are billed automatically at your plan’s stated overage rate, and the included allowance resets at the beginning of each monthly usage cycle.',
  },
  {
    q: 'How do annual plans and cancellations work?',
    a: 'Annual plans are prepaid 12-month commitments and include the equivalent of one month free. You may cancel automatic renewal at any time, and service continues through the paid-through date. Monthly plans may be canceled at any time.',
  },
  {
    q: 'Which accounting platform does Kyriq support?',
    a: 'Kyriq currently connects with QuickBooks Online for transaction comparison and reconciliation clearing.',
  },
  {
    q: 'Where can I get help?',
    a: 'Email Kyriq Support at support@kyriq.com for help with your account, QuickBooks connection, uploads, reconciliation, or billing.',
  },
];
