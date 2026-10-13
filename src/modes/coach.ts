import { TOUCH } from '../ui/dom';
import { t } from '../i18n';

/**
 * The tutorial: on the first Meadow levels, short prompts that each wait for the player to
 * do the thing (move, cover a pad, undo) before the next one shows.
 */
export type CoachEvent = 'move' | 'goal' | 'undo';
interface Step {
  /** Looked up when shown (the language may change). */
  text: () => string;
  /** Shown once this many moves are made (default: at once). */
  after?: number;
  /** Done when this happens (or after `ms`). */
  until?: CoachEvent;
  ms?: number;
}

const STEPS: Record<string, Step[]> = {
  'meadow-1': [
    { text: () => t(TOUCH ? 'coach.moveTouch' : 'coach.moveKeys'), until: 'move' },
    { text: () => t('coach.push'), until: 'goal' },
  ],
  'meadow-2': [{ text: () => t('coach.undo', { key: TOUCH ? '↶' : 'Z' }), after: 2, until: 'undo', ms: 9000 }],
  'meadow-3': [{ text: () => t('coach.hint', { key: t(TOUCH ? 'coach.bulb' : 'coach.bulbKey') }), ms: 8000 }],
};

export class Coach {
  private steps: Step[] = [];
  private k = 0;
  private moves = 0;
  private shown = false;
  private timer = 0;

  constructor(private say: (text: string, ms: number) => void) {}

  /** Starts a level's prompts (none for most levels); returns true when there are some. */
  start(levelId: string, replay: boolean) {
    clearTimeout(this.timer);
    this.steps = replay ? [] : (STEPS[levelId] ?? []);
    this.k = 0;
    this.moves = 0;
    this.shown = false;
    this.maybeShow();
    return this.steps.length > 0;
  }

  on(e: CoachEvent) {
    if (e === 'move') this.moves++;
    const s = this.steps[this.k];
    if (!s) return;
    if (this.shown && s.until === e) this.next();
    else this.maybeShow();
  }

  private next() {
    clearTimeout(this.timer);
    this.k++;
    this.shown = false;
    this.maybeShow();
  }

  private maybeShow() {
    const s = this.steps[this.k];
    if (!s || this.shown || this.moves < (s.after ?? 0)) return;
    this.shown = true;
    this.say(s.text(), s.ms ?? 60000);
    if (s.ms) this.timer = window.setTimeout(() => this.next(), s.ms);
  }
}
