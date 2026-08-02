/** 5 -> "5th", 1 -> "1st", 3 -> "3rd" — same ordinal-suffix rule the
 * registration form used, so the roster page reads the same way.
 *
 * Split out from lib/roster.ts (which pulls in Prisma) so client components
 * can import this pure function without dragging the database client into
 * the browser bundle.
 */
export function ordinalSemester(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
