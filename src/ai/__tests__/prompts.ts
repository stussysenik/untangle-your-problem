/**
 * Local dataset of brain-dump prompts used to exercise the generation core.
 * Each case spans a region of the signal space (mood / energy / domain / language)
 * plus an `expect` hint the runner uses for soft quality checks.
 */
export type PromptCase = {
  id: string;
  label: string;
  text: string;
  expect: {
    minItems: number;
    maxItems: number;
    /** Soft expectation — runner warns (not fails) when the model disagrees. */
    domain?: 'work' | 'personal' | 'mixed';
    language?: string;
  };
};

/**
 * Collapse the hard line-wraps in the literals below into a single flowing
 * paragraph. Real textarea input doesn't contain mid-sentence newlines, and the
 * model normalizes whitespace — so keeping them would make `sourceTrigger`
 * substring checks fail for a reason that has nothing to do with generation.
 */
const flow = (s: string): string => s.replace(/\s+/g, ' ').trim();

export const PROMPT_CASES: PromptCase[] = [
  {
    id: 'anxious-work',
    label: 'Anxious · work overload',
    text: flow(`ok so the quarterly report is due friday and I haven't even started the slides, plus
Sarah keeps pinging me about the budget numbers which I need to reconcile against the spreadsheet
from finance. also I promised to review Tom's PR yesterday and never did. and there's that
contractor invoice sitting in my inbox that legal needs me to approve. honestly I'm spiraling a bit.`),
    expect: { minItems: 4, maxItems: 7, domain: 'work', language: 'en' },
  },
  {
    id: 'overwhelmed-personal',
    label: 'Overwhelmed · personal life admin',
    text: flow(`my passport expires next month and I have a trip booked, need to renew it asap. the car is
making a weird noise so book a mechanic. mom's birthday is in two weeks and I have no idea what to
get her. the kitchen sink is still leaking. and I really should finally cancel that gym membership
I never use.`),
    // domain intentionally unconstrained — spans home/car/gift/health, legitimately ambiguous.
    expect: { minItems: 4, maxItems: 7, language: 'en' },
  },
  {
    id: 'motivated-mixed',
    label: 'Motivated · side-project + life',
    text: flow(`feeling good today! want to ship the landing page for my side project, just need to wire up
the contact form and deploy. also going to finally start that running plan — sign up for the 10k in
october. and I want to read more so I'll pick up the book that's been on my desk. let's go.`),
    expect: { minItems: 3, maxItems: 6, domain: 'mixed', language: 'en' },
  },
  {
    id: 'terse-short',
    label: 'Terse · minimal input',
    text: flow(`email landlord about lease. pay the electric bill. call dentist to reschedule.`),
    expect: { minItems: 3, maxItems: 4, domain: 'personal', language: 'en' },
  },
  {
    id: 'rambling-long',
    label: 'Rambling · long unstructured',
    text: flow(`so where do I even start, there's the website redesign that's been hanging over me forever and
the client wants a new logo concept by wednesday, meanwhile I told myself I'd get back into journaling
this week which hasn't happened, and the taxes — god, the taxes, I need to gather all the receipts and
send them to the accountant before the deadline. oh and I keep forgetting to schedule the annual physical
with my doctor. also the team offsite needs an agenda and nobody's volunteered to write it so I guess
that's me. and somewhere in here I'm supposed to be drinking more water.`),
    expect: { minItems: 5, maxItems: 7, domain: 'mixed', language: 'en' },
  },
  {
    id: 'non-english-es',
    label: 'Spanish · language detection',
    text: flow(`tengo que enviar el correo a mi jefe sobre las vacaciones, comprar comida para la cena de
mañana, llamar al banco para resolver el problema de la tarjeta, y terminar la presentación para el
lunes. estoy un poco abrumado con todo esto.`),
    expect: { minItems: 3, maxItems: 6, language: 'es' },
  },
];
