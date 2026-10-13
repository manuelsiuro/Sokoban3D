/** Time Trial: medal times from par, medals for times, and how times are written. */
import { formatTime, medalFor, medalTimes } from '../src/game/score';

const out: string[] = [];
for (const par of [3, 12, 40, 90]) {
  const [b, s, g] = medalTimes(par);
  out.push(`par ${String(par).padStart(2)}  gold ${formatTime(g)}  silver ${formatTime(s)}  bronze ${formatTime(b)}  medals ${[g, g + 1, s, s + 1, b, b + 1].map((ms) => medalFor(ms, par)).join('')}`);
}
out.push(`times ${[0, 950, 12340, 61000, 754300].map(formatTime).join(' ')}`);
console.log(out.join('\n'));
